package kernel

import (
	"sync"
	"time"
)

type ProcessRole string

const (
	RoleSupervisor ProcessRole = "supervisor"
	RolePlanner    ProcessRole = "planner"
	RoleCoder      ProcessRole = "coder"
	RoleReviewer   ProcessRole = "reviewer"
)

type ProcessStatus string

const (
	ProcessCreated      ProcessStatus = "CREATED"
	ProcessQueued       ProcessStatus = "QUEUED"
	ProcessReady        ProcessStatus = "READY"
	ProcessRunning      ProcessStatus = "RUNNING"
	ProcessWaiting      ProcessStatus = "WAITING"
	ProcessBlocked      ProcessStatus = "BLOCKED"
	ProcessPaused       ProcessStatus = "PAUSED"
	ProcessCheckpointing ProcessStatus = "CHECKPOINTING"
	ProcessDone         ProcessStatus = "DONE"
	ProcessFailed       ProcessStatus = "FAILED"
	ProcessCancelled    ProcessStatus = "CANCELLED"
	ProcessRestarting   ProcessStatus = "RESTARTING"
)

type ProcessSpec struct {
	ID           string                 `json:"id"`
	ParentID     string                 `json:"parentId,omitempty"`
	SessionID    string                 `json:"sessionId"`
	WorkspaceID  string                 `json:"workspaceId"`
	Role         ProcessRole            `json:"role"`
	Goal         string                 `json:"goal"`
	Model        string                 `json:"model"`
	Timeout      time.Duration          `json:"timeout"`
	Capabilities []string               `json:"capabilities"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

type Process struct {
	ID          string        `json:"id"`
	ParentID    string        `json:"parentId,omitempty"`
	SessionID   string        `json:"sessionId"`
	WorkspaceID string        `json:"workspaceId"`
	Goal        string        `json:"goal"`
	Role        ProcessRole   `json:"role"`
	Status      ProcessStatus `json:"status"`
	Model       string        `json:"model"`
	Timeout     time.Duration `json:"timeout"`
	Capabilities []string     `json:"capabilities"`
	CreatedAt   time.Time     `json:"createdAt"`
	StartedAt   *time.Time    `json:"startedAt,omitempty"`
	EndedAt     *time.Time    `json:"endedAt,omitempty"`
}

type ProcessRegistry struct {
	mu        sync.RWMutex
	processes map[string]*Process
	children  map[string][]string // parentID -> childPIDs
}

func NewProcessRegistry() *ProcessRegistry {
	return &ProcessRegistry{
		processes: make(map[string]*Process),
		children:  make(map[string][]string),
	}
}

func (pr *ProcessRegistry) Register(proc *Process) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	pr.processes[proc.ID] = proc
	if proc.ParentID != "" {
		pr.children[proc.ParentID] = append(pr.children[proc.ParentID], proc.ID)
	}
}

func (pr *ProcessRegistry) Get(pid string) (*Process, bool) {
	pr.mu.RLock()
	defer pr.mu.RUnlock()

	p, ok := pr.processes[pid]
	return p, ok
}

func (pr *ProcessRegistry) UpdateStatus(pid string, status ProcessStatus) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	if p, ok := pr.processes[pid]; ok {
		p.Status = status
		now := time.Now()
		if status == ProcessRunning && p.StartedAt == nil {
			p.StartedAt = &now
		} else if (status == ProcessDone || status == ProcessFailed || status == ProcessCancelled) && p.EndedAt == nil {
			p.EndedAt = &now
		}
	}
}

func (pr *ProcessRegistry) List() []*Process {
	pr.mu.RLock()
	defer pr.mu.RUnlock()

	list := make([]*Process, 0, len(pr.processes))
	for _, p := range pr.processes {
		list = append(list, p)
	}
	return list
}

func (pr *ProcessRegistry) GetChildren(parentID string) []string {
	pr.mu.RLock()
	defer pr.mu.RUnlock()

	return pr.children[parentID]
}
