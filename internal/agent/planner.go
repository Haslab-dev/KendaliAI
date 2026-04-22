package agent

import (
	"encoding/json"
	"strings"
)

// A Planner takes the raw LLM output strings and strictly parses execution schemas
// Implementing Planning constraints limits hallucinations and explicitly structures state parsing
func ParseActionPlan(text string) []ToolRequest {
	var reqs []ToolRequest
    // Allowing the model to submit multiple tool requests sequentially to be fired in parallel
	for _, rawLine := range strings.Split(text, "\n") {
		line := strings.TrimSpace(rawLine)
		if !strings.HasPrefix(line, "tool:") {
			continue
		}
		parts := strings.SplitN(strings.TrimSpace(line[5:]), "(", 2)
		if len(parts) == 2 {
			name := strings.TrimSpace(parts[0])
			jsonStr := strings.TrimSuffix(strings.TrimSpace(parts[1]), ")")
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
