package memory

import (
	"context"
	"fmt"
	"time"

	"github.com/kendaliai/app/internal/agent"
)

type MemoryScope string

const (
	ScopeWorking   MemoryScope = "working"
	ScopeSession   MemoryScope = "session"
	ScopeGoal      MemoryScope = "goal"
	ScopeWorkspace MemoryScope = "workspace"
	ScopeUser      MemoryScope = "user"
	ScopeVector    MemoryScope = "vector"
)

type MemoryQuery struct {
	GoalID      string
	SessionID   string
	WorkspaceID string
	Scope       MemoryScope
	Query       string
	MaxTokens   int
}

type MemoryBroker struct {
	workingHistory  map[string][]agent.Message
	userPreferences map[string]string
}

func NewMemoryBroker() *MemoryBroker {
	return &MemoryBroker{
		workingHistory:  make(map[string][]agent.Message),
		userPreferences: make(map[string]string),
	}
}

func (mb *MemoryBroker) AppendWorking(sessionID string, msg agent.Message) {
	mb.workingHistory[sessionID] = append(mb.workingHistory[sessionID], msg)
}

func (mb *MemoryBroker) Retrieve(ctx context.Context, q MemoryQuery) ([]agent.Message, error) {
	var msgs []agent.Message

	switch q.Scope {
	case ScopeWorking:
		if hist, exists := mb.workingHistory[q.SessionID]; exists {
			msgs = append(msgs, hist...)
		}
	case ScopeUser:
		if pref, exists := mb.userPreferences[q.SessionID]; exists {
			msgs = append(msgs, agent.Message{
				Role:    "system",
				Content: fmt.Sprintf("User Preferences:\n%s", pref),
			})
		}
	case ScopeGoal:
		msgs = append(msgs, agent.Message{
			Role:    "system",
			Content: fmt.Sprintf("Active Goal: %s (Query: %s)", q.GoalID, q.Query),
		})
	default:
		msgs = append(msgs, agent.Message{
			Role:    "system",
			Content: fmt.Sprintf("Memory query completed for scope %s at %v", q.Scope, time.Now()),
		})
	}

	return msgs, nil
}
