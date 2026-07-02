package intelligence

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var goSymbolRE = regexp.MustCompile(`^(?:func|type|var|const)\s+(?:\((.*?)\)\s+)?(\w+)`)
var goFuncRE = regexp.MustCompile(`^func\s+(?:\(.*?\)\s+)?(\w+)`)
var goTypeRE = regexp.MustCompile(`^type\s+(\w+)`)
var goMethodRE = regexp.MustCompile(`^func\s+\((\w+)\s+\*?(\w+)\)\s+(\w+)`)

var tsxGoFuncLike = regexp.MustCompile(`(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)`)
var tsxArrowRE = regexp.MustCompile(`(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(`)
var tsxExportConst = regexp.MustCompile(`export\s+(?:const|let|var)\s+(\w+)`)
var tsxExportDefaultFunc = regexp.MustCompile(`export\s+default\s+function\s+(\w+)`)
var tsxComponentRE = regexp.MustCompile(`(?:export\s+)?(?:default\s+)?(?:function|const)\s+(\w+)`)
var tsxArrowComp = regexp.MustCompile(`(?:export\s+)?(?:const|let|var)\s+(\w+)\s*:\s*(?:React\.)?FC`)
var tsxInterfaceRE = regexp.MustCompile(`(?:export\s+)?interface\s+(\w+)`)
var tsxTypeRE = regexp.MustCompile(`(?:export\s+)?type\s+(\w+)`)

var pyFuncRE = regexp.MustCompile(`^def\s+(\w+)`)
var pyClassRE = regexp.MustCompile(`^class\s+(\w+)`)
var pyAsyncFuncRE = regexp.MustCompile(`^async\s+def\s+(\w+)`)

var rsFnRE = regexp.MustCompile(`^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)`)
var rsStructRE = regexp.MustCompile(`^(?:pub\s+)?struct\s+(\w+)`)
var rsEnumRE = regexp.MustCompile(`^(?:pub\s+)?enum\s+(\w+)`)
var rsImplRE = regexp.MustCompile(`^impl\s+(\w+)`)
var rsTraitRE = regexp.MustCompile(`^(?:pub\s+)?trait\s+(\w+)`)

var dartFuncRE = regexp.MustCompile(`^\s*(?:static\s+)?(?:Future\S*\s+)?(?:Widget\s+)?(\w+)\s*\(`)
var dartClassRE = regexp.MustCompile(`^\s*(?:abstract\s+)?class\s+(\w+)`)

func ExtractSymbols(rootPath string) []SymbolEntry {
	var symbols []SymbolEntry
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
		switch ext {
		case ".go":
			symbols = append(symbols, extractGoSymbols(path, rootPath)...)
		case ".tsx", ".jsx", ".ts", ".js":
			symbols = append(symbols, extractTSSymbols(path, rootPath)...)
		case ".py":
			symbols = append(symbols, extractPySymbols(path, rootPath)...)
		case ".rs":
			symbols = append(symbols, extractRsSymbols(path, rootPath)...)
		case ".dart":
			symbols = append(symbols, extractDartSymbols(path, rootPath)...)
		}
		return nil
	})

	return symbols
}

func extractGoSymbols(absPath, rootPath string) []SymbolEntry {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	rel, _ := filepath.Rel(rootPath, absPath)
	var symbols []SymbolEntry
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if matches := goFuncRE.FindStringSubmatch(line); matches != nil {
			exported := isExported(matches[1])
			symbols = append(symbols, SymbolEntry{
				Name: matches[1], Kind: "function", File: rel, Line: i + 1, Exported: exported,
			})
			continue
		}
		if matches := goMethodRE.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{
				Name: matches[3], Kind: "method", File: rel, Line: i + 1, Parent: matches[2], Exported: isExported(matches[3]),
			})
			continue
		}
		if matches := goTypeRE.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{
				Name: matches[1], Kind: "type", File: rel, Line: i + 1, Exported: isExported(matches[1]),
			})
			continue
		}
	}
	return symbols
}

