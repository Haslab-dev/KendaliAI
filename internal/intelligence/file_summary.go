package intelligence

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type FileSummary struct {
	Path       string   `json:"path"`
	Framework  string   `json:"framework"`
	Exports    []string `json:"exports"`
	Components []string `json:"components"`
	Functions  []string `json:"functions"`
	Classes    []string `json:"classes"`
	Imports    []string `json:"imports"`
	UsesCSS    string   `json:"uses_css,omitempty"`
}

func SummarizeFile(absPath, rootPath string, info *ProjectInfo) *FileSummary {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	content := string(data)
	rel, _ := filepath.Rel(rootPath, absPath)
	ext := filepath.Ext(absPath)

	summary := &FileSummary{
		Path:      rel,
		Framework: info.Framework,
	}

	switch ext {
	case ".tsx", ".jsx":
		summary.Exports = extractTSExports(content)
		summary.Components = extractTSComponents(content)
		summary.Functions = extractTSFunctions(content)
		summary.Imports = extractTSImportNames(content)
	case ".ts", ".js":
		summary.Exports = extractTSExports(content)
		summary.Functions = extractTSFunctions(content)
		summary.Classes = extractTSClasses(content)
		summary.Imports = extractTSImportNames(content)
	case ".go":
		summary.Exports = extractGoExports(content)
		summary.Functions = extractGoFunctions(content)
		summary.Imports = extractGoImportNames(content)
	case ".py":
		summary.Functions = extractPyFunctions(content)
		summary.Classes = extractPyClasses(content)
	case ".rs":
		summary.Functions = extractRsFunctions(content)
		summary.Imports = extractRsImportNames(content)
	case ".css", ".scss", ".less":
		summary.UsesCSS = "CSS"
	case ".vue":
		summary.Components = extractVueComponents(content)
	case ".svelte":
		summary.Components = extractSvelteComponents(content)
	}

	if info != nil && info.CSS == "Tailwind" {
		if strings.Contains(content, "tailwind") || strings.Contains(content, "@apply") {
			summary.UsesCSS = "Tailwind"
		}
	}

	return summary
}

func (fs *FileSummary) Format() string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("## %s\n", fs.Path))

	if len(fs.Components) > 0 {
		sb.WriteString(fmt.Sprintf("Components: %s\n", strings.Join(fs.Components, ", ")))
	}
	if len(fs.Exports) > 0 {
		sb.WriteString(fmt.Sprintf("Exports: %s\n", strings.Join(fs.Exports, ", ")))
	}
	if len(fs.Functions) > 0 {
		sb.WriteString(fmt.Sprintf("Functions: %s\n", strings.Join(fs.Functions, ", ")))
	}
	if len(fs.Classes) > 0 {
		sb.WriteString(fmt.Sprintf("Classes: %s\n", strings.Join(fs.Classes, ", ")))
	}
	if len(fs.Imports) > 0 {
		sb.WriteString(fmt.Sprintf("Imports: %s\n", strings.Join(fs.Imports, ", ")))
	}
	if fs.UsesCSS != "" {
		sb.WriteString(fmt.Sprintf("CSS: %s\n", fs.UsesCSS))
	}
	return sb.String()
}

func extractTSExports(content string) []string {
	var exports []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.Contains(line, "export") {
			if strings.HasPrefix(line, "export default") {
				exports = append(exports, "default")
			} else if strings.HasPrefix(line, "export const") {
				parts := strings.Fields(line)
				if len(parts) >= 3 {
					name := parts[2]
					name = strings.Split(name, "=")[0]
					name = strings.Split(name, ":")[0]
					exports = append(exports, strings.TrimSpace(name))
				}
			} else if strings.HasPrefix(line, "export function") {
				parts := strings.Fields(line)
				if len(parts) >= 3 {
					name := strings.Split(parts[2], "(")[0]
					exports = append(exports, strings.TrimSpace(name))
				}
			} else if strings.HasPrefix(line, "export interface") {
				parts := strings.Fields(line)
				if len(parts) >= 3 {
					exports = append(exports, strings.TrimSpace(parts[2]))
				}
			} else if strings.HasPrefix(line, "export type") {
				parts := strings.Fields(line)
				if len(parts) >= 3 {
					exports = append(exports, strings.TrimSpace(parts[2]))
				}
			}
		}
	}
	return exports
}

