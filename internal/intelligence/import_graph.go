package intelligence

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	goImportRE    = regexp.MustCompile(`"([^"]+)"`)
	tsImportRE    = regexp.MustCompile(`(?:import\s+.*?\s+from\s+['"]([^'"]+)['"])|(?:import\s+['"]([^'"]+)['"])`)
	tsDynamicRE   = regexp.MustCompile(`import\(['"]([^'"]+)['"]\)`)
	pythonImportRE = regexp.MustCompile(`(?:from\s+(\S+)\s+import\s+)|(?:import\s+(\S+))`)
	rustUseRE     = regexp.MustCompile(`use\s+([^;]+)`)
	dartImportRE  = regexp.MustCompile(`import\s+['"]([^'"]+)['"]`)
)

func ExtractImports(rootPath string) []ImportEdge {
	var edges []ImportEdge
	var skipPaths = map[string]bool{
		"node_modules": true,
		".git":         true,
		"dist":         true,
		"build":        true,
		"target":       true,
		".next":        true,
		"__pycache__":  true,
		"vendor":       true,
		".dart_tool":   true,
		"coverage":     true,
		".kendaliai":   true,
	}

	filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if skipPaths[info.Name()] || strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if info.Size() > 500*1024 {
			return nil
		}

		ext := filepath.Ext(path)
		rel, _ := filepath.Rel(rootPath, path)
		var fileEdges []ImportEdge

		switch ext {
		case ".go":
			fileEdges = extractGoImports(path, rootPath)
		case ".tsx", ".jsx", ".ts", ".js":
			fileEdges = extractTSImports(path, rootPath)
		case ".py":
			fileEdges = extractPythonImports(path, rootPath)
		case ".rs":
			fileEdges = extractRustImports(path, rootPath)
		case ".dart":
			fileEdges = extractDartImports(path, rootPath)
		}

		for i := range fileEdges {
			fileEdges[i].FromFile = rel
		}
		edges = append(edges, fileEdges...)
		return nil
	})

	return edges
}

func extractGoImports(absPath, rootPath string) []ImportEdge {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	var edges []ImportEdge
	content := string(data)
	inImport := false
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "import (") {
			inImport = true
			continue
		}
		if inImport {
			if trimmed == ")" {
				inImport = false
				continue
			}
			trimmed = strings.Trim(trimmed, "\t \"")
			if trimmed != "" && !strings.Contains(trimmed, "/") {
				continue
			}
			edges = append(edges, ImportEdge{ToFile: trimmed, IsNamed: false})
			continue
		}
		if strings.HasPrefix(trimmed, "import ") {
			matches := goImportRE.FindStringSubmatch(trimmed)
			if len(matches) >= 2 {
				edges = append(edges, ImportEdge{ToFile: matches[1], IsNamed: false})
			}
		}
	}
	return edges
}

func extractTSImports(absPath, rootPath string) []ImportEdge {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	var edges []ImportEdge
	content := string(data)
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "import") && !strings.Contains(trimmed, "import(") {
			continue
		}
		allMatches := tsImportRE.FindAllStringSubmatch(trimmed, -1)
		for _, matches := range allMatches {
			path := ""
			if len(matches) >= 2 && matches[1] != "" {
				path = matches[1]
			} else if len(matches) >= 3 && matches[2] != "" {
				path = matches[2]
			}
			if path == "" {
				continue
			}
			if !strings.HasPrefix(path, ".") && !strings.HasPrefix(path, "@") {
				continue
			}
			name := extractComponentName(trimmed)
			edges = append(edges, ImportEdge{ToFile: path, Symbol: name, IsNamed: name != ""})
		}
		if strings.Contains(trimmed, "import(") {
			dynaMatches := tsDynamicRE.FindAllStringSubmatch(trimmed, -1)
			for _, m := range dynaMatches {
				if len(m) >= 2 && strings.HasPrefix(m[1], ".") {
					edges = append(edges, ImportEdge{ToFile: m[1]})
				}
			}
		}
	}
	return edges
}

func extractComponentName(importLine string) string {
	cleaned := strings.TrimSpace(importLine)
	cleaned = strings.TrimPrefix(cleaned, "import")
	if strings.Contains(cleaned, "{") {
		braceStart := strings.Index(cleaned, "{")
		braceEnd := strings.Index(cleaned, "}")
		if braceStart >= 0 && braceEnd > braceStart {
			named := cleaned[braceStart+1 : braceEnd]
			parts := strings.Split(named, ",")
			if len(parts) > 0 {
				name := strings.TrimSpace(parts[0])
				name = strings.Split(name, " as ")[0]
				return strings.TrimSpace(name)
			}
		}
	}
	if strings.Contains(cleaned, "default") {
		return "*default"
	}
	return ""
}

func extractPythonImports(absPath, rootPath string) []ImportEdge {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	var edges []ImportEdge
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "from ") && !strings.HasPrefix(trimmed, "import ") {
			continue
		}
		if strings.HasPrefix(trimmed, "from") {
			matches := pythonImportRE.FindStringSubmatch(trimmed)
			if len(matches) >= 2 && matches[1] != "" {
				edges = append(edges, ImportEdge{ToFile: matches[1]})
			}
		}
	}
	return edges
}

func extractRustImports(absPath, rootPath string) []ImportEdge {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	var edges []ImportEdge
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "use ") {
			continue
		}
		matches := rustUseRE.FindStringSubmatch(trimmed)
		if len(matches) >= 2 {
			parts := strings.Split(matches[1], "::")
			modPath := strings.Join(parts, "/")
			edges = append(edges, ImportEdge{ToFile: modPath, Symbol: parts[len(parts)-1], IsNamed: true})
		}
	}
	return edges
}

func extractDartImports(absPath, rootPath string) []ImportEdge {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	var edges []ImportEdge
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "import ") {
			continue
		}
		matches := dartImportRE.FindStringSubmatch(trimmed)
		if len(matches) >= 2 {
			if strings.HasPrefix(matches[1], "package:") {
				pkgPath := strings.TrimPrefix(matches[1], "package:")
				edges = append(edges, ImportEdge{ToFile: pkgPath, IsNamed: false})
			} else {
				edges = append(edges, ImportEdge{ToFile: matches[1], IsNamed: false})
			}
		}
	}
	return edges
}

func ResolveImportPath(fromFile, importPath, rootPath string) string {
	fromDir := filepath.Dir(filepath.Join(rootPath, fromFile))
	if strings.HasPrefix(importPath, ".") {
		resolved := filepath.Clean(filepath.Join(fromDir, importPath))
		for _, ext := range []string{".tsx", ".jsx", ".ts", ".js", ".vue", ".svelte"} {
			if _, err := os.Stat(resolved + ext); err == nil {
				return resolved + ext
			}
		}
		if _, err := os.Stat(resolved + "/index.tsx"); err == nil {
			return resolved + "/index.tsx"
		}
		if _, err := os.Stat(resolved + "/index.ts"); err == nil {
			return resolved + "/index.ts"
		}
		if _, err := os.Stat(resolved + "/index.js"); err == nil {
			return resolved + "/index.js"
		}
		if _, err := os.Stat(resolved); err == nil {
			return resolved
		}
		return ""
	}
	if strings.HasPrefix(importPath, "@") {
		return ""
	}
	return importPath
}