func extractTSSymbols(absPath, rootPath string) []SymbolEntry {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	rel, _ := filepath.Rel(rootPath, absPath)
	var symbols []SymbolEntry
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if matches := tsxArrowComp.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "component", File: rel, Line: i + 1, Exported: true})
			continue
		}
		if matches := tsxExportDefaultFunc.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "component", File: rel, Line: i + 1, Exported: true})
			continue
		}
		if matches := tsxGoFuncLike.FindStringSubmatch(line); matches != nil {
			matchName := matches[1]
			if strings.HasPrefix(matchName, "_") {
				continue
			}
			isComp := isUpperCase(matchName[0:1])
			kind := "function"
			if isComp {
				kind = "component"
			}
			exported := strings.Contains(line, "export")
			symbols = append(symbols, SymbolEntry{Name: matchName, Kind: kind, File: rel, Line: i + 1, Exported: exported})
			continue
		}
		if matches := tsxExportConst.FindStringSubmatch(line); matches != nil {
			matchName := matches[1]
			if strings.HasPrefix(matchName, "_") {
				continue
			}
			isComp := isUpperCase(matchName[0:1])
			kind := "const"
			if isComp {
				kind = "component"
			}
			symbols = append(symbols, SymbolEntry{Name: matchName, Kind: kind, File: rel, Line: i + 1, Exported: true})
			continue
		}
		if matches := tsxInterfaceRE.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "interface", File: rel, Line: i + 1, Exported: strings.Contains(line, "export")})
			continue
		}
		if matches := tsxTypeRE.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "type", File: rel, Line: i + 1, Exported: strings.Contains(line, "export")})
			continue
		}
	}
	return symbols
}

func extractPySymbols(absPath, rootPath string) []SymbolEntry {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	rel, _ := filepath.Rel(rootPath, absPath)
	var symbols []SymbolEntry
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if matches := pyAsyncFuncRE.FindStringSubmatch(line); matches != nil {
			if !strings.HasPrefix(matches[1], "_") {
				symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "async_function", File: rel, Line: i + 1})
			}
			continue
		}
		if matches := pyFuncRE.FindStringSubmatch(line); matches != nil {
			if !strings.HasPrefix(matches[1], "_") {
				symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "function", File: rel, Line: i + 1})
			}
			continue
		}
		if matches := pyClassRE.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "class", File: rel, Line: i + 1})
			continue
		}
	}
	return symbols
}

func extractRsSymbols(absPath, rootPath string) []SymbolEntry {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	rel, _ := filepath.Rel(rootPath, absPath)
	var symbols []SymbolEntry
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if matches := rsFnRE.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "function", File: rel, Line: i + 1, Exported: strings.Contains(line, "pub")})
			continue
		}
		if matches := rsStructRE.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "struct", File: rel, Line: i + 1, Exported: strings.Contains(line, "pub")})
			continue
		}
		if matches := rsEnumRE.FindStringSubmatch(line); matches != nil {
			symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "enum", File: rel, Line: i + 1, Exported: strings.Contains(line, "pub")})
			continue
		}
	}
	return symbols
}

func extractDartSymbols(absPath, rootPath string) []SymbolEntry {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	rel, _ := filepath.Rel(rootPath, absPath)
	var symbols []SymbolEntry
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if matches := dartClassRE.FindStringSubmatch(line); matches != nil {
			if strings.HasPrefix(matches[1], "_") {
				symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "class", File: rel, Line: i + 1, Exported: false})
			} else {
				symbols = append(symbols, SymbolEntry{Name: matches[1], Kind: "class", File: rel, Line: i + 1, Exported: true})
			}
			continue
		}
	}
	return symbols
}

func isExported(name string) bool {
	if len(name) == 0 {
		return false
	}
	return name[0] >= 'A' && name[0] <= 'Z'
}

func isUpperCase(s string) bool {
	if len(s) == 0 {
		return false
	}
	return s[0] >= 'A' && s[0] <= 'Z'
}
