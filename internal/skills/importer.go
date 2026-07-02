package skills

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type ImportRequest struct {
	URL     string
	SkillID string
}

type Importer struct {
	manager   *Manager
	providers []SkillProvider
}

func NewImporter(manager *Manager) *Importer {
	return &Importer{
		manager: manager,
		providers: []SkillProvider{
			NewGitHubProvider(),
			&FilesystemProvider{},
		},
	}
}

func (imp *Importer) Import(req ImportRequest) (*SkillPackage, error) {
	url := req.URL
	if req.SkillID == "" {
		req.SkillID = extractSkillIDFromURL(url)
	}

	var sourceDir string
	for _, p := range imp.providers {
		if p.CanHandle(url) {
			dir, err := p.Fetch(context.Background(), url)
			if err != nil {
				return nil, fmt.Errorf("fetch: %w", err)
			}
			sourceDir = dir
			break
		}
	}
	if sourceDir == "" {
		return nil, fmt.Errorf("no provider for: %s", url)
	}

	skillDir := locateSkill(sourceDir, req.SkillID)
	if skillDir == "" {
		return nil, fmt.Errorf("skill '%s' not found", req.SkillID)
	}

	pkg, err := parseSkill(skillDir, req.SkillID)
	if err != nil {
		return nil, fmt.Errorf("parse: %w", err)
	}

	if err := imp.manager.Create(*pkg); err != nil {
		return nil, fmt.Errorf("install: %w", err)
	}

	copySourceDirs(skillDir, imp.manager.skillDir(pkg.Spec.ID))
	return pkg, nil
}

func isLocalPath(path string) bool {
	return strings.HasPrefix(path, "/") || strings.HasPrefix(path, ".") ||
		strings.HasPrefix(path, "~") || (!strings.Contains(path, "://") && !strings.Contains(path, "github.com"))
}

func locateSkill(base, id string) string {
	candidates := []string{
		filepath.Join(base, "skills", id),
		filepath.Join(base, id),
		filepath.Join(base, "src", id),
		base,
	}
	for _, c := range candidates {
		if fi, _ := os.Stat(c); fi != nil && fi.IsDir() {
			if _, e := os.Stat(filepath.Join(c, "skill.yaml")); e == nil {
				return c
			}
			if _, e := os.Stat(filepath.Join(c, "skill.md")); e == nil {
				return c
			}
			if _, e := os.Stat(filepath.Join(c, "SKILL.md")); e == nil {
				return c
			}
		}
	}
	return ""
}

func parseSkill(dir, fallbackID string) (*SkillPackage, error) {
	if d, err := os.ReadFile(filepath.Join(dir, "skill.yaml")); err == nil {
		var spec SkillSpec
		if yaml.Unmarshal(d, &spec) == nil {
			return buildPkgFromSpec(dir, spec)
		}
	}
	if d, err := os.ReadFile(filepath.Join(dir, "skill.md")); err == nil {
		return parseMDSkill(dir, string(d), fallbackID)
	}
	if d, err := os.ReadFile(filepath.Join(dir, "SKILL.md")); err == nil {
		return parseMDSkill(dir, string(d), fallbackID)
	}
	return nil, fmt.Errorf("no skill.yaml/skill.md/SKILL.md in %s", dir)
}

func parseMDSkill(dir, content, fallbackID string) (*SkillPackage, error) {
	fm, body := extractFM(content)
	name := fm["name"]
	if name == "" {
		name = fallbackID
	}
	desc := fm["description"]
	if desc == "" {
		desc = firstLine(body)
	}
	kws := []string{}
	if k, ok := fm["keywords"]; ok && k != "" {
		kws = strings.Split(k, ",")
	}
	if len(kws) == 0 {
		kws = extractDomainKws(name, desc)
	}
	spec := SkillSpec{
		ID: sanitizeID(fallbackID), Name: name, DisplayName: name,
		Version: fm["version"], Description: desc,
		Author: fm["author"], License: fm["license"], Category: fm["category"],
		Origin: fm["source"],
	}
	if spec.Version == "" {
		spec.Version = "1.0.0"
	}
	if spec.Author == "" {
		spec.Author = "External"
	}
	spec.Keywords = kws
	spec.Routing.Keywords = kws
	spec.Routing.Threshold = 0.7
	spec.PromptFile = "prompt.md"
	spec.Tools.Allowed = []string{"read_file", "apply_patch", "write_file"}
	spec.Memory.Enabled = true
	spec.Examples.Enabled = true
	spec.Lifecycle = Lifecycle{OnInstall: "build_embeddings", OnDelete: "remove_embeddings"}
	return &SkillPackage{Spec: spec, Prompt: body}, nil
}

