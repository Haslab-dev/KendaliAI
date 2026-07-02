package skills

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type ImportRequest struct {
	URL     string
	SkillID string
}

type Importer struct {
	manager *Manager
}

func NewImporter(manager *Manager) *Importer {
	return &Importer{manager: manager}
}

func (imp *Importer) Import(req ImportRequest) (*SkillPackage, error) {
	homeDir, _ := os.UserHomeDir()
	importsDir := filepath.Join(homeDir, ".kendaliai", "skills", "imports")

	url := normalizeURL(req.URL)
	repoName := extractRepoName(url)
	cloneDir := filepath.Join(importsDir, repoName)

	os.MkdirAll(importsDir, 0755)

	if _, err := os.Stat(filepath.Join(cloneDir, ".git")); err != nil {
		cmd := exec.Command("git", "clone", "--depth", "1", url, cloneDir)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return nil, fmt.Errorf("clone failed: %s", string(out))
		}
	}

	skillDir := locateSkill(cloneDir, req.SkillID)
	if skillDir == "" {
		return nil, fmt.Errorf("skill '%s' not found in %s", req.SkillID, url)
	}

	pkg, err := parseSkill(skillDir, req.SkillID)
	if err != nil {
		return nil, fmt.Errorf("parse skill: %w", err)
	}

	if err := imp.manager.Create(*pkg); err != nil {
		return nil, fmt.Errorf("install skill: %w", err)
	}

	copySourceDirs(skillDir, imp.manager.skillDir(pkg.Spec.ID))

	return pkg, nil
}

func normalizeURL(raw string) string {
	raw = strings.TrimSuffix(raw, "/")
	raw = strings.TrimSuffix(raw, ".git")

	if strings.Contains(raw, "/tree/") {
		parts := strings.SplitN(raw, "/tree/", 2)
		raw = parts[0]
	}

	return raw
}

func extractRepoName(url string) string {
	parts := strings.Split(strings.TrimSuffix(url, "/"), "/")
	if len(parts) >= 2 {
		name := parts[len(parts)-1]
		name = strings.ReplaceAll(name, ".git", "")
		return name
	}
	return "skill-repo"
}

func locateSkill(cloneDir, skillID string) string {
	candidates := []string{
		filepath.Join(cloneDir, "skills", skillID),
		filepath.Join(cloneDir, skillID),
		filepath.Join(cloneDir, "src", skillID),
	}

	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			if _, err := os.Stat(filepath.Join(c, "skill.yaml")); err == nil {
				return c
			}
			if _, err := os.Stat(filepath.Join(c, "skill.md")); err == nil {
				return c
			}
			if _, err := os.Stat(filepath.Join(c, "SKILL.md")); err == nil {
				return c
			}
		}
	}

	filepath.Walk(cloneDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() && info.Name() == skillID {
			candidates = append(candidates, path)
			return filepath.SkipDir
		}
		return nil
	})

	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			if _, err := os.Stat(filepath.Join(c, "skill.yaml")); err == nil {
				return c
			}
			if _, err := os.Stat(filepath.Join(c, "skill.md")); err == nil {
				return c
			}
			if _, err := os.Stat(filepath.Join(c, "SKILL.md")); err == nil {
				return c
			}
		}
	}

	return ""
}

func parseSkill(dir, fallbackID string) (*SkillPackage, error) {
	if data, err := os.ReadFile(filepath.Join(dir, "skill.yaml")); err == nil {
		var spec SkillSpec
		if err := yaml.Unmarshal(data, &spec); err == nil {
			return buildPackageFromSpec(dir, spec)
		}
	}

	if data, err := os.ReadFile(filepath.Join(dir, "skill.md")); err == nil {
		return parseMarkdownSkill(dir, string(data), fallbackID)
	}
	if data, err := os.ReadFile(filepath.Join(dir, "SKILL.md")); err == nil {
		return parseMarkdownSkill(dir, string(data), fallbackID)
	}

	return nil, fmt.Errorf("no skill.yaml, skill.md, or SKILL.md found in %s", dir)
}

