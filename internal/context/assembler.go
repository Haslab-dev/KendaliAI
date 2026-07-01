package context

import (
	"context"
	"strings"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/memory"
)

type ContextPackage struct {
	SystemPrompt string
	Messages     []agent.Message
}

type ContextAssembler struct {
	MemoryBroker *memory.MemoryBroker
}

func NewContextAssembler(mb *memory.MemoryBroker) *ContextAssembler {
	return &ContextAssembler{
		MemoryBroker: mb,
	}
}

func (ca *ContextAssembler) Build(ctx context.Context, sessionID, goalID, query string) (*ContextPackage, error) {
	var prompts []string

	workingMsgs, _ := ca.MemoryBroker.Retrieve(ctx, memory.MemoryQuery{
		SessionID: sessionID,
		Scope:     memory.ScopeWorking,
		MaxTokens: 5000,
	})

	goalMsgs, _ := ca.MemoryBroker.Retrieve(ctx, memory.MemoryQuery{
		GoalID:    goalID,
		Query:     query,
		Scope:     memory.ScopeGoal,
		MaxTokens: 1000,
	})

	for _, m := range goalMsgs {
		prompts = append(prompts, m.Content)
	}

	sysPrompt := "You are a coordinated AI agent operating inside the Cognition Pipeline.\n"
	if len(prompts) > 0 {
		sysPrompt += "Goal Context:\n" + strings.Join(prompts, "\n")
	}

	var finalMsgs []agent.Message
	if len(workingMsgs) == 0 {
		finalMsgs = append(finalMsgs, agent.Message{Role: "user", Content: query})
	} else {
		finalMsgs = append(finalMsgs, workingMsgs...)
	}

	return &ContextPackage{
		SystemPrompt: sysPrompt,
		Messages:     finalMsgs,
	}, nil
}
