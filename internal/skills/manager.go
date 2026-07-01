package skills

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

var DefaultManager *Manager
var DefaultRouter *Router

func Init() {
	homeDir, _ := os.UserHomeDir()
	basePath := filepath.Join(homeDir, ".kendaliai", "skills")
	DefaultManager = NewManager(basePath)
	DefaultRouter = NewRouter(DefaultManager)
}

type Manager struct {
	basePath string
}

func NewManager(basePath string) *Manager {
	return &Manager{basePath: basePath}
}

func (m *Manager) skillDir(id string) string {
	return filepath.Join(m.basePath, "generated", id)
}

func (m *Manager) Create(pkg SkillPackage) error {
	dir := m.skillDir(pkg.Spec.ID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create skill dir: %w", err)
	}

	if pkg.Spec.Version == "" {
		pkg.Spec.Version = "1.0.0"
	}
	if pkg.Spec.PromptFile == "" {
		pkg.Spec.PromptFile = "prompt.md"
	}
	if pkg.Spec.Routing.Threshold == 0 {
		pkg.Spec.Routing.Threshold = 0.7
	}

	specPath := filepath.Join(dir, "skill.yaml")
	specData, err := yaml.Marshal(&pkg.Spec)
	if err != nil {
		return fmt.Errorf("marshal spec: %w", err)
	}
	if err := os.WriteFile(specPath, specData, 0644); err != nil {
		return fmt.Errorf("write spec: %w", err)
	}

	promptPath := filepath.Join(dir, pkg.Spec.PromptFile)
	if err := os.WriteFile(promptPath, []byte(pkg.Prompt), 0644); err != nil {
		return fmt.Errorf("write prompt: %w", err)
	}

	if pkg.Examples != "" {
		examplesPath := filepath.Join(dir, "examples.md")
		if err := os.WriteFile(examplesPath, []byte(pkg.Examples), 0644); err != nil {
			return fmt.Errorf("write examples: %w", err)
		}
	}

	meta := Metadata{
		GeneratedBy: "skill-generator",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Sources:     []string{"user"},
		Version:     1,
	}
	metaPath := filepath.Join(dir, "metadata.json")
	metaData, _ := json.MarshalIndent(meta, "", "  ")
	_ = os.WriteFile(metaPath, metaData, 0644)

	return nil
}

func (m *Manager) Get(id string) (*SkillPackage, error) {
	dir := m.skillDir(id)
	specPath := filepath.Join(dir, "skill.yaml")

	data, err := os.ReadFile(specPath)
	if err != nil {
		return nil, fmt.Errorf("skill not found: %s", id)
	}

	var spec SkillSpec
	if err := yaml.Unmarshal(data, &spec); err != nil {
		return nil, fmt.Errorf("parse spec: %w", err)
	}

	promptPath := filepath.Join(dir, spec.PromptFile)
	prompt, _ := os.ReadFile(promptPath)

	examplesPath := filepath.Join(dir, "examples.md")
	examples, _ := os.ReadFile(examplesPath)

	return &SkillPackage{
		Spec:     spec,
		Prompt:   string(prompt),
		Examples: string(examples),
	}, nil
}

func (m *Manager) Update(id string, pkg SkillPackage) error {
	existing, err := m.Get(id)
	if err != nil {
		return err
	}

	parts := strings.Split(existing.Spec.Version, ".")
	if len(parts) == 3 {
		minor := 0
		fmt.Sscanf(parts[1], "%d", &minor)
		pkg.Spec.Version = fmt.Sprintf("%s.%d.%s", parts[0], minor+1, parts[2])
	} else {
		pkg.Spec.Version = "1.0.0"
	}

	pkg.Spec.PromptFile = existing.Spec.PromptFile
	return m.Create(pkg)
}

func (m *Manager) Delete(id string) error {
	dir := m.skillDir(id)
	if err := os.RemoveAll(dir); err != nil {
		return fmt.Errorf("delete skill dir: %w", err)
	}
	return nil
}

func (m *Manager) List() ([]SkillSpec, error) {
	genDir := filepath.Join(m.basePath, "generated")
	if _, err := os.Stat(genDir); os.IsNotExist(err) {
		return nil, nil
	}

	entries, err := os.ReadDir(genDir)
	if err != nil {
		return nil, fmt.Errorf("read generated dir: %w", err)
	}

	var specs []SkillSpec
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		specPath := filepath.Join(genDir, e.Name(), "skill.yaml")
		data, err := os.ReadFile(specPath)
		if err != nil {
			continue
		}
		var spec SkillSpec
		if err := yaml.Unmarshal(data, &spec); err != nil {
			continue
		}
		specs = append(specs, spec)
	}

	sort.Slice(specs, func(i, j int) bool {
		return specs[i].Name < specs[j].Name
	})

	return specs, nil
}

func (m *Manager) Exists(id string) bool {
	_, err := m.Get(id)
	return err == nil
}
