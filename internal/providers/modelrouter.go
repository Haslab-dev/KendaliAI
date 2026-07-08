package providers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"sort"

	"gopkg.in/yaml.v3"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
)

// ---------------------------------------------------------------------------
// RFC-0045 — Model Router & Inference Policy
//
// The Model Router is the single entry point for every inference request.
// Agents never call LLM providers directly; they submit an InferenceRequest
// and receive a chosen ModelSelection. The router is responsible for model
// selection, provider selection, fallback, retries, cost/latency optimization
// and context-window validation.
// ---------------------------------------------------------------------------

// InferenceRequest is the Runtime API described in RFC-0045 §11.
type InferenceRequest struct {
	AgentID        string
	AgentType      string
	TaskType       string
	Skills         []string
	ContextTokens  int
	Budget         float64 // max spend in USD for this request (0 = unlimited)
	PreferredModels []string // agent manifest preferredModels
	FallbackModels  []string // agent manifest fallbackModels
	Preferences    UserPreferences
}

// UserPreferences express per-request optimization intent.
type UserPreferences struct {
	PreferProvider string
	PreferModel    string
	CostPolicy     CostPolicy
}

// ModelSelection is returned by the router (RFC-0045 §11).
type ModelSelection struct {
	Provider string
	Model    string
}

// CostPolicy selects the optimization strategy (RFC-0045 §9).
type CostPolicy int

const (
	PolicyLowestCost CostPolicy = iota
	PolicyHighestQuality
	PolicyFastestResponse
	PolicyBalanced
)

func (c CostPolicy) String() string {
	switch c {
	case PolicyLowestCost:
		return "lowest_cost"
	case PolicyHighestQuality:
		return "highest_quality"
	case PolicyFastestResponse:
		return "fastest_response"
	default:
		return "balanced"
	}
}

// ModelCapability describes a single model registered in the catalog.
type ModelCapability struct {
	Provider        string
	Model           string
	ContextWindow   int
	CostPer1MTokens float64
	LatencyMs       int
	QualityScore    int // 1-100
	Available       bool
}

// RoutingRule matches an agent/task and ranks preferred models (RFC-0045 §7).
type RoutingRule struct {
	AgentType string   `yaml:"agentType"`
	TaskType  string   `yaml:"taskType"`
	Preferred []string `yaml:"preferred"`
	Fallback  []string `yaml:"fallback"`
}

// RoutingPolicy is the declarative configuration of the router (RFC-0045 §7).
type RoutingPolicy struct {
	Default  []string       `yaml:"default"`
	Fallback []string       `yaml:"fallback"`
	Rules    []RoutingRule  `yaml:"rules"`
}

// ProviderFactory builds an agent.Provider for a given provider/model pair.
type ProviderFactory func(provider, model string) (agent.Provider, error)

// ModelRouter selects and invokes models according to policy (RFC-0045).
type ModelRouter struct {
	catalog map[string]ModelCapability
	policy  RoutingPolicy
	factory ProviderFactory
}

func modelKey(provider, model string) string {
	return provider + "/" + model
}

// NewModelRouter constructs a router from an explicit catalog, policy and factory.
func NewModelRouter(policy RoutingPolicy, catalog []ModelCapability, factory ProviderFactory) *ModelRouter {
	m := &ModelRouter{
		catalog: make(map[string]ModelCapability),
		policy:  policy,
		factory: factory,
	}
	for _, c := range catalog {
		m.catalog[modelKey(c.Provider, c.Model)] = c
	}
	// When no policy rules or defaults are supplied, fall back to the entire
	// catalog so any request can still be satisfied (balanced by cost policy).
	if len(policy.Rules) == 0 && len(policy.Default) == 0 {
		for _, c := range catalog {
			m.policy.Default = append(m.policy.Default, c.Model)
		}
	}
	return m
}

// DefaultRoutingPolicy returns a balanced policy over the whole catalog.
func DefaultRoutingPolicy() RoutingPolicy {
	return RoutingPolicy{
		Default:  []string{},
		Fallback: []string{},
		Rules:    []RoutingRule{},
	}
}

// LoadRoutingPolicy reads a YAML routing policy from disk (RFC-0045 §7).
func LoadRoutingPolicy(path string) (RoutingPolicy, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return RoutingPolicy{}, err
	}
	var p RoutingPolicy
	if err := yaml.Unmarshal(data, &p); err != nil {
		return RoutingPolicy{}, err
	}
	return p, nil
}

