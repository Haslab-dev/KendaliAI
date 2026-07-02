package skills

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
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

	for _, sub := range []string{"resources/templates", "resources/snippets", "resources/assets", "resources/docs", "tools", "hooks", "embeddings", "tests"} {
		os.MkdirAll(filepath.Join(dir, sub), 0755)
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
	if pkg.Spec.Routing.Confidence == 0 {
		pkg.Spec.Routing.Confidence = 0.6
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

	versionPath := filepath.Join(dir, "version.json")
	versionData, _ := json.MarshalIndent(map[string]interface{}{
		"version":    pkg.Spec.Version,
		"created_at": time.Now(),
		"updated_at": time.Now(),
	}, "", "  ")
	_ = os.WriteFile(versionPath, versionData, 0644)

	_ = m.executeHooks(pkg.Spec.ID, pkg.Spec.Lifecycle.OnInstall, dir)

	m.writeLockfile()

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

	if err := m.Create(pkg); err != nil {
		return err
	}

	if existing.Spec.Lifecycle.OnUpdate != "" {
		_ = m.executeHooks(id, existing.Spec.Lifecycle.OnUpdate, m.skillDir(id))
	}

	return nil
}

func (m *Manager) Delete(id string) error {
	dir := m.skillDir(id)

	pkg, err := m.Get(id)
	if err == nil {
		_ = m.executeHooks(id, pkg.Spec.Lifecycle.OnDelete, dir)
	}

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

func (m *Manager) executeHooks(id, hook, dir string) error {
	if hook == "" {
		return nil
	}
	steps := strings.Split(hook, ",")
	for _, step := range steps {
		step = strings.TrimSpace(step)
		switch step {
		case "build_embeddings":
			if err := m.buildEmbeddings(id, dir); err != nil {
				return fmt.Errorf("build_embeddings: %w", err)
			}
		case "remove_embeddings":
			embPath := filepath.Join(dir, "vectors.bin")
			os.Remove(embPath)
		case "regenerate_examples":
		}
	}
	return nil
}

func (m *Manager) buildEmbeddings(id, dir string) error {
	pkg, err := m.Get(id)
	if err != nil {
		return err
	}

	text := strings.Join([]string{
		pkg.Spec.Name,
		pkg.Spec.Description,
		strings.Join(pkg.Spec.Routing.Keywords, " "),
	}, " ")

	dummyEmb := make([]float32, 384)
	for i := range dummyEmb {
		dummyEmb[i] = float32(hashByte(text, i)) / 255.0
	}

	return saveEmbeddings(filepath.Join(dir, "vectors.bin"), dummyEmb)
}

func hashByte(s string, offset int) byte {
	if len(s) == 0 {
		return 0
	}
	var h uint32 = 5381
	for _, c := range s {
		h = ((h << 5) + h) + uint32(c) + uint32(offset)
	}
	return byte(h % 256)
}

func saveEmbeddings(path string, vec []float32) error {
	buf := make([]byte, 4+len(vec)*4)
	binary.LittleEndian.PutUint32(buf[:4], uint32(len(vec)))
	for i, v := range vec {
		binary.LittleEndian.PutUint32(buf[4+i*4:], math.Float32bits(v))
	}
	return os.WriteFile(path, buf, 0644)
}

func (m *Manager) LoadEmbeddings(id string) ([]float32, error) {
	dir := m.skillDir(id)
	path := filepath.Join(dir, "vectors.bin")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(data) < 4 {
		return nil, fmt.Errorf("invalid embeddings file")
	}
	dims := binary.LittleEndian.Uint32(data[:4])
	vec := make([]float32, dims)
	for i := range int(dims) {
		bits := binary.LittleEndian.Uint32(data[4+i*4:])
		vec[i] = math.Float32frombits(bits)
	}
	return vec, nil
}

func (m *Manager) writeLockfile() {
	specs, err := m.List()
	if err != nil {
		return
	}

	type lockEntry struct {
		Version      string `yaml:"version"`
		Source       string `yaml:"source,omitempty"`
		SourceCommit string `yaml:"sourceCommit,omitempty"`
		Checksum     string `yaml:"checksum,omitempty"`
		InstalledAt  string `yaml:"installedAt"`
	}

	lock := map[string]lockEntry{}
	for _, s := range specs {
		entry := lockEntry{
			Version:      s.Version,
			Source:       s.Origin,
			SourceCommit: s.SourceCommit,
			InstalledAt:  time.Now().Format(time.RFC3339),
		}
		lock[s.ID] = entry
	}

	data, _ := yaml.Marshal(lock)
	os.WriteFile(filepath.Join(m.basePath, "skills.lock"), data, 0644)
}
