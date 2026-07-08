package data

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/search"
	"github.com/kendaliai/app/internal/vector"
)

type Core struct {
	Data        *DataLayer
	Intelligence *IntelligenceLayer
	closeFuncs   []func() error
}

func NewCore(rootPath string) (*Core, error) {
	dl, err := NewSQLiteDataLayer(rootPath)
	if err != nil {
		return nil, fmt.Errorf("sqlite: %w", err)
	}

	se, err := search.NewBleveEngine(rootPath)
	if err != nil {
		dl.Close()
		return nil, fmt.Errorf("bleve: %w", err)
	}

	vs, err := vector.NewSQLiteLinearStore(rootPath)
	if err != nil {
		se.Close()
		dl.Close()
		return nil, fmt.Errorf("vector: %w", err)
	}

	var emb embedding.EmbeddingProvider
	if config.Cfg != nil && (config.Cfg.Embedding.APIKey != "" || (config.Cfg.DefaultChatProvider() != nil && config.Cfg.DefaultChatProvider().APIKey != "")) {
		emb = embedding.NewClient()
	}

	intel := NewIntelligenceLayer(rootPath, se, dl)

	return &Core{
		Data: &DataLayer{
			Sessions: &SessionService{db: dl},
			Goals:    &GoalService{db: dl},
			Memory: &MemoryService{
				Store:   dl,
				Vector:  vs,
				Embedder: emb,
			},
			Storage: dl,
			root:    rootPath,
		},
		Intelligence: intel,
		closeFuncs:   []func() error{dl.Close, se.Close, vs.Close},
	}, nil
}

func (c *Core) Close() error {
	for _, fn := range c.closeFuncs {
		if err := fn(); err != nil {
			return err
		}
	}
	return nil
}

func (c *Core) RootPath() string {
	return c.Data.root
}

func (c *Core) Reindex(ctx context.Context) error {
	return c.Intelligence.Reindex(ctx)
}

func (c *Core) ResolveSymbol(ctx context.Context, name string) ([]SymbolEntry, error) {
	results, err := c.Data.Storage.ResolveSymbol(ctx, name)
	if err != nil || len(results) == 0 {
		results, _ = c.Data.Storage.SearchSymbols(ctx, name)
	}
	return results, err
}

func (c *Core) SearchCode(ctx context.Context, query string, topK int) ([]search.SearchResult, error) {
	return c.Intelligence.Search.Search(ctx, query, topK)
}

func (c *Core) BuildContext(intent, goal string, files []string, contents map[string]string) string {
	return c.Intelligence.BuildContext(intent, goal, files, contents)
}

func (c *Core) MemoryStore(ctx context.Context, content, source string) (string, error) {
	return c.Data.Memory.StoreMemory(ctx, content, source)
}

func (c *Core) MemorySearch(ctx context.Context, query string, topK int) ([]vector.SearchResult, error) {
	return c.Data.Memory.SearchMemory(ctx, query, topK)
}

func (ms *MemoryService) StoreMemory(ctx context.Context, content, source string) (string, error) {
	if ms.Vector == nil || ms.Embedder == nil {
		return "", fmt.Errorf("vector store or embedder not configured")
	}

	vecs, err := ms.Embedder.Embed(ctx, []string{content})
	if err != nil {
		return "", fmt.Errorf("embed: %w", err)
	}
	if len(vecs) == 0 {
		return "", fmt.Errorf("no embedding returned")
	}

	id := "mem_" + hashContent(content)[:12]

	if err := ms.Vector.Upsert(ctx, []vector.Document{{
		ID: id, Content: content, Embedding: vecs[0],
		Metadata: map[string]string{"source": source},
	}}); err != nil {
		return "", fmt.Errorf("upsert: %w", err)
	}

	mem := &Memory{
		ID:          id,
		Content:     content,
		ContentHash: hashContent(content),
		Source:      source,
	}
	if err := ms.Store.StoreMemory(ctx, mem); err != nil {
		return "", fmt.Errorf("metadata: %w", err)
	}
	return id, nil
}

func (ms *MemoryService) SearchMemory(ctx context.Context, query string, topK int) ([]vector.SearchResult, error) {
	if ms.Vector == nil || ms.Embedder == nil {
		return nil, fmt.Errorf("vector store or embedder not configured")
	}
	vecs, err := ms.Embedder.Embed(ctx, []string{query})
	if err != nil {
		return nil, fmt.Errorf("embed: %w", err)
	}
	return ms.Vector.Search(ctx, vector.VectorQuery{
		Embedding: vecs[0], TopK: topK,
	})
}

func detectLang(ext string) string {
	switch ext {
	case ".go": return "go"
	case ".ts", ".tsx": return "typescript"
	case ".js", ".jsx": return "javascript"
	case ".py": return "python"
	case ".rs": return "rust"
	default: return ""
	}
}

func detectWorkspaceMeta(root string) *WorkspaceMeta {
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err == nil {
		return &WorkspaceMeta{
			ID: hashContent(root), RootPath: root, Framework: "Go",
			Language: "Go", BuildTool: "Go Modules",
			Entrypoints: findEntrypoints(root, []string{"cmd/*/main.go", "main.go"}),
			ConfigFiles: "go.mod",
		}
	}
	if _, err := os.Stat(filepath.Join(root, "Cargo.toml")); err == nil {
		return &WorkspaceMeta{
			ID: hashContent(root), RootPath: root, Framework: "Rust",
			Language: "Rust", BuildTool: "Cargo",
			Entrypoints: findEntrypoints(root, []string{"src/main.rs"}),
			ConfigFiles: "Cargo.toml",
		}
	}
	if _, err := os.Stat(filepath.Join(root, "requirements.txt")); err == nil {
		return &WorkspaceMeta{
			ID: hashContent(root), RootPath: root, Framework: "Python",
			Language: "Python", BuildTool: "pip",
			Entrypoints: findEntrypoints(root, []string{"main.py", "app.py"}),
			ConfigFiles: "requirements.txt",
		}
	}
	if pkg := readSimpleJSON(filepath.Join(root, "package.json")); pkg != nil {
		return &WorkspaceMeta{
			ID: hashContent(root), RootPath: root, Framework: "Node.js",
			Language: "TypeScript", BuildTool: "npm",
			Entrypoints: findEntrypoints(root, []string{"src/index.ts", "src/main.tsx", "src/App.tsx", "index.ts"}),
			ConfigFiles: "package.json",
		}
	}
	return nil
}

func findEntrypoints(root string, patterns []string) string {
	var found []string
	for _, p := range patterns {
		matches, _ := filepath.Glob(filepath.Join(root, p))
		for _, m := range matches {
			rel, _ := filepath.Rel(root, m)
			found = append(found, rel)
		}
	}
	return joinStrings(found, ",")
}

func joinStrings(items []string, sep string) string {
	result := ""
	for i, item := range items {
		if i > 0 { result += sep }
		result += item
	}
	return result
}

func readSimpleJSON(path string) map[string]interface{} {
	data, err := os.ReadFile(path)
	if err != nil { return nil }
	var result map[string]interface{}
	fmt.Sscanf(string(data), "%v", &result)
	return result
}
