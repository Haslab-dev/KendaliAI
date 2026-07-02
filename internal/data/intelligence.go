package data

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/search"
)

type IntelligenceLayer struct {
	Search   *SearchService
	Context  *ContextService
	Index    *IndexService
	Graph    *WorkspaceGraph
	Snapshot *WorkspaceSnapshot
	Recipes  *RecipeRegistry
}

type SearchService struct {
	Engine search.SearchEngine
}

type ContextService struct {
	Builder *ContextBuilder
}

type IndexService struct {
	Data   *SQLiteDataLayer
	Search search.SearchEngine
	root   string
}

type WorkspaceGraph struct {
	root       string
	framework  string

	Import      *ImportSubgraph
	Symbol      *SymbolSubgraph
	Component   *ComponentSubgraph
	Route       *RouteSubgraph
	Dependency  *DependencySubgraph
	FileIndex   map[string]*FileNode
}

type ImportSubgraph struct {
	edges map[string][]string
}

type SymbolSubgraph struct {
	index map[string][]SymbolLocation
}

type ComponentSubgraph struct {
	tree     map[string][]string
	flatList []string
}

type RouteSubgraph struct {
	routes []RouteInfo
}

type DependencySubgraph struct {
	deps map[string][]string
}

type WorkspaceSnapshot struct {
	Framework      string            `json:"framework"`
	PackageManager string            `json:"package_manager"`
	EntryFiles     []string          `json:"entry_files"`
	Routes         []RouteInfo       `json:"routes"`
	Components     []string          `json:"components"`
	Dependencies   map[string]string `json:"dependencies"`
	BuildSystem    string            `json:"build_system"`
	TestCommand    string            `json:"test_command"`
	GitBranch      string            `json:"git_branch,omitempty"`
	LastEdited     []string          `json:"last_edited"`
	FileCount      int               `json:"file_count"`
	SymbolCount    int               `json:"symbol_count"`
}

func NewIntelligenceLayer(root string, se search.SearchEngine, storage *SQLiteDataLayer) *IntelligenceLayer {
	wg := NewWorkspaceGraph(root)
	snapshot := &WorkspaceSnapshot{}
	recipes := DefaultRecipes()

	return &IntelligenceLayer{
		Search: &SearchService{
			Engine: se,
		},
		Context: &ContextService{
			Builder: NewContextBuilder(32000),
		},
		Index: &IndexService{
			Data:  storage,
			Search: se,
			root:  root,
		},
		Graph:    wg,
		Snapshot: snapshot,
		Recipes:  recipes,
	}
}

func NewWorkspaceGraph(root string) *WorkspaceGraph {
	return &WorkspaceGraph{
		root:       root,
		Import:     &ImportSubgraph{edges: map[string][]string{}},
		Symbol:     &SymbolSubgraph{index: map[string][]SymbolLocation{}},
		Component:  &ComponentSubgraph{tree: map[string][]string{}},
		Route:      &RouteSubgraph{},
		Dependency: &DependencySubgraph{deps: map[string][]string{}},
		FileIndex:  map[string]*FileNode{},
	}
}

func (il *IntelligenceLayer) Reindex(ctx context.Context) error {
	return il.Index.Reindex(ctx, il.Graph)
}

func (wsg *WorkspaceGraph) FindFile(pattern string) []string {
	var results []string
	lower := strings.ToLower(pattern)
	for path := range wsg.FileIndex {
		if strings.Contains(strings.ToLower(path), lower) {
			results = append(results, path)
		}
	}
	return results
}

func (wsg *WorkspaceGraph) FindComponent(name string) []SymbolLocation {
	if locs, ok := wsg.Symbol.index[name]; ok {
		return locs
	}
	var results []SymbolLocation
	for _, locs := range wsg.Symbol.index {
		for _, loc := range locs {
			if strings.Contains(strings.ToLower(loc.Name), strings.ToLower(name)) {
				results = append(results, loc)
			}
		}
	}
	return results
}

func (wsg *WorkspaceGraph) GetImportsOf(file string) []string {
	return wsg.Import.edges[file]
}

func (wsg *WorkspaceGraph) GetImportedBy(file string) []string {
	var result []string
	for from, tos := range wsg.Import.edges {
		for _, to := range tos {
			if to == file {
				result = append(result, from)
			}
		}
	}
	return result
}

func (wsg *WorkspaceGraph) TraceDownwards(entry string) []string {
	visited := map[string]bool{}
	var result []string
	wsg.traceDown(entry, visited, &result)
	return result
}

func (wsg *WorkspaceGraph) traceDown(file string, visited map[string]bool, result *[]string) {
	if visited[file] {
		return
	}
	visited[file] = true
	*result = append(*result, file)
	for _, imp := range wsg.Import.edges[file] {
		wsg.traceDown(imp, visited, result)
	}
}

