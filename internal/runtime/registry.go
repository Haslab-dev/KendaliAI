package runtime

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

// ---------------------------------------------------------------------------
// RFC-0044 — Agent Registry & Manifest
//
// Every Agent is created from an Agent Manifest. The runtime executes only one
// Generic Agent implementation; behavior is defined entirely by configuration.
// The Registry discovers, validates and instantiates manifests at startup.
// ---------------------------------------------------------------------------

// AgentState tracks the lifecycle of a registered/active agent (RFC-0044 §9).
type AgentState string

const (
	StateRegister  AgentState = "REGISTER"
	StateValidate  AgentState = "VALIDATE"
	StateReady     AgentState = "READY"
	StateSpawn     AgentState = "SPAWN"
	StateSuspend   AgentState = "SUSPEND"
	StateResume    AgentState = "RESUME"
	StateTerminate AgentState = "TERMINATE"
)

// AgentManifest is the declarative description of an Agent (RFC-0044 §5).
type AgentManifest struct {
	ID              string   `yaml:"id"`
	DisplayName     string   `yaml:"displayName"`
	Description     string   `yaml:"description"`
	SystemPrompt    string   `yaml:"systemPrompt"`
	DefaultSkills   []string `yaml:"defaultSkills"`
	PreferredModels []string `yaml:"preferredModels"`
	FallbackModels  []string `yaml:"fallbackModels"`
	MaxConcurrency  int      `yaml:"maxConcurrency"`
	ApprovalRequired bool    `yaml:"approvalRequired"`

	// Extended runtime fields used by the Generic Agent Runtime (RFC-0042 §6).
	Capabilities []string `yaml:"capabilities"`
	Policies     []string `yaml:"policies"`
}

// Validate ensures the manifest is internally consistent.
func (m *AgentManifest) Validate() error {
	if m.ID == "" {
		return fmt.Errorf("agent manifest requires an id")
	}
	if m.SystemPrompt == "" {
		return fmt.Errorf("agent manifest %q requires a systemPrompt", m.ID)
	}
	if m.MaxConcurrency <= 0 {
		m.MaxConcurrency = 1
	}
	return nil
}

// AgentRegistry stores and discovers agent manifests (RFC-0044 §4, §7).
type AgentRegistry struct {
	mu        sync.RWMutex
	manifests map[string]*AgentManifest
	states    map[string]AgentState
}

func NewAgentRegistry() *AgentRegistry {
	return &AgentRegistry{
		manifests: make(map[string]*AgentManifest),
		states:    make(map[string]AgentState),
	}
}

// LoadManifest reads, validates and registers a single manifest file.
func (r *AgentRegistry) LoadManifest(path string) (*AgentManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var m AgentManifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, err
	}

	if err := m.Validate(); err != nil {
		return nil, err
	}

	r.mu.Lock()
	r.manifests[m.ID] = &m
	r.states[m.ID] = StateRegister
	r.mu.Unlock()

	return &m, nil
}

// LoadDirectory scans an agents/ directory and registers every YAML manifest.
func (r *AgentRegistry) LoadDirectory(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := filepath.Ext(entry.Name())
		if ext != ".yaml" && ext != ".yml" {
			continue
		}
		if _, err := r.LoadManifest(filepath.Join(dir, entry.Name())); err != nil {
			return fmt.Errorf("failed to load manifest %s: %w", entry.Name(), err)
		}
	}
	return nil
}

// Get returns a registered manifest by id (RFC-0044 §8).
func (r *AgentRegistry) Get(id string) (*AgentManifest, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.manifests[id]
	return m, ok
}

// SetState transitions an agent's lifecycle state (RFC-0044 §9).
func (r *AgentRegistry) SetState(id string, state AgentState) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.states[id] = state
}

// State returns the current lifecycle state of an agent.
func (r *AgentRegistry) State(id string) (AgentState, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.states[id]
	return s, ok
}

// FindByCapabilities returns the first manifest providing every capability
// (RFC-0044 §6 — used when a Workflow attaches dynamic requirements).
func (r *AgentRegistry) FindByCapabilities(caps []string) *AgentManifest {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, m := range r.manifests {
		matchesAll := true
		for _, required := range caps {
			found := false
			for _, provided := range m.Capabilities {
				if provided == required {
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

// List returns all registered manifests.
func (r *AgentRegistry) List() []*AgentManifest {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]*AgentManifest, 0, len(r.manifests))
	for _, m := range r.manifests {
		out = append(out, m)
	}
	return out
}