// NewModelRouterFromConfig builds a router from application configuration,
// deriving the model catalog and provider factory from the configured providers.
func NewModelRouterFromConfig(cfg *config.Config) *ModelRouter {
	var catalog []ModelCapability
	for _, p := range cfg.ChatProviders {
		catalog = append(catalog, ModelCapability{
			Provider:        p.Type,
			Model:           p.Model,
			ContextWindow:   defaultContextWindow(p.Type, p.Model),
			CostPer1MTokens: defaultCost(p.Type, p.Model),
			LatencyMs:       defaultLatency(p.Type, p.Model),
			QualityScore:    defaultQuality(p.Type, p.Model),
			Available:       true,
		})
	}

	factory := func(provider, model string) (agent.Provider, error) {
		for _, p := range cfg.ChatProviders {
			if p.Type == provider && p.Model == model {
				switch p.Type {
				case "anthropic":
					return NewAnthropicProvider(p.APIKey, p.Model, p.Endpoint), nil
				default:
					return NewProvider(p.APIKey, p.Model, p.Endpoint), nil
				}
			}
		}
		return nil, fmt.Errorf("no provider configured for %s/%s", provider, model)
	}

	return NewModelRouter(DefaultRoutingPolicy(), catalog, factory)
}

// Route resolves an InferenceRequest to an ordered candidate list of model
// selections, applying policy, agent preferences, context-window validation,
// budget constraints and the selected cost policy.
func (r *ModelRouter) Route(req InferenceRequest) ([]ModelSelection, error) {
	candidates := r.candidateModels(req)
	if len(candidates) == 0 {
		return nil, errors.New("model router: no models satisfy the request")
	}

	// Context-window validation (RFC-0045 §4).
	var windowOK []ModelSelection
	for _, sel := range candidates {
		cap, ok := r.catalog[modelKey(sel.Provider, sel.Model)]
		if !ok {
			continue
		}
		if req.ContextTokens > 0 && cap.ContextWindow > 0 && req.ContextTokens > cap.ContextWindow {
			log.Printf("⚠️ ModelRouter: %s/%s context window %d < required %d, skipping",
				sel.Provider, sel.Model, cap.ContextWindow, req.ContextTokens)
			continue
		}
		if !cap.Available {
			continue
		}
		windowOK = append(windowOK, sel)
	}
	if len(windowOK) == 0 {
		return nil, fmt.Errorf("model router: no model with sufficient context window for %d tokens", req.ContextTokens)
	}

	// Budget constraint (RFC-0045 §9).
	if req.Budget > 0 {
		var affordable []ModelSelection
		for _, sel := range windowOK {
			cap := r.catalog[modelKey(sel.Provider, sel.Model)]
			if estimateCost(cap, req.ContextTokens) <= req.Budget {
				affordable = append(affordable, sel)
			}
		}
		if len(affordable) > 0 {
			windowOK = affordable
		}
	}

	policy := req.Preferences.CostPolicy

	// Preferred models are honored first (in declared order); the cost policy
	// only orders the remaining candidates (RFC-0045 §7 + §9).
	preferredSet := make(map[string]bool)
	for _, name := range req.PreferredModels {
		p, m := splitModel(name)
		if p == "" {
			if rp, rm, ok := r.resolveByName(m); ok {
				p, m = rp, rm
			}
		}
		preferredSet[modelKey(p, m)] = true
	}

	var preferred, rest []ModelSelection
	for _, sel := range windowOK {
		if preferredSet[modelKey(sel.Provider, sel.Model)] {
			preferred = append(preferred, sel)
		} else {
			rest = append(rest, sel)
		}
	}

	sort.SliceStable(rest, func(i, j int) bool {
		ci := r.catalog[modelKey(rest[i].Provider, rest[i].Model)]
		cj := r.catalog[modelKey(rest[j].Provider, rest[j].Model)]
		switch policy {
		case PolicyLowestCost:
			return ci.CostPer1MTokens < cj.CostPer1MTokens
		case PolicyHighestQuality:
			return ci.QualityScore > cj.QualityScore
		case PolicyFastestResponse:
			return ci.LatencyMs < cj.LatencyMs
		default: // balanced
			return balancedScore(ci) > balancedScore(cj)
		}
	})

	return append(preferred, rest...), nil
}

