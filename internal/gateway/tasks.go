package gateway

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/messaging"
)

// BackgroundTask represents an asynchronous agent execution running in the background.
type BackgroundTask struct {
	ID              string             `json:"id"`
	SessionID       string             `json:"sessionId"`
	ParentSessionID string             `json:"parentSessionId,omitempty"`
	AgentID         string             `json:"agentId"`
	Title           string             `json:"title"`
	Status          string             `json:"status"` // "running", "queued", "completed", "failed", "cancelled", "interrupted"
	StartedAt       int64              `json:"startedAt"`
	FinishedAt      int64              `json:"finishedAt,omitempty"`
	Error           string             `json:"error,omitempty"`
	Result          string             `json:"result,omitempty"`
	cancel          context.CancelFunc `json:"-"`
}

// TaskManager coordinates running background tasks across multiple sessions in parallel.
// When a Store is attached, task state is persisted so it survives a restart.
type TaskManager struct {
	mu    sync.RWMutex
	tasks map[string]*BackgroundTask
	bus   *messaging.EventBus
	store *Store
}

func NewTaskManager(bus *messaging.EventBus, stores ...*Store) *TaskManager {
	tm := &TaskManager{
		tasks: make(map[string]*BackgroundTask),
		bus:   bus,
	}
	if len(stores) > 0 {
		tm.store = stores[0]
	}
	return tm
}

// Register adds and starts tracking a new background agent turn.
func (tm *TaskManager) Register(sessionID, agentID, title string, cancel context.CancelFunc, parentSessionIDs ...string) *BackgroundTask {
	parent := ""
	if len(parentSessionIDs) > 0 {
		parent = parentSessionIDs[0]
	}

	tm.mu.Lock()
	id := "task_" + uuid.New().String()[:8]
	t := &BackgroundTask{
		ID:              id,
		SessionID:       sessionID,
		ParentSessionID: parent,
		AgentID:         agentID,
		Title:           title,
		Status:          "running",
		StartedAt:       time.Now().UnixMilli(),
		cancel:          cancel,
	}
	tm.tasks[id] = t
	store := tm.store
	tm.mu.Unlock()

	if store != nil {
		_ = store.SaveAgentTask(t)
	}

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
	store := tm.store
	tm.mu.Unlock()

	if ok && store != nil {
		_ = store.UpdateAgentTask(id, "completed", "", result)
	}

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
	store := tm.store
	tm.mu.Unlock()

	if ok && store != nil {
		_ = store.UpdateAgentTask(id, "failed", errStr, "")
	}

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
		// The task may have been rehydrated from the DB after a restart.
		if tm.store != nil {
			if dbTask, _ := tm.store.GetAgentTask(id); dbTask != nil {
				return tm.store.UpdateAgentTask(id, "cancelled", "cancelled", "")
			}
		}
		return fmt.Errorf("task not found: %s", id)
	}

	if t.Status != "running" && t.Status != "queued" {
		tm.mu.Unlock()
		return fmt.Errorf("task %s is already %s", id, t.Status)
	}

	t.Status = "cancelled"
	t.FinishedAt = time.Now().UnixMilli()
	if t.cancel != nil {
		t.cancel()
	}
	store := tm.store
	tm.mu.Unlock()

	if store != nil {
		_ = store.UpdateAgentTask(id, "cancelled", "cancelled", "")
	}

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
	store := tm.store
	inMemory := make(map[string]*BackgroundTask, len(tm.tasks))
	for id, t := range tm.tasks {
		cp := *t
		inMemory[id] = &cp
	}
	tm.mu.RUnlock()

	// The DB is the durable view; overlay cancellable handles from memory.
	if store != nil {
		list := store.ListAgentTasks(200)
		for _, t := range list {
			if mem, ok := inMemory[t.ID]; ok && mem.Status != t.Status {
				t.Status = mem.Status
			}
		}
		return sortTasks(list)
	}

	list := make([]*BackgroundTask, 0, len(inMemory))
	for _, t := range inMemory {
		list = append(list, t)
	}
	return sortTasks(list)
}

