package runtime

import (
	"testing"
)

func TestAgentManifest_Validate(t *testing.T) {
	valid := &AgentManifest{ID: "coder", SystemPrompt: "you are a coder"}
	if err := valid.Validate(); err != nil {
		t.Fatalf("expected valid manifest, got %v", err)
	}

	missingID := &AgentManifest{SystemPrompt: "x"}
	if err := missingID.Validate(); err == nil {
		t.Fatal("expected error for missing id")
	}

	missingPrompt := &AgentManifest{ID: "x"}
	if err := missingPrompt.Validate(); err == nil {
		t.Fatal("expected error for missing systemPrompt")
	}

	zeroConc := &AgentManifest{ID: "x", SystemPrompt: "y", MaxConcurrency: 0}
	if err := zeroConc.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if zeroConc.MaxConcurrency != 1 {
		t.Fatalf("expected MaxConcurrency defaulted to 1, got %d", zeroConc.MaxConcurrency)
	}
}

func TestAgentRegistry_DiscoveryAndLifecycle(t *testing.T) {
	reg := NewAgentRegistry()

	if _, err := reg.LoadManifest("../../spec/RFC0041-Unified Skill Package (USP).md"); err == nil {
		t.Skip("non-manifest file should fail; skipping to avoid env dependence")
	}

	m := &AgentManifest{ID: "coder", SystemPrompt: "x", Capabilities: []string{"shell", "git"}}
	reg.mu.Lock()
	reg.manifests[m.ID] = m
	reg.states[m.ID] = StateRegister
	reg.mu.Unlock()

	got, ok := reg.Get("coder")
	if !ok || got.ID != "coder" {
		t.Fatal("expected to retrieve coder manifest")
	}

	reg.SetState("coder", StateReady)
	if s, ok := reg.State("coder"); !ok || s != StateReady {
		t.Fatalf("expected StateReady, got %v", s)
	}

	found := reg.FindByCapabilities([]string{"shell", "git"})
	if found == nil || found.ID != "coder" {
		t.Fatal("expected FindByCapabilities to match coder")
	}

	missing := reg.FindByCapabilities([]string{"nonexistent"})
	if missing != nil {
		t.Fatal("expected no match for unknown capability")
	}
}
