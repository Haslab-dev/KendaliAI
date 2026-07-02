package intelligence

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type WorkingSetBuilder struct {
	repoDB *RepoDB
	root   string
	info   *ProjectInfo
}

func NewWorkingSetBuilder(repoDB *RepoDB, root string, info *ProjectInfo) *WorkingSetBuilder {
	return &WorkingSetBuilder{repoDB: repoDB, root: root, info: info}
}

func (wsb *WorkingSetBuilder) Build(sessionID, query string) *WorkingSet {
	ws := &WorkingSet{
		SessionID: sessionID,
		Goal:      query,
		Intent:    classifyIntent(query),
		CreatedAt: time.Now(),
	}

	files := wsb.selectWorkingSet(ws.Intent, query)
	ws.Files = deduplicateFiles(files)

	if wsb.repoDB != nil {
		wsb.repoDB.SaveWorkingSet(ws)
	}
	return ws
}

func (wsb *WorkingSetBuilder) selectWorkingSet(intent, query string) []string {
	var files []string
	queryLower := strings.ToLower(query)

	switch intent {
	case "ui_generation":
		files = wsb.getUIWorkingSet(queryLower)
	case "code_edit":
		files = wsb.getCodeEditWorkingSet(queryLower)
	case "analysis":
		files = wsb.getAnalysisWorkingSet(queryLower)
	case "deployment":
		files = wsb.getDeploymentWorkingSet(queryLower)
	default:
		files = wsb.getGeneralWorkingSet(queryLower)
	}

	if wsb.info != nil {
		for _, ep := range wsb.info.Entrypoints {
			if _, err := os.Stat(ep); err == nil {
				files = append(files, ep)
			}
		}
		for _, cf := range wsb.info.ConfigFiles {
			files = append(files, cf)
		}
	}

	if wsb.repoDB != nil {
		for _, symbolName := range extractKeywords(queryLower) {
			entries := wsb.repoDB.SearchSymbol(symbolName)
			for _, e := range entries {
				files = append(files, e.File)
			}
		}
	}

	return files
}

func (wsb *WorkingSetBuilder) getUIWorkingSet(query string) []string {
	var files []string

	files = append(files, "package.json")

	switch {
	case strings.Contains(query, "hero"):
		heroFiles := []string{
			"src/components/Hero.tsx", "src/components/Hero.jsx",
			"src/components/hero.tsx", "src/components/hero.jsx",
			"components/Hero.tsx", "components/Hero.jsx",
			"app/components/Hero.tsx", "app/components/Hero.jsx",
		}
		files = append(files, findExisting(wsb.root, heroFiles)...)
	case strings.Contains(query, "navbar") || strings.Contains(query, "nav"):
		navFiles := []string{
			"src/components/Navbar.tsx", "src/components/Navbar.jsx",
			"src/components/navbar.tsx", "src/components/navbar.jsx",
			"components/Navbar.tsx", "components/Navbar.jsx",
		}
		files = append(files, findExisting(wsb.root, navFiles)...)
	case strings.Contains(query, "footer"):
		footerFiles := []string{
			"src/components/Footer.tsx", "src/components/Footer.jsx",
			"src/components/footer.tsx", "src/components/footer.jsx",
			"components/Footer.tsx", "components/Footer.jsx",
		}
		files = append(files, findExisting(wsb.root, footerFiles)...)
	case strings.Contains(query, "pricing"):
		pricingFiles := []string{
			"src/components/Pricing.tsx", "src/components/Pricing.jsx",
			"src/components/pricing.tsx", "src/components/pricing.jsx",
			"components/Pricing.tsx", "components/Pricing.jsx",
		}
		files = append(files, findExisting(wsb.root, pricingFiles)...)
	}

	entryFiles := []string{
		"src/App.tsx", "src/App.jsx", "App.tsx", "App.jsx",
		"src/main.tsx", "src/main.jsx", "main.tsx", "main.jsx",
		"index.html",
		"src/index.tsx", "src/index.jsx",
	}
	files = append(files, findExisting(wsb.root, entryFiles)...)

	return files
}

func (wsb *WorkingSetBuilder) getCodeEditWorkingSet(query string) []string {
	var files []string

	if wsb.repoDB != nil {
		for _, kw := range extractKeywords(query) {
			entries := wsb.repoDB.SearchSymbol(kw)
			for _, e := range entries {
				files = append(files, e.File)
				imports := wsb.repoDB.GetImportsOf(e.File)
				for _, imp := range imports {
					resolved := ResolveImportPath(e.File, imp.ToFile, wsb.root)
					if resolved != "" {
						files = append(files, resolved)
					}
				}
			}
		}
	}

	return files
}

func (wsb *WorkingSetBuilder) getAnalysisWorkingSet(query string) []string {
	var files []string
	configFiles := []string{"package.json", "go.mod", "Cargo.toml", "requirements.txt", "pyproject.toml", "README.md", "Makefile"}
	for _, cf := range configFiles {
		if _, err := os.Stat(filepath.Join(wsb.root, cf)); err == nil {
			files = append(files, cf)
		}
	}
	return files
}

