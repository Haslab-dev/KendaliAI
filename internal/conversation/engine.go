package conversation

import (
	"context"
	"fmt"
	"strings"

	"github.com/kendaliai/app/internal/goals"
	"github.com/kendaliai/app/internal/workflow"
)

type ConversationEngine struct {
	GoalManager    *goals.GoalManager
	WorkflowEngine *workflow.WorkflowEngine
}

func NewConversationEngine(gm *goals.GoalManager, we *workflow.WorkflowEngine) *ConversationEngine {
	return &ConversationEngine{
		GoalManager:    gm,
		WorkflowEngine: we,
	}
}

func (ce *ConversationEngine) ProcessInput(ctx context.Context, sessionID, text string) (string, error) {
	graph := ce.GoalManager.GetGraph(sessionID)
	textLower := strings.ToLower(text)

	// In a complete Hermes/OpenClaw setup, an LLM/intent classifier would map this to the Goal Tree.
	// For simulation / MAK verification, we match common keywords.
	if strings.Contains(textLower, "dark mode") || strings.Contains(textLower, "theme") {
		// If roots exist, add as subgoal to the first root
		g := graph.CreateRootGoal("Add Dark Mode support", text)
		return fmt.Sprintf("Evolved new goal: %s (ID: %s)", g.Title, g.ID), nil
	}

	g := graph.CreateRootGoal("Build Component: hello.go", text)

	_, err := ce.WorkflowEngine.Start(ctx, "simple_coding", sessionID)
	if err != nil {
		return "", fmt.Errorf("failed to trigger workflow for goal: %w", err)
	}

	return fmt.Sprintf("Evolved Goal: '%s' and successfully scheduled execution workflow.", g.Title), nil
}