// candidateModels assembles the ordered candidate list from policy rules,
// agent preferences and the default chain.
func (r *ModelRouter) candidateModels(req InferenceRequest) []ModelSelection {
	seen := make(map[string]bool)
	var ordered []ModelSelection

	add := func(name string) {
		provider, model := splitModel(name)
		key := modelKey(provider, model)
		if seen[key] {
			return
		}
		if _, ok := r.catalog[key]; !ok {
			// model name only — resolve against the first catalog entry that matches by model
			if p, m, found := r.resolveByName(model); found {
				key = modelKey(p, m)
				if seen[key] {
					return
				}
				provider, model = p, m
			} else {
				return
			}
		}
		seen[key] = true
		ordered = append(ordered, ModelSelection{Provider: provider, Model: model})
	}

	// 1. Policy rules matching agent/task type (RFC-0045 §7).
	for _, rule := range r.policy.Rules {
		if rule.AgentType != "" && rule.AgentType != req.AgentType {
			continue
		}
		if rule.TaskType != "" && rule.TaskType != req.TaskType {
			continue
		}
		for _, m := range rule.Preferred {
			add(m)
		}
		for _, m := range rule.Fallback {
			add(m)
		}
	}

	// 2. Agent manifest preferences.
	for _, m := range req.PreferredModels {
		add(m)
	}
	for _, m := range req.FallbackModels {
		add(m)
	}

	// 3. Explicit user preference.
	if req.Preferences.PreferModel != "" {
		add(req.Preferences.PreferModel)
	}

	// 4. Policy default + fallback chains.
	for _, m := range r.policy.Default {
		add(m)
	}
	for _, m := range r.policy.Fallback {
		add(m)
	}

	return ordered
}

func (r *ModelRouter) resolveByName(model string) (string, string, bool) {
	for key, cap := range r.catalog {
		if cap.Model == model {
			return cap.Provider, cap.Model, true
		}
		_ = key
	}
	return "", "", false
}

// ChatCompletion routes the request and invokes providers with automatic
// fallback (RFC-0045 §8). The agent remains unaware of which provider answered.
func (r *ModelRouter) ChatCompletion(ctx context.Context, req InferenceRequest, msgs []agent.Message) (*agent.Response, error) {
	candidates, err := r.Route(req)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for _, cand := range candidates {
		prov, err := r.factory(cand.Provider, cand.Model)
		if err != nil {
			lastErr = err
			log.Printf("⚠️ ModelRouter: cannot build provider %s/%s: %v", cand.Provider, cand.Model, err)
			continue
		}
		resp, err := prov.ChatCompletion(ctx, msgs)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		log.Printf("⚠️ ModelRouter: %s/%s failed: %v, trying fallback", cand.Provider, cand.Model, err)
	}

	if lastErr == nil {
		lastErr = errors.New("model router: no providers available")
	}
	return nil, lastErr
}

// splitModel parses "provider/model" or bare "model" identifiers.
func splitModel(name string) (provider, model string) {
	for i := 0; i < len(name); i++ {
		if name[i] == '/' {
			return name[:i], name[i+1:]
		}
	}
	return "", name
}

func estimateCost(cap ModelCapability, contextTokens int) float64 {
	tokens := float64(contextTokens)
	if tokens == 0 {
		tokens = 4000 // assume a nominal request size
	}
	return (tokens / 1_000_000) * cap.CostPer1MTokens * 2 // input+output approximation
}

func balancedScore(cap ModelCapability) float64 {
	// Higher is better: quality dominates, penalized by cost and latency.
	normCost := cap.CostPer1MTokens / 100.0
	normLatency := float64(cap.LatencyMs) / 1000.0
	return float64(cap.QualityScore)/100.0 - 0.3*normCost - 0.2*normLatency
}

// ---------------------------------------------------------------------------
// Default capability heuristics for models without explicit metadata.
// ---------------------------------------------------------------------------

func defaultContextWindow(provider, model string) int {
	switch {
	case contains(model, "opus"):
		return 200000
	case contains(model, "sonnet"):
		return 200000
	case contains(model, "gemini"):
		return 1000000
	case contains(model, "gpt-4"):
		return 128000
	case contains(model, "gpt-3"):
		return 16000
	default:
		return 32000
	}
}

func defaultCost(provider, model string) float64 {
	switch {
	case contains(model, "opus"):
		return 15.0
	case contains(model, "sonnet"):
		return 3.0
	case contains(model, "gpt-4o"):
		return 5.0
	case contains(model, "gpt-4"):
		return 10.0
	case contains(model, "gpt-3.5"):
		return 0.5
	case contains(model, "gemini"):
		return 1.0
	case contains(model, "deepseek"):
		return 0.2
	default:
		return 1.0
	}
}

func defaultLatency(provider, model string) int {
	switch {
	case contains(model, "mini") || contains(model, "flash"):
		return 400
	case contains(model, "opus"):
		return 2500
	case contains(model, "sonnet"):
		return 1500
	default:
		return 1000
	}
}

func defaultQuality(provider, model string) int {
	switch {
	case contains(model, "opus"):
		return 95
	case contains(model, "sonnet"):
		return 90
	case contains(model, "gpt-4o"):
		return 88
	case contains(model, "gemini"):
		return 85
	case contains(model, "gpt-4"):
		return 82
	case contains(model, "deepseek"):
		return 78
	case contains(model, "gpt-3.5"):
		return 60
	default:
		return 70
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