func extractTSComponents(content string) []string {
	var components []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "function ") || strings.HasPrefix(line, "export function ") || strings.HasPrefix(line, "export default function ") {
			parts := strings.Fields(line)
			for _, p := range parts {
				p = strings.TrimSpace(p)
				p = strings.TrimPrefix(p, "export")
				p = strings.TrimPrefix(p, "default")
				p = strings.TrimSpace(p)
				if p == "function" || p == "" {
					continue
				}
				name := strings.Split(p, "(")[0]
				if len(name) > 0 && isUpperCase(name[0:1]) {
					components = append(components, name)
				}
			}
		}
	}
	return components
}

func extractTSFunctions(content string) []string {
	var functions []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "const ") || strings.HasPrefix(line, "let ") || strings.HasPrefix(line, "var ") {
			if strings.Contains(line, "=>") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					name := strings.Split(parts[1], "=")[0]
					name = strings.Split(name, ":")[0]
					functions = append(functions, strings.TrimSpace(name))
				}
			}
		}
	}
	return functions
}

func extractTSClasses(content string) []string {
	var classes []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "class ") || strings.HasPrefix(line, "export class ") {
			parts := strings.Fields(line)
			for _, p := range parts {
				if p != "class" && p != "export" {
					name := strings.Split(p, "{")[0]
					name = strings.Split(name, "extends")[0]
					classes = append(classes, strings.TrimSpace(name))
					break
				}
			}
		}
	}
	return classes
}

func extractTSImportNames(content string) []string {
	var imports []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "import") {
			continue
		}
		if strings.Contains(line, "{") {
			braceStart := strings.Index(line, "{")
			braceEnd := strings.Index(line, "}")
			if braceStart >= 0 && braceEnd > braceStart {
				named := line[braceStart+1 : braceEnd]
				for _, part := range strings.Split(named, ",") {
					part = strings.TrimSpace(part)
					if i := strings.Index(part, " as "); i >= 0 {
						part = part[i+4:]
					}
					imports = append(imports, strings.TrimSpace(part))
				}
			}
		}
	}
	return imports
}

func extractGoExports(content string) []string {
	var exports []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "func ") || strings.HasPrefix(line, "type ") || strings.HasPrefix(line, "var ") || strings.HasPrefix(line, "const ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				name := parts[1]
				name = strings.Split(name, "(")[0]
				name = strings.Split(name, "[")[0]
				if isExported(name) {
					exports = append(exports, name)
				}
			}
		}
	}
	return exports
}

func extractGoFunctions(content string) []string {
	var functions []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "func ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				name := strings.Split(parts[1], "(")[0]
				functions = append(functions, name)
			}
		}
	}
	return functions
}

func extractGoImportNames(content string) []string {
	var imports []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "import ") && strings.Contains(line, "\"") {
			start := strings.Index(line, "\"")
			end := strings.LastIndex(line, "\"")
			if start >= 0 && end > start {
				imports = append(imports, line[start+1:end])
			}
		}
	}
	return imports
}

func extractPyFunctions(content string) []string {
	var functions []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "def ") || strings.HasPrefix(line, "async def ") {
			parts := strings.Fields(line)
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p == "def" || p == "async" {
					continue
				}
				name := strings.Split(p, "(")[0]
				functions = append(functions, name)
				break
			}
		}
	}
	return functions
}

func extractPyClasses(content string) []string {
	var classes []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "class ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				name := strings.Split(parts[1], "(")[0]
				name = strings.Split(name, ":")[0]
				classes = append(classes, name)
			}
		}
	}
	return classes
}

func extractRsFunctions(content string) []string {
	var functions []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "fn ") || strings.HasPrefix(line, "pub fn ") || strings.HasPrefix(line, "async fn ") || strings.HasPrefix(line, "pub async fn ") {
			parts := strings.Fields(line)
			for _, p := range parts {
				if p == "fn" || p == "pub" || p == "async" {
					continue
				}
				name := strings.Split(p, "(")[0]
				name = strings.Split(name, "<")[0]
				functions = append(functions, name)
				break
			}
		}
	}
	return functions
}

func extractRsImportNames(content string) []string {
	var imports []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "use ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				path := parts[1]
				path = strings.TrimSuffix(path, ";")
				imports = append(imports, path)
			}
		}
	}
	return imports
}

func extractVueComponents(content string) []string {
	var components []string
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if (strings.HasPrefix(line, "export default") || strings.Contains(line, "defineComponent")) && strings.Contains(line, "name:") {
			if idx := strings.Index(line, "name:"); idx >= 0 {
				rest := line[idx+5:]
				rest = strings.Trim(rest, " '\"")
				name := strings.Split(rest, "'")[0]
				name = strings.Split(name, "\"")[0]
				name = strings.Split(name, ",")[0]
				components = append(components, strings.TrimSpace(name))
			}
		}
	}
	return components
}

func extractSvelteComponents(content string) []string {
	return nil
}