func (wsb *WorkingSetBuilder) getDeploymentWorkingSet(query string) []string {
	var files []string
	deployFiles := []string{
		"Dockerfile", "docker-compose.yml", "docker-compose.yaml",
		"Makefile", ".github/workflows", ".gitlab-ci.yml",
		"package.json", "go.mod", "Cargo.toml",
	}
	for _, df := range deployFiles {
		if _, err := os.Stat(filepath.Join(wsb.root, df)); err == nil {
			files = append(files, df)
		}
	}
	return files
}

func (wsb *WorkingSetBuilder) getGeneralWorkingSet(query string) []string {
	var files []string
	if wsb.info != nil {
		files = append(files, wsb.info.Entrypoints...)
		files = append(files, wsb.info.ConfigFiles...)
	}

	if wsb.repoDB != nil {
		for _, kw := range extractKeywords(query) {
			entries := wsb.repoDB.SearchSymbol(kw)
			for _, e := range entries {
				files = append(files, e.File)
			}
		}
	}
	return files
}

func classifyIntent(query string) string {
	lower := strings.ToLower(query)

	uiVerbs := strings.Contains(lower, "create") || strings.Contains(lower, "add") || strings.Contains(lower, "make") || strings.Contains(lower, "build")
	uiTargets := strings.Contains(lower, "page") || strings.Contains(lower, "component") || strings.Contains(lower, "landing") || strings.Contains(lower, "section") || strings.Contains(lower, "hero") || strings.Contains(lower, "navbar") || strings.Contains(lower, "footer") || strings.Contains(lower, "pricing") || strings.Contains(lower, "header") || strings.Contains(lower, "nav") || strings.Contains(lower, "button") || strings.Contains(lower, "card") || strings.Contains(lower, "form") || strings.Contains(lower, "modal") || strings.Contains(lower, "sidebar") || strings.Contains(lower, "layout") || strings.Contains(lower, "dashboard")

	switch {
	case uiVerbs && uiTargets:
		return "ui_generation"
	case strings.Contains(lower, "edit") || strings.Contains(lower, "fix") || strings.Contains(lower, "update") || strings.Contains(lower, "change") || strings.Contains(lower, "modify") || strings.Contains(lower, "refactor"):
		return "code_edit"
	case strings.Contains(lower, "explain") || strings.Contains(lower, "analyze") || strings.Contains(lower, "what") || strings.Contains(lower, "how does") || strings.Contains(lower, "show me") || strings.Contains(lower, "list"):
		return "analysis"
	case strings.Contains(lower, "deploy") || strings.Contains(lower, "build") || strings.Contains(lower, "docker") || strings.Contains(lower, "publish"):
		return "deployment"
	default:
		return "general"
	}
}

func extractKeywords(query string) []string {
	var keywords []string
	words := strings.Fields(query)
	for _, w := range words {
		w = strings.Trim(w, ".,;:!?\"'(){}[]")
		if len(w) > 2 && isUpperCase(w[0:1]) {
			keywords = append(keywords, w)
		}
	}
	return keywords
}

func findExisting(root string, paths []string) []string {
	var existing []string
	for _, p := range paths {
		if _, err := os.Stat(filepath.Join(root, p)); err == nil {
			existing = append(existing, p)
		}
	}
	return existing
}

func deduplicateFiles(files []string) []string {
	seen := map[string]bool{}
	var result []string
	for _, f := range files {
		if !seen[f] {
			seen[f] = true
			result = append(result, f)
		}
	}
	return result
}

func (wsb *WorkingSetBuilder) GetCachedContent(files []string) map[string]string {
	result := map[string]string{}
	for _, f := range files {
		cache := wsb.repoDB.GetFileCache(f)
		if cache == nil {
			continue
		}
		changed, err := wsb.repoDB.IsFileChanged(filepath.Join(wsb.root, f))
		if err != nil || changed {
			continue
		}
		content, err := ReadFileContent(filepath.Join(wsb.root, f), 100*1024)
		if err != nil {
			continue
		}
		result[f] = content
	}
	return result
}

func CacheFiles(repoDB *RepoDB, root string, files []string) {
	for _, f := range files {
		abs := filepath.Join(root, f)
		content, err := ReadFileContent(abs, 100*1024)
		if err != nil {
			continue
		}
		repoDB.CacheFile(abs, content)
	}
}

func ComputeContextHash(files []string, query string, systemPrompt string) string {
	h := sha256.New()
	h.Write([]byte(query))
	h.Write([]byte(systemPrompt))
	for _, f := range files {
		h.Write([]byte(f))
	}
	return hex.EncodeToString(h.Sum(nil))
}

func ComputeContextHashWithContent(files []string, fileContents map[string]string, query string) string {
	h := sha256.New()
	h.Write([]byte(query))
	for _, f := range files {
		h.Write([]byte(f))
		if content, ok := fileContents[f]; ok {
			h.Write([]byte(content))
		}
	}
	return hex.EncodeToString(h.Sum(nil))
}

func FormatWorkingSetContext(files []string, fileContents map[string]string) string {
	var sb strings.Builder
	sb.WriteString("WORKING SET (pre-loaded context, use this instead of searching):\n")
	sb.WriteString(fmt.Sprintf("Total files in working set: %d\n\n", len(files)))

	for _, f := range files {
		sb.WriteString(fmt.Sprintf("⚡ %s", f))
		if content, ok := fileContents[f]; ok {
			sb.WriteString(fmt.Sprintf(" (%d bytes cached)", len(content)))
		}
		sb.WriteString("\n")
	}
	return sb.String()
}