func (wsg *WorkspaceGraph) SymbolCount() int {
	return len(wsg.Symbol.index)
}

func (wsg *WorkspaceGraph) FileCount() int {
	return len(wsg.FileIndex)
}

func (il *IntelligenceLayer) BuildContext(intent, goal string, files []string, contents map[string]string) string {
	recipe := il.Recipes.Resolve(intent)
	return il.Context.BuildWithRecipe(goal, files, contents, recipe, il.Graph)
}

func (ss *SearchService) Search(ctx context.Context, query string, topK int) ([]search.SearchResult, error) {
	return ss.Engine.Search(ctx, search.SearchQuery{Query: query, TopK: topK})
}

func (is *IndexService) Reindex(ctx context.Context, graph *WorkspaceGraph) error {
	if err := is.indexAllFiles(ctx); err != nil {
		return err
	}
	wsMeta := detectWorkspaceMeta(is.root)
	if wsMeta != nil {
		is.Data.SaveWorkspace(ctx, wsMeta)

		symbols, _ := is.Data.ResolveSymbol(ctx, "")
		if len(symbols) == 0 {
			symbols, _ = is.Data.SearchSymbols(ctx, "")
		}
		imports, _ := is.Data.GetImports(ctx, "")
		graph.MaterializeFromDB(symbols, imports, wsMeta.Framework)
	}
	return nil
}

func (is *IndexService) indexAllFiles(ctx context.Context) error {
	skipPaths := map[string]bool{
		"node_modules": true, ".git": true, "dist": true, "build": true,
		"target": true, ".next": true, "__pycache__": true, "vendor": true,
		".kendaliai": true,
	}

	return filepath.Walk(is.root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if skipPaths[info.Name()] || (len(info.Name()) > 0 && info.Name()[0] == '.') {
				return filepath.SkipDir
			}
			return nil
		}
		if info.Size() > 500*1024 {
			return nil
		}
		ext := filepath.Ext(path)
		allowed := map[string]bool{
			".go": true, ".ts": true, ".tsx": true, ".js": true, ".jsx": true,
			".py": true, ".rs": true, ".md": true, ".yaml": true, ".yml": true,
			".json": true, ".toml": true,
		}
		if !allowed[ext] {
			return nil
		}
		rel, _ := filepath.Rel(is.root, path)
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		content := string(data)
		if len(content) > 50000 {
			content = content[:50000]
		}
		is.Data.IndexFile(ctx, rel, content, "")
		if is.Search != nil {
			is.Search.Index(ctx, search.SearchDocument{
				ID: rel, Path: rel, Content: content,
				Language: detectLang(ext),
			})
		}
		return nil
	})
}

func (cs *ContextService) BuildWithRecipe(goal string, files []string, contents map[string]string, recipe RecipePolicy, graph *WorkspaceGraph) string {
	builder := NewContextBuilder(recipe.TokenBudget)
	builder.SetGoal(goal)
	builder.SetWorkingSet(files)

	for _, f := range files {
		if recipe.IncludeCode && contents[f] != "" {
			builder.AddCode(f, contents[f])
		}
	}

	if graph != nil && graph.framework != "" {
		info := fmt.Sprintf("Framework: %s | Files: %d | Symbols: %d",
			graph.framework, len(graph.FileIndex), len(graph.Symbol.index))
		builder.SetRepoMeta(info)
	}

	return builder.Build()
}

func (il *IntelligenceLayer) TakeSnapshot() *WorkspaceSnapshot {
	s := il.Snapshot

	s.Framework = il.Graph.framework
	s.FileCount = len(il.Graph.FileIndex)
	s.SymbolCount = len(il.Graph.Symbol.index)

	var components []string
	for _, children := range il.Graph.Component.tree {
		components = append(components, children...)
	}
	s.Components = components

	s.Routes = il.Graph.Route.routes

	return s
}

func (il *IntelligenceLayer) InvalidateFile(ctx context.Context, path string) {
	delete(il.Graph.FileIndex, path)
	delete(il.Graph.Import.edges, path)
	for name, locs := range il.Graph.Symbol.index {
		filtered := locs[:0]
		for _, loc := range locs {
			if loc.File != path {
				filtered = append(filtered, loc)
			}
		}
		if len(filtered) == 0 {
			delete(il.Graph.Symbol.index, name)
		} else {
			il.Graph.Symbol.index[name] = filtered
		}
	}
}

