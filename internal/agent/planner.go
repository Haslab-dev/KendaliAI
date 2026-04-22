package agent

import (
	"encoding/json"
	"regexp"
	"strings"
)

// A Planner takes the raw LLM output strings and strictly parses execution schemas
// Implementing Planning constraints limits hallucinations and explicitly structures state parsing
func ParseActionPlan(text string) []ToolRequest {
	var reqs []ToolRequest
	
	// Regex to find: tool: name({...})
	// It looks for "tool:", followed by a name, followed by matching parentheses containing JSON
	re := regexp.MustCompile(`tool:\s*([a-zA-Z0-9_-]+)\s*\(([\s\S]*?)\)`)
	matches := re.FindAllStringSubmatch(text, -1)

	for _, match := range matches {
		if len(match) == 3 {
			name := strings.TrimSpace(match[1])
			jsonStr := strings.TrimSpace(match[2])
			
			var args map[string]interface{}
			if err := json.Unmarshal([]byte(jsonStr), &args); err == nil {
				// Visual Planner enforcement: Restrict visually capped boundaries natively for the TUI
				if name == "read_file" {
					if l, ok := args["limit"].(float64); ok && l > 100 {
						args["limit"] = float64(100)
					}
					if l, ok := args["limit"].(float64); !ok || l <= 0 {
						args["limit"] = float64(50)
					}
				}
				reqs = append(reqs, ToolRequest{Name: name, Args: args})
			}
		}
	}
	return reqs
}