func sortTasks(list []*BackgroundTask) []*BackgroundTask {
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
	t, ok := tm.tasks[id]
	if ok {
		cp := *t
		tm.mu.RUnlock()
		return &cp
	}
	store := tm.store
	tm.mu.RUnlock()

	if store != nil {
		if dbTask, _ := store.GetAgentTask(id); dbTask != nil {
			return dbTask
		}
	}
	return nil
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

// TasksForParent returns the tasks delegated by a parent session.
func (tm *TaskManager) TasksForParent(parentSessionID string) []*BackgroundTask {
	if parentSessionID == "" {
		return nil
	}
	if tm.store != nil {
		return tm.store.ListAgentTasksByParent(parentSessionID)
	}
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	var list []*BackgroundTask
	for _, t := range tm.tasks {
		if t.ParentSessionID == parentSessionID {
			cp := *t
			list = append(list, &cp)
		}
	}
	return sortTasks(list)
}

// --- Persistence ---

func (s *Store) SaveAgentTask(t *BackgroundTask) error {
	if s == nil || s.db == nil || t == nil {
		return nil
	}
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO agent_tasks
			(id, parent_session_id, session_id, agent_id, title, status, started_at, finished_at, error, result)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.ParentSessionID, t.SessionID, t.AgentID, t.Title, t.Status,
		t.StartedAt, t.FinishedAt, t.Error, t.Result)
	return err
}

func (s *Store) UpdateAgentTask(id, status, errStr, result string) error {
	if s == nil || s.db == nil {
		return nil
	}
	finishedAt := int64(0)
	if status != "running" && status != "queued" {
		finishedAt = time.Now().UnixMilli()
	}
	_, err := s.db.Exec(`
		UPDATE agent_tasks SET status = ?, error = ?, result = ?, finished_at = ? WHERE id = ?`,
		status, errStr, result, finishedAt, id)
	return err
}

func scanAgentTask(row interface {
	Scan(dest ...interface{}) error
}) (*BackgroundTask, error) {
	var t BackgroundTask
	var finishedAt sql.NullInt64
	var parent, agentID, title, errStr, result sql.NullString
	if err := row.Scan(&t.ID, &parent, &t.SessionID, &agentID, &title, &t.Status, &t.StartedAt, &finishedAt, &errStr, &result); err != nil {
		return nil, err
	}
	t.ParentSessionID = parent.String
	t.AgentID = agentID.String
	t.Title = title.String
	t.FinishedAt = finishedAt.Int64
	t.Error = errStr.String
	t.Result = result.String
	return &t, nil
}

const agentTaskColumns = `id, COALESCE(parent_session_id, ''), session_id, COALESCE(agent_id, ''), COALESCE(title, ''), status, started_at, finished_at, COALESCE(error, ''), COALESCE(result, '')`

func (s *Store) GetAgentTask(id string) (*BackgroundTask, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("store unavailable")
	}
	row := s.db.QueryRow(`SELECT `+agentTaskColumns+` FROM agent_tasks WHERE id = ?`, id)
	return scanAgentTask(row)
}

func (s *Store) ListAgentTasks(limit int) []*BackgroundTask {
	if s == nil || s.db == nil {
		return nil
	}
	if limit <= 0 {
		limit = 200
	}
	rows, err := s.db.Query(`SELECT `+agentTaskColumns+` FROM agent_tasks ORDER BY started_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var list []*BackgroundTask
	for rows.Next() {
		if t, err := scanAgentTask(rows); err == nil {
			list = append(list, t)
		}
	}
	return list
}

func (s *Store) ListAgentTasksByParent(parentSessionID string) []*BackgroundTask {
	if s == nil || s.db == nil || parentSessionID == "" {
		return nil
	}
	rows, err := s.db.Query(`SELECT `+agentTaskColumns+` FROM agent_tasks WHERE parent_session_id = ? ORDER BY started_at DESC`, parentSessionID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var list []*BackgroundTask
	for rows.Next() {
		if t, err := scanAgentTask(rows); err == nil {
			list = append(list, t)
		}
	}
	return list
}

// MarkInterruptedTasks closes out tasks left running by a previous process.
func (s *Store) MarkInterruptedTasks() {
	if s == nil || s.db == nil {
		return
	}
	_, _ = s.db.Exec(`UPDATE agent_tasks SET status = 'interrupted', error = 'server restarted', finished_at = ? WHERE status IN ('running', 'queued')`, time.Now().UnixMilli())
}
