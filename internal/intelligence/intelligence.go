package intelligence

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Engine struct {
	repoDB       *RepoDB
	root         string
	info         *ProjectInfo
	workingSet   *WorkingSet
	stateMachine *StateMachine
	semanticCache *SemanticCache
	editPlanner  *EditPlanner
}

func NewEngine(rootPath string) (*Engine, error) {
	repoDB, err := OpenRepoDB(rootPath)
	if err != nil {
		return nil, fmt.Errorf("open repo db: %w", err)
	}

	info := DetectProject(rootPath)
	if info != nil {
		repoDB.StoreProjectInfo(info)
	} else {
		info = repoDB.LoadProjectInfo()
		if info == nil {
			info = &ProjectInfo{Framework: "Unknown", Language: "Unknown"}
		}
	}

	return &Engine{
		repoDB:        repoDB,
		root:          rootPath,
		info:          info,
		stateMachine:  NewStateMachine(10),
		semanticCache: NewSemanticCache(repoDB),
		editPlanner:   NewEditPlanner(rootPath),
	}, nil
}

func (e *Engine) AnalyzeProject() *ProjectInfo {
	return e.info
}

func (e *Engine) AnalyzeFull() ([]SymbolEntry, []ImportEdge) {
	info := e.AnalyzeProject()

	infoCache := e.repoDB.LoadProjectInfo()
	if infoCache != nil && infoCache.Framework == info.Framework {
		return nil, nil
	}

	symbols := ExtractSymbols(e.root)
	if len(symbols) > 0 {
		e.repoDB.IndexSymbols(symbols)
	}

	imports := ExtractImports(e.root)
	if len(imports) > 0 {
		e.repoDB.StoreImports(imports)
	}

	return symbols, imports
}

func (e *Engine) BuildWorkingSet(sessionID, query string) *WorkingSet {
	builder := NewWorkingSetBuilder(e.repoDB, e.root, e.info)
	ws := builder.Build(sessionID, query)
	e.workingSet = ws
	e.stateMachine.WorkingSet = ws
	return ws
}

func (e *Engine) GetWorkingSet() *WorkingSet {
	return e.workingSet
}

func (e *Engine) GetFileContents(files []string) map[string]string {
	contents := map[string]string{}
	for _, f := range files {
		abs := filepath.Join(e.root, f)
		content, err := ReadFileContent(abs, 100*1024)
		if err != nil {
			continue
		}
		contents[f] = content
		e.repoDB.CacheFile(abs, content)
	}
	return contents
}

func (e *Engine) ResolveSymbol(name string) []SymbolEntry {
	return e.repoDB.ResolveSymbol(name)
}

func (e *Engine) SearchSymbol(partial string) []SymbolEntry {
	return e.repoDB.SearchSymbol(partial)
}

func (e *Engine) GetImportsOf(file string) []ImportEdge {
	return e.repoDB.GetImportsOf(file)
}

func (e *Engine) SummarizeFiles(files []string) []*FileSummary {
	var summaries []*FileSummary
	for _, f := range files {
		abs := filepath.Join(e.root, f)
		summary := SummarizeFile(abs, e.root, e.info)
		if summary != nil {
			e.repoDB.UpdateFileSummary(f, summary.Format())
			summaries = append(summaries, summary)
		}
	}
	return summaries
}

func (e *Engine) FormatAnalysisJSON() string {
	type result struct {
		Framework   string   `json:"framework"`
		Language    string   `json:"language"`
		BuildTool   string   `json:"build_tool"`
		CSS         string   `json:"css"`
		Routing     string   `json:"routing"`
		Entrypoints []string `json:"entrypoints"`
		SourceFiles []string `json:"source_files"`
		Components  []string `json:"components,omitempty"`
	}

	r := result{
		Framework:   e.info.Framework,
		Language:    e.info.Language,
		BuildTool:   e.info.BuildTool,
		CSS:         e.info.CSS,
		Routing:     e.info.Routing,
		Entrypoints: relativizePaths(e.root, e.info.Entrypoints),
		SourceFiles: scanSourceFiles(e.root),
	}

	var components []string
	componentFiles := findComponentFiles(e.root, e.info)
	for _, cf := range componentFiles {
		abs := filepath.Join(e.root, cf)
		summary := SummarizeFile(abs, e.root, e.info)
		if summary != nil {
			components = append(components, summary.Components...)
		}
	}
	if len(components) > 0 {
		r.Components = deduplicateStrs(components)
	}

	b, _ := json.MarshalIndent(r, "", "  ")
	return string(b)
}

func (e *Engine) FormatWorkingSetForPrompt() string {
	return FormatWorkingSetContext(e.workingSet.Files, e.GetFileContents(e.workingSet.Files))
}

func (e *Engine) FormatFilesForContext(files []string, contents map[string]string) string {
	var sb strings.Builder
	sb.WriteString("CONTEXT FILES:\n\n")
	for _, f := range files {
		rel := f
		if abs, err := filepath.Abs(filepath.Join(e.root, f)); err == nil {
			if r, err := filepath.Rel(e.root, abs); err == nil {
				rel = r
			}
		}
		summary := e.repoDB.GetFileCache(rel)
		sb.WriteString(fmt.Sprintf("### %s", rel))
		if summary != nil && summary.Summary != "" {
			sb.WriteString(fmt.Sprintf("\nSummary: %s", summary.Summary))
		}
		if content, ok := contents[rel]; ok {
			sb.WriteString(fmt.Sprintf("\n```\n%s\n```\n\n", truncate(content, 3000)))
		} else {
			sb.WriteString("\n\n")
		}
	}
	return sb.String()
}

func (e *Engine) GetRepoDB() *RepoDB {
	return e.repoDB
}