func parseMarkdownSkill(dir, content, fallbackID string) (*SkillPackage, error) {
	fm, body := extractFrontmatter(content)

	name := fm["name"]
	if name == "" {
		name = fallbackID
	}
	description := fm["description"]
	if description == "" {
		description = firstLine(body)
	}

	keywords := []string{}
	if kw, ok := fm["keywords"]; ok && kw != "" {
		keywords = strings.Split(kw, ",")
		for i := range keywords {
			keywords[i] = strings.TrimSpace(keywords[i])
		}
	}
	if len(keywords) == 0 {
		keywords = extractKeywords(name, description)
	}

	spec := SkillSpec{
		ID:          sanitizeID(fallbackID),
		Name:        name,
		DisplayName: name,
		Version:     fm["version"],
		Description: description,
		Author:      fm["author"],
		License:     fm["license"],
		Category:    fm["category"],
		Origin:     fm["source"],
	}
	if spec.Version == "" {
		spec.Version = "1.0.0"
	}
	if spec.Author == "" {
		spec.Author = "External"
	}

	spec.Keywords = keywords
	spec.Routing.Keywords = keywords
	spec.Routing.Threshold = 0.7
	spec.PromptFile = "prompt.md"
	spec.Tools.Allowed = []string{"read_file", "apply_patch", "write_file"}
	spec.Memory.Enabled = true
	spec.Examples.Enabled = true
	spec.Lifecycle = Lifecycle{
		OnInstall: "build_embeddings",
		OnDelete:  "remove_embeddings",
	}

	return &SkillPackage{
		Spec:   spec,
		Prompt: body,
	}, nil
}

func buildPackageFromSpec(dir string, spec SkillSpec) (*SkillPackage, error) {
	if spec.ID == "" {
		return nil, fmt.Errorf("skill spec missing 'id' field")
	}
	if spec.Version == "" {
		spec.Version = "1.0.0"
	}
	if spec.Routing.Threshold == 0 {
		spec.Routing.Threshold = 0.7
	}
	if spec.Routing.Keywords == nil {
		spec.Routing.Keywords = spec.Keywords
	}

	promptFile := spec.PromptFile
	if promptFile == "" {
		promptFile = "prompt.md"
	}
	prompt, _ := os.ReadFile(filepath.Join(dir, promptFile))
	if len(prompt) == 0 {
		prompt, _ = os.ReadFile(filepath.Join(dir, "skill.md"))
		if len(prompt) > 0 {
			_, body := extractFrontmatter(string(prompt))
			prompt = []byte(body)
		}
	}

	examplesFile := spec.Entrypoints.Examples
	if examplesFile == "" {
		examplesFile = "examples.md"
	}
	examples, _ := os.ReadFile(filepath.Join(dir, examplesFile))

	pkg := &SkillPackage{
		Spec:     spec,
		Prompt:   string(prompt),
		Examples: string(examples),
	}

	if spec.Lifecycle.OnInstall == "" {
		pkg.Spec.Lifecycle.OnInstall = "build_embeddings"
	}
	if spec.Lifecycle.OnDelete == "" {
		pkg.Spec.Lifecycle.OnDelete = "remove_embeddings"
	}

	return pkg, nil
}

func extractFrontmatter(content string) (map[string]string, string) {
	content = strings.TrimSpace(content)
	if !strings.HasPrefix(content, "---") {
		return map[string]string{}, content
	}

	rest := content[3:]
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return map[string]string{}, content
	}

	fm := rest[:end]
	body := strings.TrimSpace(rest[end+4:])

	result := map[string]string{}
	for _, line := range strings.Split(fm, "\n") {
		line = strings.TrimSpace(line)
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, "\"'")
			result[key] = val
		}
	}

	return result, body
}

func firstLine(s string) string {
	lines := strings.SplitN(s, "\n", 2)
	return strings.TrimSpace(lines[0])
}

func extractKeywords(name, desc string) []string {
	text := strings.ToLower(name + " " + desc)
	words := strings.Fields(text)
	seen := map[string]bool{}
	var result []string
	for _, w := range words {
		w = strings.Trim(w, ".,;:!?()[]{}")
		if len(w) > 2 && !seen[w] {
			seen[w] = true
			result = append(result, w)
		}
	}
	if len(result) > 15 {
		result = result[:15]
	}
	return result
}

func copySourceDirs(src, dst string) {
	mappings := map[string]string{
		"scripts":    "tools",
		"references": filepath.Join("resources", "docs"),
		"assets":     filepath.Join("resources", "assets"),
		"templates":  filepath.Join("resources", "templates"),
	}

	for srcSub, dstSub := range mappings {
		srcDir := filepath.Join(src, srcSub)
		dstDir := filepath.Join(dst, dstSub)
		if _, err := os.Stat(srcDir); err == nil {
			copyDir(srcDir, dstDir)
		}
	}
}

func copyDir(src, dst string) {
	os.MkdirAll(dst, 0755)
	filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(src, path)
		if rel == "." {
			return nil
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			os.MkdirAll(target, 0755)
			return nil
		}
		data, _ := os.ReadFile(path)
		os.WriteFile(target, data, 0644)
		return nil
	})
}
