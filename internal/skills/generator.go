package skills

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

type GenerateRequest struct {
	Name             string
	Description      string
	Responsibilities []string
	Research         bool
	Category         string
	SkillID          string
	WorkspaceRoot    string
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

	req.SkillID = id

	storageDir := filepath.Join(req.WorkspaceRoot, "storage", "skills", id)
	os.MkdirAll(storageDir, 0755)

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
	spec.Lifecycle = Lifecycle{
		OnInstall: "build_embeddings",
		OnDelete:  "remove_embeddings",
	}

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
	var raw []string
	raw = append(raw, strings.Fields(req.Name)...)
	raw = append(raw, strings.Fields(req.Description)...)
	for _, r := range req.Responsibilities {
		raw = append(raw, strings.Fields(r)...)
	}
	if req.Category != "" {
		raw = append(raw, strings.Fields(req.Category)...)
	}

	stopWords := map[string]bool{
		"use": true, "this": true, "whenever": true, "user": true, "wants": true,
		"the": true, "and": true, "or": true, "any": true, "with": true,
		"for": true, "from": true, "that": true, "your": true, "you": true,
		"can": true, "all": true, "has": true, "was": true, "are": true,
		"not": true, "but": true, "it": true, "also": true, "do": true,
		"if": true, "in": true, "as": true, "be": true, "is": true,
		"a": true, "an": true, "to": true, "of": true, "on": true,
		"by": true, "at": true, "dan": true, "ini": true, "akan": true,
		"serta": true, "itu": true, "yang": true, "dari": true, "untuk": true,
		"dengan": true, "pada": true,
	}

	seen := map[string]bool{}
	var unique []string
	for _, kw := range raw {
		kw = strings.ToLower(strings.TrimSpace(kw))
		kw = strings.Trim(kw, ".,;:()[]{}!@#$%^&*\"'")
		if kw == "" || len(kw) < 2 || seen[kw] || stopWords[kw] {
			continue
		}
		seen[kw] = true
		unique = append(unique, kw)
	}
	if len(unique) > 25 {
		unique = unique[:25]
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
	sb.WriteString("File Storage:\n\n")
	sb.WriteString(fmt.Sprintf("- ALL files you create MUST be saved to: storage/skills/%s/\n", req.SkillID))
	sb.WriteString("- Use this directory for tasks, notes, reports, transactions, or any skill-related data.\n")
	sb.WriteString("- NEVER write skill documents outside this directory.\n\n")
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

type KeywordSuggestion struct {
	Keyword string `json:"keyword"`
	Source  string `json:"source"`
	Score   int    `json:"score"`
}

func (g *Generator) SuggestKeywords(req GenerateRequest) []KeywordSuggestion {
	query := strings.ToLower(req.Name + " " + req.Description)
	queryWords := strings.Fields(query)
	seen := map[string]bool{}
	for _, w := range queryWords {
		w = strings.Trim(w, ".,;:()[]{}")
		if len(w) > 2 {
			seen[w] = true
		}
	}

	var suggestions []KeywordSuggestion

	specs, _ := g.manager.List()
	for _, spec := range specs {
		for _, kw := range spec.Routing.Keywords {
			kw = strings.ToLower(kw)
			if seen[kw] {
				continue
			}
			score := keywordRelevance(kw, queryWords)
			if score > 0 {
				suggestions = append(suggestions, KeywordSuggestion{
					Keyword: kw,
					Source:  fmt.Sprintf("installed skill: %s", spec.Name),
					Score:   score,
				})
			}
		}
	}

	domainMaps := map[string][]string{
		"react":      {"react", "jsx", "component", "hook", "state", "props", "vite", "tailwind", "css", "frontend", "ui", "jsx", "tsx", "spa"},
		"python":     {"python", "django", "flask", "fastapi", "pip", "venv", "pytest", "async", "decorator", "typehint"},
		"go":         {"go", "golang", "goroutine", "channel", "interface", "struct", "module", "package", "cgo", "defer"},
		"database":   {"sql", "database", "postgres", "mysql", "sqlite", "mongodb", "query", "migration", "orm", "index"},
		"devops":     {"docker", "kubernetes", "ci", "cd", "pipeline", "deploy", "infrastructure", "terraform", "ansible", "monitoring"},
		"design":     {"design", "figma", "ui", "ux", "prototype", "wireframe", "mockup", "sketch", "color", "typography"},
		"finance":    {"finance", "accounting", "budget", "expense", "income", "tax", "invoice", "ledger", "bookkeeping", "transaction"},
		"project":    {"project", "task", "sprint", "milestone", "deadline", "kanban", "scrum", "agile", "backlog", "estimation"},
		"document":   {"document", "pdf", "docx", "markdown", "report", "memo", "template", "letter", "format", "convert"},
		"ai-ml":      {"ai", "ml", "machine", "learning", "model", "training", "inference", "neural", "embedding", "token"},
	}

	for _, domain := range domainMaps {
		matchCount := 0
		for _, dw := range domain {
			if seen[dw] {
				matchCount++
			}
		}
		if matchCount > 0 {
			for _, dw := range domain {
				if !seen[dw] {
					suggestions = append(suggestions, KeywordSuggestion{
						Keyword: dw,
						Source:  "domain knowledge",
						Score:   matchCount * 2,
					})
				}
			}
		}
	}

	sortSuggestions(suggestions)
	return deduplicateSuggestions(suggestions)
}

func keywordRelevance(kw string, queryWords []string) int {
	for _, qw := range queryWords {
		if strings.Contains(kw, qw) || strings.Contains(qw, kw) {
			return 2
		}
	}
	return 0
}

func sortSuggestions(s []KeywordSuggestion) {
	for i := 0; i < len(s); i++ {
		for j := i + 1; j < len(s); j++ {
			if s[j].Score > s[i].Score {
				s[i], s[j] = s[j], s[i]
			}
		}
	}
}

func deduplicateSuggestions(s []KeywordSuggestion) []KeywordSuggestion {
	seen := map[string]bool{}
	var result []KeywordSuggestion
	for _, sug := range s {
		if !seen[sug.Keyword] {
			seen[sug.Keyword] = true
			if len(result) >= 20 {
				break
			}
			result = append(result, sug)
		}
	}
	return result
}