func (e *Engine) GetStateMachine() *StateMachine {
	return e.stateMachine
}

func (e *Engine) GetSemanticCache() *SemanticCache {
	return e.semanticCache
}

func (e *Engine) GetEditPlanner() *EditPlanner {
	return e.editPlanner
}

func (e *Engine) Close() error {
	return e.repoDB.Close()
}

func (e *Engine) RootPath() string {
	return e.root
}

func (e *Engine) ProjectInfo() *ProjectInfo {
	return e.info
}

func (e *Engine) CacheFiles(files []string) {
	CacheFiles(e.repoDB, e.root, files)
}

func (e *Engine) IsIndexed() bool {
	info := e.repoDB.LoadProjectInfo()
	return info != nil && info.Framework != "Unknown" && len(info.Entrypoints) > 0
}

func (e *Engine) LookupPlan(goal string) (dag string, toolSeq string, found bool) {
	goalHash := hashGoal(goal)
	return e.repoDB.LookupPlan(goalHash)
}

func (e *Engine) StorePlan(goal string, dag, toolSeq, expectedOutputs string) {
	goalHash := hashGoal(goal)
	e.repoDB.StorePlan(goal, goalHash, dag, toolSeq, expectedOutputs, e.info.Framework, "")
}

func (e *Engine) Verify(ctx context.Context, sessionID string) *VerificationResult {
	vp := NewVerificationPipeline(e.root, e.info, sessionID)
	return vp.Run(ctx)
}

func (e *Engine) StoreExecution(entry *ExecutionCacheEntry) {
	e.repoDB.StoreExecution(entry)
}

func (e *Engine) LookupSimilarExecution(goal string) *ExecutionCacheEntry {
	return e.repoDB.LookupSimilarExecution(goal)
}

func (e *Engine) CheckAndInvalidateStaleCaches() {
	if e.repoDB.IsRepositoryCacheStale() {
		e.repoDB.InvalidateRepositoryCache()
		e.repoDB.InvalidatePlanCacheForFramework(e.info.Framework)
	}

	for _, f := range e.info.Entrypoints {
		abs := filepath.Join(e.root, f)
		changed, _ := e.repoDB.IsFileChanged(abs)
		if changed {
			e.repoDB.InvalidateFileCache(f)
		}
	}
}

func (e *Engine) CompileContext(query string, workingSet *WorkingSet, fileContents map[string]string) string {
	var ctx strings.Builder

	ctx.WriteString(fmt.Sprintf("GOAL: %s\n\n", query))

	if workingSet != nil && len(workingSet.Files) > 0 {
		ctx.WriteString(FormatWorkingSetContext(workingSet.Files, fileContents))
		ctx.WriteString("\n")
	}

	if e.info != nil {
		ctx.WriteString("REPOSITORY METADATA:\n")
		ctx.WriteString(fmt.Sprintf("  Framework: %s | Language: %s | Build: %s | CSS: %s | Routing: %s\n\n",
			e.info.Framework, e.info.Language, e.info.BuildTool, e.info.CSS, e.info.Routing))
	}

	if len(fileContents) > 0 {
		ctx.WriteString("FILE SUMMARIES:\n")
		for _, f := range workingSet.Files {
			cache := e.repoDB.GetFileCache(f)
			if cache != nil && cache.Summary != "" {
				ctx.WriteString(fmt.Sprintf("  %s: %s\n", f, cache.Summary))
			}
		}
		ctx.WriteString("\n")
	}

	if len(fileContents) > 0 {
		ctx.WriteString("RELEVANT CODE:\n")
		count := 0
		for _, f := range workingSet.Files {
			if content, ok := fileContents[f]; ok && count < 3 {
				ctx.WriteString(fmt.Sprintf("### %s\n```\n%s\n```\n\n", f, truncate(content, 2000)))
				count++
			}
		}
	}

	return ctx.String()
}

func hashGoal(goal string) string {
	h := sha256.Sum256([]byte(goal))
	return hex.EncodeToString(h[:])
}

func findComponentFiles(root string, info *ProjectInfo) []string {
	var files []string

	patterns := []string{
		"src/components/**/*.tsx",
		"src/components/**/*.jsx",
		"components/**/*.tsx",
		"components/**/*.jsx",
		"app/components/**/*.tsx",
		"app/components/**/*.jsx",
		"src/**/*.tsx",
		"src/**/*.jsx",
		"src/**/*.vue",
	}

	for _, pattern := range patterns {
		matches, _ := filepath.Glob(filepath.Join(root, pattern))
		for _, m := range matches {
			if !strings.Contains(m, "node_modules") && !strings.Contains(m, ".test.") && !strings.Contains(m, ".spec.") {
				files = append(files, m)
			}
		}
	}

	return files
}

func deduplicateStrs(items []string) []string {
	seen := map[string]bool{}
	var result []string
	for _, item := range items {
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	return result
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "\n...(truncated)"
}

func relativizePaths(root string, paths []string) []string {
	var result []string
	for _, p := range paths {
		rel, err := filepath.Rel(root, p)
		if err == nil {
			result = append(result, rel)
		} else {
			result = append(result, p)
		}
	}
	return result
}

func scanSourceFiles(root string) []string {
	var files []string
	exts := map[string]bool{
		".tsx": true, ".jsx": true, ".ts": true, ".js": true,
		".css": true, ".html": true, ".vue": true,
	}

	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			name := info.Name()
			if name == "node_modules" || name == ".git" || name == "dist" ||
				name == "build" || name == ".next" || name == "assets" ||
				strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		ext := filepath.Ext(info.Name())
		if exts[ext] && !strings.Contains(path, "node_modules") {
			rel, err := filepath.Rel(root, path)
			if err == nil {
				files = append(files, rel)
			}
		}
		return nil
	})

	return files
}