func buildPkgFromSpec(dir string, spec SkillSpec) (*SkillPackage, error) {
	if spec.ID == "" {
		return nil, fmt.Errorf("spec missing id")
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
	pf := spec.PromptFile
	if pf == "" {
		pf = "prompt.md"
	}
	prompt, _ := os.ReadFile(filepath.Join(dir, pf))
	if len(prompt) == 0 {
		if d, _ := os.ReadFile(filepath.Join(dir, "skill.md")); len(d) > 0 {
			_, body := extractFM(string(d))
			prompt = []byte(body)
		}
	}
	ef := spec.Entrypoints.Examples
	if ef == "" {
		ef = "examples.md"
	}
	examples, _ := os.ReadFile(filepath.Join(dir, ef))
	pkg := &SkillPackage{Spec: spec, Prompt: string(prompt), Examples: string(examples)}
	if pkg.Spec.Lifecycle.OnInstall == "" {
		pkg.Spec.Lifecycle.OnInstall = "build_embeddings"
	}
	if pkg.Spec.Lifecycle.OnDelete == "" {
		pkg.Spec.Lifecycle.OnDelete = "remove_embeddings"
	}
	return pkg, nil
}

func extractSkillIDFromURL(url string) string {
	if gh := parseGitHubURL(url); gh != nil {
		return gh.SkillID
	}
	parts := strings.Split(strings.TrimSuffix(url, "/"), "/")
	for i := len(parts) - 1; i >= 0; i-- {
		if p := parts[i]; p != "" && p != "skills" && p != "tree" && p != "main" {
			return p
		}
	}
	return ""
}

func extractFM(content string) (map[string]string, string) {
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
			result[strings.TrimSpace(parts[0])] = strings.Trim(strings.TrimSpace(parts[1]), "\"'")
		}
	}
	return result, body
}

func firstLine(s string) string {
	lines := strings.SplitN(s, "\n", 2)
	return strings.TrimSpace(lines[0])
}

func extractDomainKws(name, desc string) []string {
	var raw []string
	raw = append(raw, strings.Fields(name)...)

	if strings.TrimSpace(desc) != "" {
		first := strings.ToLower(desc)
		first = strings.SplitN(first, ".", 2)[0]
		first = strings.SplitN(first, ",", 2)[0]
		raw = append(raw, strings.Fields(first)...)
	}

	domainTerms := map[string]bool{
		"pdf": true, "docx": true, "word": true, "document": true, "spreadsheet": true,
		"excel": true, "powerpoint": true, "react": true, "vue": true, "angular": true,
		"python": true, "go": true, "rust": true, "javascript": true, "typescript": true,
		"docker": true, "kubernetes": true, "git": true, "github": true,
		"frontend": true, "backend": true, "fullstack": true, "api": true, "database": true,
		"css": true, "html": true, "tailwind": true, "design": true, "figma": true,
		"test": true, "testing": true, "deploy": true, "devops": true, "ci": true, "cd": true,
	}

	var filtered []string
	seen := map[string]bool{}
	for _, w := range raw {
		w = strings.ToLower(strings.Trim(w, ".,;:!?()[]{}"))
		if len(w) >= 3 && domainTerms[w] && !seen[w] {
			seen[w] = true
			filtered = append(filtered, w)
		}
	}
	if len(filtered) > 10 {
		filtered = filtered[:10]
	}
	if len(filtered) == 0 {
		return []string{strings.ToLower(strings.TrimSpace(name))}
	}
	return filtered
}

func extractKws(name, desc string) []string {
	text := strings.ToLower(name + " " + desc)
	words := strings.Fields(text)
	stopWords := map[string]bool{
		"use": true, "this": true, "whenever": true, "user": true, "wants": true,
		"the": true, "and": true, "or": true, "any": true, "with": true,
		"for": true, "from": true, "that": true, "your": true, "you": true,
		"can": true, "all": true, "has": true, "was": true, "are": true,
		"not": true, "but": true, "its": true, "it": true, "also": true,
		"do": true, "if": true, "in": true, "as": true, "be": true,
		"is": true, "a": true, "an": true, "to": true, "of": true,
		"on": true, "by": true, "at": true,
	}
	seen := map[string]bool{}
	var r []string
	for _, w := range words {
		w = strings.Trim(w, ".,;:!?()[]{}")
		if len(w) > 2 && !seen[w] && !stopWords[w] {
			seen[w] = true
			r = append(r, w)
		}
	}
	if len(r) > 15 {
		r = r[:15]
	}
	return r
}

func copySourceDirs(src, dst string) {
	for srcSub, dstSub := range map[string]string{
		"scripts": "tools", "references": "resources/docs",
		"assets": "resources/assets", "templates": "resources/templates",
	} {
		sd := filepath.Join(src, srcSub)
		if _, err := os.Stat(sd); err == nil {
			copyDir(sd, filepath.Join(dst, dstSub))
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
		t := filepath.Join(dst, rel)
		if info.IsDir() {
			os.MkdirAll(t, 0755)
			return nil
		}
		data, _ := os.ReadFile(path)
		os.WriteFile(t, data, 0644)
		return nil
	})
}

func copyMappedDirs(srcB, dstB string, mappings map[string]string) {
	for s, d := range mappings {
		if _, err := os.Stat(filepath.Join(srcB, s)); err == nil {
			copyDir(filepath.Join(srcB, s), filepath.Join(dstB, d))
		}
	}
}
