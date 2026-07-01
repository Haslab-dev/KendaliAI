package agent

import (
	"fmt"
	"strings"
)

type ActiveGoal struct {
	Summary     string   `json:"summary"`
	Keywords    []string `json:"keywords"`
	Constraints []string `json:"constraints"`
}

func ExtractGoal(query string) *ActiveGoal {
	cleaned := cleanChannelPrefix(query)
	lower := strings.ToLower(cleaned)

	goal := &ActiveGoal{
		Constraints: []string{
			"Do NOT install unrelated software.",
			"Do NOT run interactive commands.",
			"Do NOT drift from the stated goal.",
			"Verify success after each step.",
		},
	}

	goal.Summary = extractSummary(cleaned)
	goal.Keywords = extractGoalKeywords(lower)

	return goal
}

func (g *ActiveGoal) Prompt() string {
	var sb strings.Builder
	sb.WriteString("🧭 ACTIVE GOAL: ")
	sb.WriteString(g.Summary)
	sb.WriteString("\n\n")
	sb.WriteString("CONSTRAINTS:\n")
	for _, c := range g.Constraints {
		sb.WriteString(fmt.Sprintf("  - %s\n", c))
	}
	sb.WriteString(fmt.Sprintf("\nKeywords: %s\n", strings.Join(g.Keywords, ", ")))
	sb.WriteString("\nSTAY ON TRACK. Every tool call must serve the ACTIVE GOAL.")
	return sb.String()
}

func (g *ActiveGoal) VerifyAction(toolName string, args map[string]interface{}) (bool, string) {
	if toolName == "exec" {
		cmd, _ := args["command"].(string)
		if cmd == "" {
			return false, "empty command"
		}
		lower := strings.ToLower(cmd)

		if strings.Contains(lower, "npm install") && !strings.Contains(lower, "node") {
			for _, kw := range g.Keywords {
				if strings.Contains(lower, kw) {
					return true, ""
				}
			}
			return false, fmt.Sprintf("GOAL CHECK: 'npm install' not related to goal '%s' — rejected", g.Summary)
		}

		if strings.Contains(lower, "codegpt") {
			return false, fmt.Sprintf("GOAL CHECK: 'codegpt' not in goal '%s' — rejected", g.Summary)
		}

		if strings.Contains(lower, "military") || strings.Contains(lower, "simulation") {
			match := false
			for _, kw := range g.Keywords {
				if strings.Contains(lower, kw) {
					match = true
					break
				}
			}
			if !match {
				return false, "GOAL CHECK: topic unrelated to goal — rejected"
			}
		}
	}

	return true, ""
}

func cleanChannelPrefix(query string) string {
	if idx := strings.LastIndex(query, "User message: "); idx >= 0 {
		return query[idx+14:]
	}
	return query
}

func extractSummary(query string) string {
	lines := strings.Split(query, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if len(line) > 5 && !strings.HasPrefix(line, "[") && !strings.HasPrefix(line, "tool:") {
			if len(line) > 120 {
				return line[:117] + "..."
			}
			return line
		}
	}
	return query
}

func extractGoalKeywords(lower string) []string {
	techTerms := []string{
		"node", "nodejs", "npm", "bun", "python", "go", "golang", "rust",
		"docker", "kubernetes", "install", "setup", "deploy", "build",
		"create", "test", "debug", "fix", "refactor",
		"upload", "download", "r2", "s3", "storage",
		"skill", "memory", "search", "config",
	}
	var found []string
	for _, term := range techTerms {
		if strings.Contains(lower, term) {
			found = append(found, term)
		}
	}
	if len(found) == 0 {
		found = append(found, "general")
	}
	return found
}
