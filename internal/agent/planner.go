package agent

import (
	"encoding/json"
	"regexp"
	"strings"
)

var (
	// Matches <||DSML|| invoke name="...">...</||DSML|| invoke> (supporting both ｜ and |)
	dsmlInvokeRegex = regexp.MustCompile(`(?s)<(?:\|\||｜｜)DSML(?:\|\||｜｜)\s+invoke\s+name="([^"]+)">([\s\S]*?)</(?:\|\||｜｜)DSML(?:\|\||｜｜)\s+invoke>`)
	// Matches <||DSML|| parameter name="..." ...>...</||DSML|| parameter>
	dsmlParamRegex = regexp.MustCompile(`(?s)<(?:\|\||｜｜)DSML(?:\|\||｜｜)\s+parameter\s+name="([^"]+)"([^>]*)>([\s\S]*?)</(?:\|\||｜｜)DSML(?:\|\||｜｜)\s+parameter>`)
	// Matches <tool_call>...</tool_call>
	toolCallXMLRegex = regexp.MustCompile(`(?s)<tool_call>([\s\S]*?)</tool_call>`)
)

// StripToolCallMarkup removes in-band DSML or <tool_call> XML tags from text.
func StripToolCallMarkup(text string) string {
	reCalls := regexp.MustCompile(`(?s)<(?:\|\||｜｜)DSML(?:\|\||｜｜)\s+calls>[\s\S]*?</(?:\|\||｜｜)DSML(?:\|\||｜｜)\s+calls>`)
	cleaned := reCalls.ReplaceAllString(text, "")
	reInvokes := regexp.MustCompile(`(?s)<(?:\|\||｜｜)DSML(?:\|\||｜｜)\s+invoke[\s\S]*?</(?:\|\||｜｜)DSML(?:\|\||｜｜)\s+invoke>`)
	cleaned = reInvokes.ReplaceAllString(cleaned, "")
	cleaned = toolCallXMLRegex.ReplaceAllString(cleaned, "")
	return strings.TrimSpace(cleaned)
}

// ParseActionPlan takes raw LLM output and extracts structured tool calls.
// Formats supported:
// 1. DSML: <｜｜DSML｜｜ invoke name="...">...</｜｜DSML｜｜ invoke>
// 2. XML: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
// 3. Text protocol: tool: name({...json...})
func ParseActionPlan(text string) []ToolRequest {
	var reqs []ToolRequest

	// 1. Try parsing DSML format
	if strings.Contains(text, "DSML") {
		matches := dsmlInvokeRegex.FindAllStringSubmatch(text, -1)
		for _, m := range matches {
			toolName := strings.TrimSpace(m[1])
			body := m[2]
			args := make(map[string]interface{})

			paramMatches := dsmlParamRegex.FindAllStringSubmatch(body, -1)
			for _, pm := range paramMatches {
				pName := strings.TrimSpace(pm[1])
				pAttrs := pm[2]
				pVal := strings.TrimSpace(pm[3])

				if strings.Contains(pAttrs, `string="true"`) || strings.Contains(pAttrs, `type="string"`) {
					args[pName] = pVal
				} else {
					var parsed interface{}
					if err := json.Unmarshal([]byte(pVal), &parsed); err == nil {
						args[pName] = parsed
					} else {
						args[pName] = pVal
					}
				}
			}

			if toolName == "read_file" {
				if l, ok := args["limit"].(float64); ok && l > 500 {
					args["limit"] = float64(500)
				}
				if l, ok := args["limit"].(float64); !ok || l <= 0 {
					args["limit"] = float64(500)
				}
			}
			reqs = append(reqs, ToolRequest{Name: toolName, Args: args})
		}
		if len(reqs) > 0 {
			return reqs
		}
	}

	// 2. Try parsing <tool_call>...</tool_call>
	if strings.Contains(text, "<tool_call>") {
		tcMatches := toolCallXMLRegex.FindAllStringSubmatch(text, -1)
		for _, m := range tcMatches {
			rawJSON := strings.TrimSpace(m[1])
			var parsed struct {
				Name      string                 `json:"name"`
				Arguments map[string]interface{} `json:"arguments"`
				Args      map[string]interface{} `json:"args"`
			}
			if err := json.Unmarshal([]byte(rawJSON), &parsed); err == nil && parsed.Name != "" {
				args := parsed.Arguments
				if args == nil {
					args = parsed.Args
				}
				if args == nil {
					args = make(map[string]interface{})
				}
				if parsed.Name == "read_file" {
					if l, ok := args["limit"].(float64); ok && l > 500 {
						args["limit"] = float64(500)
					}
					if l, ok := args["limit"].(float64); !ok || l <= 0 {
						args["limit"] = float64(500)
					}
				}
				reqs = append(reqs, ToolRequest{Name: parsed.Name, Args: args})
			}
		}
		if len(reqs) > 0 {
			return reqs
		}
	}

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
