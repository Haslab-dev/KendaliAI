package agent

import (
	"encoding/json"
	"strings"
)

// ParseActionPlan takes raw LLM output and extracts structured tool calls.
// Format: tool: name({...json...})
// Handles multi-line JSON args by using balanced parenthesis matching,
// with JSON string-awareness to skip parens inside quoted string values.
func ParseActionPlan(text string) []ToolRequest {
	var reqs []ToolRequest

	lines := strings.Split(text, "\n")
	i := 0
	for i < len(lines) {
		line := strings.TrimSpace(lines[i])

		if !strings.HasPrefix(line, "tool:") {
			i++
			continue
		}

		rest := strings.TrimSpace(line[5:])

		parenIdx := strings.Index(rest, "(")
		if parenIdx < 0 {
			i++
			continue
		}

		name := strings.TrimSpace(rest[:parenIdx])

		content := rest[parenIdx+1:]
		depth := 1
		inString := false
		escaped := false
		pos := 0
		for depth > 0 {
			for pos < len(content) {
				ch := content[pos]
				pos++
				if escaped {
					escaped = false
					continue
				}
				if inString {
					if ch == '\\' {
						escaped = true
					} else if ch == '"' {
						inString = false
					}
					continue
				}
				if ch == '"' {
					inString = true
					continue
				}
				switch ch {
				case '(':
					depth++
				case ')':
					depth--
					if depth == 0 {
						jsonStr := content[:pos-1]

						jsonStr = strings.TrimSpace(jsonStr)
						jsonStr = fixJSONStringNewlines(jsonStr)

						var args map[string]interface{}
						if err := json.Unmarshal([]byte(jsonStr), &args); err == nil {
							if name == "read_file" {
								if l, ok := args["limit"].(float64); ok && l > 500 {
									args["limit"] = float64(500)
								}
								if l, ok := args["limit"].(float64); !ok || l <= 0 {
									args["limit"] = float64(500)
								}
							}
							reqs = append(reqs, ToolRequest{Name: name, Args: args})
						}
						goto nextTool
					}
				}
			}
			i++
			if i >= len(lines) {
				break
			}
			content += "\n" + lines[i]
		}

	nextTool:
		i++
	}
	return reqs
}

// fixJSONStringNewlines escapes raw newlines found inside JSON double-quoted strings
// so they become valid JSON (e.g., real \n → "\\n"). Handles backslash escapes.
func fixJSONStringNewlines(s string) string {
	var out strings.Builder
	inString := false
	escaped := false
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if escaped {
			out.WriteByte(ch)
			escaped = false
			continue
		}
		if inString {
			if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				inString = false
			} else if ch == '\n' {
				out.WriteByte('\\')
				out.WriteByte('n')
				continue
			}
			out.WriteByte(ch)
			continue
		}
		if ch == '"' {
			inString = true
		}
		out.WriteByte(ch)
	}
	return out.String()
}
