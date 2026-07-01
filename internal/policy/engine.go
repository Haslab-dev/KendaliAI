package policy

import (
	"context"
	"fmt"
)

type PolicyEffect string

const (
	EffectAllow PolicyEffect = "ALLOW"
	EffectDeny  PolicyEffect = "DENY"
)

type Policy struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Effect  PolicyEffect `json:"effect"`
	Actions []string     `json:"actions"`
	Role    string       `json:"role"`
	Enabled bool         `json:"enabled"`
}

type PolicyEngine struct {
	policies map[string]*Policy
}

func NewPolicyEngine() *PolicyEngine {
	pe := &PolicyEngine{
		policies: make(map[string]*Policy),
	}

	pe.policies["policy-coder"] = &Policy{
		ID:      "policy-coder",
		Name:    "Coder Policy",
		Effect:  EffectAllow,
		Role:    "coder",
		Actions: []string{"read_files", "write_files", "list_files", "search_files", "modify_code", "shell", "git", "build", "test"},
		Enabled: true,
	}

	pe.policies["policy-reviewer"] = &Policy{
		ID:      "policy-reviewer",
		Name:    "Reviewer Policy",
		Effect:  EffectAllow,
		Role:    "reviewer",
		Actions: []string{"read_files", "search_files", "git_diff"},
		Enabled: true,
	}

	return pe
}

func (pe *PolicyEngine) Evaluate(ctx context.Context, role, action string) (bool, error) {
	for _, p := range pe.policies {
		if !p.Enabled {
			continue
		}
		if p.Role == role {
			for _, act := range p.Actions {
				if act == action {
					return p.Effect == EffectAllow, nil
				}
			}
		}
	}
	return false, fmt.Errorf("action %s not explicitly allowed for role %s", action, role)
}