func (wsg *WorkspaceGraph) MaterializeFromDB(symbols []SymbolEntry, imports []ImportEdge, framework string) {
	wsg.framework = framework

	for _, s := range symbols {
		rel := s.File
		if wsg.FileIndex[rel] == nil {
			wsg.FileIndex[rel] = &FileNode{Path: rel, Imports: []string{}}
		}
		wsg.FileIndex[rel].Exports = append(wsg.FileIndex[rel].Exports, s.Name)

		wsg.Symbol.index[s.Name] = append(wsg.Symbol.index[s.Name], SymbolLocation{
			Name: s.Name, File: rel, Line: s.Line,
		})

		if s.Kind == "component" {
			wsg.Component.tree[rel] = append(wsg.Component.tree[rel], s.Name)
		}
	}

	for _, imp := range imports {
		if wsg.FileIndex[imp.FromFile] == nil {
			wsg.FileIndex[imp.FromFile] = &FileNode{Path: imp.FromFile, Imports: []string{}}
		}
		wsg.FileIndex[imp.FromFile].Imports = append(wsg.FileIndex[imp.FromFile].Imports, imp.ToFile)
		wsg.Import.edges[imp.FromFile] = append(wsg.Import.edges[imp.FromFile], imp.ToFile)
	}
}

func (il *IntelligenceLayer) StoreEvent(ctx context.Context, event string) {
	if il.Snapshot.LastEdited == nil {
		il.Snapshot.LastEdited = []string{}
	}
	il.Snapshot.LastEdited = append([]string{event}, il.Snapshot.LastEdited...)
	if len(il.Snapshot.LastEdited) > 20 {
		il.Snapshot.LastEdited = il.Snapshot.LastEdited[:20]
	}
}

type RecipePolicy struct {
	Name              string `json:"name"`
	MaxFiles          int    `json:"max_files"`
	IncludeCode       bool   `json:"include_code"`
	IncludeImports    bool   `json:"include_imports"`
	IncludeSummaries  bool   `json:"include_summaries"`
	UseSemanticSearch bool   `json:"use_semantic_search"`
	UseLexicalSearch  bool   `json:"use_lexical_search"`
	TokenBudget       int    `json:"token_budget"`
	IncludeRecentEdits bool  `json:"include_recent_edits"`
	PrefixBudget      int    `json:"prefix_budget"`
	WorkspaceBudget   int    `json:"workspace_budget"`
	RetrievalBudget   int    `json:"retrieval_budget"`
	FileBudget        int    `json:"file_budget"`
	ConversationBudget int   `json:"conversation_budget"`
}

type RecipeRegistry struct {
	policies map[string]RecipePolicy
}

func DefaultRecipes() *RecipeRegistry {
	return &RecipeRegistry{
		policies: map[string]RecipePolicy{
			"ui_generation": {Name: "ui_generation", MaxFiles: 6, IncludeCode: true, IncludeImports: true, TokenBudget: 6000, PrefixBudget: 1200, WorkspaceBudget: 400, RetrievalBudget: 600, FileBudget: 3200, ConversationBudget: 600},
			"code_edit":     {Name: "code_edit", MaxFiles: 4, IncludeCode: true, IncludeImports: true, UseSemanticSearch: true, TokenBudget: 4000, PrefixBudget: 1200, WorkspaceBudget: 400, RetrievalBudget: 800, FileBudget: 1200, ConversationBudget: 400},
			"bug_fix":       {Name: "bug_fix", MaxFiles: 6, IncludeCode: true, IncludeImports: true, UseSemanticSearch: true, UseLexicalSearch: true, TokenBudget: 5000, PrefixBudget: 1200, WorkspaceBudget: 400, RetrievalBudget: 1000, FileBudget: 1800, ConversationBudget: 600},
			"analysis":      {Name: "analysis", MaxFiles: 20, IncludeCode: false, IncludeSummaries: true, UseLexicalSearch: true, TokenBudget: 8000, PrefixBudget: 1200, WorkspaceBudget: 400, RetrievalBudget: 2000, FileBudget: 3400, ConversationBudget: 1000},
			"deployment":    {Name: "deployment", MaxFiles: 8, IncludeCode: false, IncludeSummaries: true, TokenBudget: 4000, PrefixBudget: 1200, WorkspaceBudget: 400, RetrievalBudget: 600, FileBudget: 1200, ConversationBudget: 600},
			"refactor":      {Name: "refactor", MaxFiles: 8, IncludeCode: true, IncludeImports: true, UseSemanticSearch: true, TokenBudget: 6000, PrefixBudget: 1200, WorkspaceBudget: 400, RetrievalBudget: 1000, FileBudget: 2400, ConversationBudget: 1000},
			"general":       {Name: "general", MaxFiles: 5, IncludeCode: true, IncludeImports: false, TokenBudget: 3000, PrefixBudget: 1200, WorkspaceBudget: 400, RetrievalBudget: 400, FileBudget: 800, ConversationBudget: 200},
		},
	}
}

func (rr *RecipeRegistry) Resolve(intent string) RecipePolicy {
	if policy, ok := rr.policies[intent]; ok {
		return policy
	}
	return rr.policies["general"]
}
