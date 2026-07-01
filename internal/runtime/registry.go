package runtime

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

type AgentManifest struct {
	ID           string   `yaml:"id"`
	Role         string   `yaml:"role"`
	SystemPrompt string   `yaml:"system_prompt"`
	Capabilities []string `yaml:"capabilities"`
	Policies     []string `yaml:"policies"`
	Model        struct {
		Primary   string `yaml:"primary"`
		Fallback  string `yaml:"fallback"`
		MaxTokens int    `yaml:"max_tokens"`
	} `yaml:"model"`
	Resources struct {
		Timeout string  `yaml:"timeout"`
		MaxCost float64 `yaml:"max_cost"`
	} `yaml:"resources"`
}

type ManifestRegistry struct {
	mu        sync.RWMutex
	manifests map[string]*AgentManifest
}

func NewManifestRegistry() *ManifestRegistry {
	return &ManifestRegistry{
		manifests: make(map[string]*AgentManifest),
	}
}

func (mr *ManifestRegistry) LoadManifest(path string) (*AgentManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var m AgentManifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, err
	}

	mr.mu.Lock()
	mr.manifests[m.ID] = &m
	mr.mu.Unlock()

	return &m, nil
}

func (mr *ManifestRegistry) Get(id string) (*AgentManifest, bool) {
	mr.mu.RLock()
	defer mr.mu.RUnlock()
	m, ok := mr.manifests[id]
	return m, ok
}

func (mr *ManifestRegistry) FindByCapabilities(caps []string) *AgentManifest {
	mr.mu.RLock()
	defer mr.mu.RUnlock()

	for _, m := range mr.manifests {
		matchesAll := true
		for _, requiredCap := range caps {
			found := false
			for _, providedCap := range m.Capabilities {
				if providedCap == requiredCap {
					found = true
					break
				}
			}
			if !found {
				matchesAll = false
				break
			}
		}
		if matchesAll {
			return m
		}
	}
	return nil
}

func (mr *ManifestRegistry) LoadDirectory(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if !entry.IsDir() && (filepath.Ext(entry.Name()) == ".yaml" || filepath.Ext(entry.Name()) == ".yml") {
			_, err := mr.LoadManifest(filepath.Join(dir, entry.Name()))
			if err != nil {
				return fmt.Errorf("failed to load manifest %s: %w", entry.Name(), err)
			}
		}
	}
	return nil
}
