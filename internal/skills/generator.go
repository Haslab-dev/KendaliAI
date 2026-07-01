package skills

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

type GenerateRequest struct {
	Name            string
	Description     string
	Responsibilities []string
	Research        bool
	Category        string
}

type Generator struct {
	manager *Manager
}

func NewGenerator(manager *Manager) *Generator {
	return &Generator{manager: manager}
}

func (g *Generator) Generate(req GenerateRequest) (*SkillPackage, error) {
	id := sanitizeID(req.Name)
	if id == "" {
		id = "skill_" + uuid.New().String()[:8]
	}

	if g.manager.Exists(id) {
		id = id + "_" + uuid.New().String()[:4]
	}

	spec := SkillSpec{
		ID:          id,
		Name:        req.Name,
		Version:     "1.0.0",
		Description: req.Description,
		Author:      "AI Generator",
		Category:    req.Category,
	}
	spec.Routing.Keywords = g.buildKeywords(req)
	spec.Routing.Threshold = 0.7
	spec.Tools.Allowed = []string{"exa-search", "memory", "filesystem:read"}
	spec.Constraints = []string{
		"Stay within your domain expertise.",
		"If unsure, suggest consulting a professional.",
	}
	spec.Memory.Enabled = true
	spec.Examples.Enabled = true
	spec.PromptFile = "prompt.md"

	prompt := g.buildPrompt(req)
	examples := g.buildExamples(req)

	pkg := SkillPackage{
		Spec:     spec,
		Prompt:   prompt,
		Examples: examples,
	}

	if err := g.manager.Create(pkg); err != nil {
		return nil, fmt.Errorf("save skill: %w", err)
	}

	return &pkg, nil
}

func (g *Generator) buildKeywords(req GenerateRequest) []string {
	keywords := []string{req.Name}
	keywords = append(keywords, strings.Fields(req.Description)...)
	for _, r := range req.Responsibilities {
		keywords = append(keywords, strings.Fields(r)...)
	}
	if req.Category != "" {
		keywords = append(keywords, req.Category)
	}
	seen := map[string]bool{}
	var unique []string
	for _, kw := range keywords {
		kw = strings.ToLower(strings.TrimSpace(kw))
		if kw == "" || len(kw) < 3 || seen[kw] {
			continue
		}
		seen[kw] = true
		unique = append(unique, kw)
	}
	if len(unique) > 20 {
		unique = unique[:20]
	}
	return unique
}

func (g *Generator) buildPrompt(req GenerateRequest) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("You are an experienced %s.\n\n", req.Name))
	sb.WriteString(fmt.Sprintf("Role: %s\n\n", req.Description))
	if len(req.Responsibilities) > 0 {
		sb.WriteString("Responsibilities:\n\n")
		for _, r := range req.Responsibilities {
			sb.WriteString(fmt.Sprintf("- %s\n", r))
		}
		sb.WriteString("\n")
	}
	sb.WriteString("Guidelines:\n\n")
	sb.WriteString("- Provide accurate, up-to-date information.\n")
	sb.WriteString("- Structure answers clearly with steps when appropriate.\n")
	sb.WriteString("- Suggest alternatives and considerations.\n")
	sb.WriteString("- Never fabricate dangerous or harmful advice.\n")
	sb.WriteString("- If unsure, say so and suggest professional consultation.\n")
	return sb.String()
}

func (g *Generator) buildExamples(req GenerateRequest) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s Examples\n\n", req.Name))
	sb.WriteString("## Example 1\n\n")
	sb.WriteString(fmt.Sprintf("User: Can you help me with %s?\n\n", strings.ToLower(req.Name)))
	sb.WriteString(fmt.Sprintf("Assistant: Of course! As a %s, I can help with that. Here's what you need to know...\n\n", req.Name))
	sb.WriteString("## Example 2\n\n")
	sb.WriteString(fmt.Sprintf("User: What are the best practices for %s?\n\n", strings.ToLower(req.Name)))
	sb.WriteString(fmt.Sprintf("Assistant: Great question! Here are the key best practices for %s:\n\n", strings.ToLower(req.Name)))
	sb.WriteString("1. First practice...\n")
	sb.WriteString("2. Second practice...\n")
	sb.WriteString("3. Third practice...\n")
	return sb.String()
}

func sanitizeID(name string) string {
	id := strings.ToLower(name)
	id = strings.ReplaceAll(id, " ", "-")
	id = strings.ReplaceAll(id, "_", "-")
	id = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			return r
		}
		return -1
	}, id)
	return strings.Trim(id, "-")
}
