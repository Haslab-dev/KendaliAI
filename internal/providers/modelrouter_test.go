package providers

import (
	"context"
	"errors"
	"testing"

	"github.com/kendaliai/app/internal/agent"
)

// mockProvider records calls and optionally fails.
type mockProvider struct {
	fail   bool
	calls  int
	resp   string
}

func (m *mockProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	m.calls++
	if m.fail {
		return nil, errors.New("provider unavailable")
	}
	return &agent.Response{Content: m.resp, InputTokens: 10, OutputTokens: 5}, nil
}

func testCatalog() []ModelCapability {
	return []ModelCapability{
		{Provider: "anthropic", Model: "claude-sonnet", ContextWindow: 200000, CostPer1MTokens: 3.0, LatencyMs: 1500, QualityScore: 90, Available: true},
		{Provider: "openai", Model: "gpt-5", ContextWindow: 128000, CostPer1MTokens: 10.0, LatencyMs: 1000, QualityScore: 88, Available: true},
		{Provider: "google", Model: "gemini", ContextWindow: 1000000, CostPer1MTokens: 1.0, LatencyMs: 800, QualityScore: 85, Available: true},
		{Provider: "openai", Model: "gpt-4o-mini", ContextWindow: 128000, CostPer1MTokens: 0.5, LatencyMs: 400, QualityScore: 60, Available: true},
	}
}

func testFactory(control map[string]*mockProvider) ProviderFactory {
	return func(provider, model string) (agent.Provider, error) {
		key := provider + "/" + model
		if mp, ok := control[key]; ok {
			return mp, nil
		}
		return &mockProvider{resp: key}, nil
	}
}

func TestRoute_PrefersAgentModels(t *testing.T) {
	router := NewModelRouter(DefaultRoutingPolicy(), testCatalog(), testFactory(nil))

	sel, err := router.Route(InferenceRequest{
		AgentType:       "coder",
		PreferredModels: []string{"claude-sonnet", "gpt-5"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sel) == 0 {
		t.Fatal("expected at least one candidate")
	}
	if sel[0].Model != "claude-sonnet" {
		t.Fatalf("expected claude-sonnet first, got %s", sel[0].Model)
	}
}

func TestRoute_ContextWindowValidation(t *testing.T) {
	router := NewModelRouter(DefaultRoutingPolicy(), testCatalog(), testFactory(nil))

	// gpt-4o-mini fits; require more than its window to force exclusion of tiny models
	sel, err := router.Route(InferenceRequest{
		ContextTokens: 150000, // exceeds 128k window of gpt-4o-mini and gpt-5
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, s := range sel {
		if s.Model == "gpt-4o-mini" || s.Model == "gpt-5" {
			t.Fatalf("model %s should be excluded by context window", s.Model)
		}
	}
	if len(sel) == 0 {
		t.Fatal("expected gemini/claude-sonnet to remain")
	}
}

func TestRoute_CostPolicyLowestCost(t *testing.T) {
	router := NewModelRouter(DefaultRoutingPolicy(), testCatalog(), testFactory(nil))

	sel, err := router.Route(InferenceRequest{
		Preferences: UserPreferences{CostPolicy: PolicyLowestCost},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sel[0].Model != "gpt-4o-mini" {
		t.Fatalf("expected cheapest gpt-4o-mini first, got %s", sel[0].Model)
	}
}

func TestRoute_HighestQuality(t *testing.T) {
	router := NewModelRouter(DefaultRoutingPolicy(), testCatalog(), testFactory(nil))

	sel, err := router.Route(InferenceRequest{
		Preferences: UserPreferences{CostPolicy: PolicyHighestQuality},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sel[0].Model != "claude-sonnet" {
		t.Fatalf("expected highest quality claude-sonnet first, got %s", sel[0].Model)
	}
}

func TestChatCompletion_FallbackOnFailure(t *testing.T) {
	control := map[string]*mockProvider{
		"anthropic/claude-sonnet": {fail: true},
		"openai/gpt-5":            {fail: true},
	}
	router := NewModelRouter(DefaultRoutingPolicy(), testCatalog(), testFactory(control))

	resp, err := router.ChatCompletion(context.Background(), InferenceRequest{
		PreferredModels: []string{"claude-sonnet", "gpt-5", "gemini"},
	}, nil)
	if err != nil {
		t.Fatalf("expected fallback to succeed, got error: %v", err)
	}
	if resp.Content != "google/gemini" {
		t.Fatalf("expected google/gemini response, got %s", resp.Content)
	}
}

func TestChatCompletion_AllFail(t *testing.T) {
	control := map[string]*mockProvider{
		"anthropic/claude-sonnet": {fail: true},
		"openai/gpt-5":            {fail: true},
		"google/gemini":           {fail: true},
		"openai/gpt-4o-mini":      {fail: true},
	}
	router := NewModelRouter(DefaultRoutingPolicy(), testCatalog(), testFactory(control))

	_, err := router.ChatCompletion(context.Background(), InferenceRequest{}, nil)
	if err == nil {
		t.Fatal("expected error when all providers fail")
	}
}

func TestRoute_NoCandidates(t *testing.T) {
	router := NewModelRouter(DefaultRoutingPolicy(), testCatalog(), testFactory(nil))
	// tiny window excludes everything
	_, err := router.Route(InferenceRequest{ContextTokens: 2_000_000})
	if err == nil {
		t.Fatal("expected error: no model with sufficient context window")
	}
}
