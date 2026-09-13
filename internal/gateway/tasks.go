package gateway

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/messaging"
)

// BackgroundTask represents an asynchronous agent execution running in the background.
type BackgroundTask struct {
	ID         string             `json:"id"`
	SessionID  string             `json:"sessionId"`
	AgentID    string             `json:"agentId"`
	Title      string             `json:"title"`
	Status     string             `json:"status"` // "running", "completed", "failed", "cancelled"
	StartedAt  int64              `json:"startedAt"`
	FinishedAt int64              `json:"finishedAt,omitempty"`
	Error      string             `json:"error,omitempty"`
	Result     string             `json:"result,omitempty"`
	cancel     context.CancelFunc `json:"-"`
}

// TaskManager coordinates running background tasks across multiple sessions in parallel.
type TaskManager struct {
	mu    sync.RWMutex
	tasks map[string]*BackgroundTask
	bus   *messaging.EventBus
}

func NewTaskManager(bus *messaging.EventBus) *TaskManager {
	return &TaskManager{
		tasks: make(map[string]*BackgroundTask),
		bus:   bus,
	}
}

// Register adds and starts tracking a new background agent turn.
func (tm *TaskManager) Register(sessionID, agentID, title string, cancel context.CancelFunc) *BackgroundTask {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	id := "task_" + uuid.New().String()[:8]
	t := &BackgroundTask{
		ID:        id,
		SessionID: sessionID,
		AgentID:   agentID,
		Title:     title,
		Status:    "running",
		StartedAt: time.Now().UnixMilli(),
		cancel:    cancel,
	}

	tm.tasks[id] = t

	if tm.bus != nil {
		tm.bus.Publish(messaging.Event{
			Type:      "task.started",
			SessionID: sessionID,
			AgentID:   agentID,
			Payload:   t,
		})
	}

	return t
}

// Complete marks a task as successfully completed.
func (tm *TaskManager) Complete(id, result string) {
	tm.mu.Lock()
	t, ok := tm.tasks[id]
	if ok {
		t.Status = "completed"
		t.FinishedAt = time.Now().UnixMilli()
		t.Result = result
	}
	tm.mu.Unlock()

	if ok && tm.bus != nil {
		tm.bus.Publish(messaging.Event{
			Type:      "task.completed",
			SessionID: t.SessionID,
			AgentID:   t.AgentID,
			Payload:   t,
		})
	}
}

// Fail marks a task as failed.
func (tm *TaskManager) Fail(id, errStr string) {
	tm.mu.Lock()
	t, ok := tm.tasks[id]
	if ok {
		t.Status = "failed"
		t.FinishedAt = time.Now().UnixMilli()
		t.Error = errStr
	}
	tm.mu.Unlock()

	if ok && tm.bus != nil {
		tm.bus.Publish(messaging.Event{
			Type:      "task.failed",
			SessionID: t.SessionID,
			AgentID:   t.AgentID,
			Payload:   t,
		})
	}
}

// Cancel terminates a running background task.
func (tm *TaskManager) Cancel(id string) error {
	tm.mu.Lock()
	t, ok := tm.tasks[id]
	if !ok {
		tm.mu.Unlock()
		return fmt.Errorf("task not found: %s", id)
	}

	if t.Status != "running" {
		tm.mu.Unlock()
		return fmt.Errorf("task %s is already %s", id, t.Status)
	}

	t.Status = "cancelled"
	t.FinishedAt = time.Now().UnixMilli()
	if t.cancel != nil {
		t.cancel()
	}
	tm.mu.Unlock()

	if tm.bus != nil {
		tm.bus.Publish(messaging.Event{
			Type:      "task.cancelled",
			SessionID: t.SessionID,
			AgentID:   t.AgentID,
			Payload:   t,
		})
	}

	return nil
}

// List returns all active and recent background tasks (most recent first).
func (tm *TaskManager) List() []*BackgroundTask {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	list := make([]*BackgroundTask, 0, len(tm.tasks))
	for _, t := range tm.tasks {
		// return copy
		cp := *t
		list = append(list, &cp)
	}

	// Sort most recent first
	for i := 0; i < len(list); i++ {
		for j := i + 1; j < len(list); j++ {
			if list[j].StartedAt > list[i].StartedAt {
				list[i], list[j] = list[j], list[i]
			}
		}
	}

	return list
}

// Get returns a single task by ID.
func (tm *TaskManager) Get(id string) *BackgroundTask {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	t, ok := tm.tasks[id]
	if !ok {
		return nil
	}
	cp := *t
	return &cp
}

// ActiveForSession returns the active running task for a session, if any.
func (tm *TaskManager) ActiveForSession(sessionID string) *BackgroundTask {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	for _, t := range tm.tasks {
		if t.SessionID == sessionID && t.Status == "running" {
			cp := *t
			return &cp
		}
	}
	return nil
}
