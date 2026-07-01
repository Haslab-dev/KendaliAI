package providers

import (
	"fmt"
)

type TaskProfile struct {
	TaskType     string  `json:"taskType"`
	ContextSize  int     `json:"contextSize"`
	RequiresFork bool    `json:"requiresFork"`
	CostBudget   float64 `json:"costBudget"`
}

type ModelBroker struct {
	fallbacks map[string][]string
}

func NewModelBroker() *ModelBroker {
	broker := &ModelBroker{
		fallbacks: make(map[string][]string),
	}
	broker.fallbacks["plan"] = []string{"openai/gpt-4o", "anthropic/claude-3-opus", "gemini/gemini-1.5-pro"}
	broker.fallbacks["code"] = []string{"openai/gpt-4-turbo", "anthropic/claude-3-sonnet"}
	broker.fallbacks["review"] = []string{"openai/gpt-3.5-turbo", "google/gemma-2"}
	return broker
}

func (mb *ModelBroker) Resolve(profile TaskProfile) ([]string, error) {
	chain, exists := mb.fallbacks[profile.TaskType]
	if !exists {
		return nil, fmt.Errorf("no model fallback chain registered for task type: %s", profile.TaskType)
	}

	if profile.ContextSize > 100000 {
		var deepChain []string
		for _, m := range chain {
			if m == "openai/gpt-4o" || m == "gemini/gemini-1.5-pro" {
				deepChain = append(deepChain, m)
			}
		}
		return deepChain, nil
	}

	return chain, nil
}
