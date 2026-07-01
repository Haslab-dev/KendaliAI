# RFC-0028: Checkpoint Manager

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000, RFC-0001, RFC-0020

## Problem

Currently if a task crashes at step 56:

```
Task 54 ✓
Task 55 ✓
Task 56 ✗ (crash)
Task 57 -
Task 58 -
```

There's no way to resume from step 55.

Users must restart the entire workflow.

## Solution

```
Session
  │
  ▼
Checkpoint Manager
  │
  ├── Snapshot Workspace
  ├── Snapshot Memory
  ├── Snapshot DAG
  ├── Snapshot Artifacts
  └── Snapshot State
```

## Checkpoint Schema

```go
type Checkpoint struct {
    ID            string
    SessionID    string
    WorkflowID   string
    DAGID        string
    Version      int             // Incremental version
    Label        string          // Optional label
    CreatedAt    time.Time
    ExpiresAt    *time.Time     // Optional TTL

    // Snapshotted state
    Workspace    *WorkspaceSnapshot
    Memory       *MemorySnapshot
    DAG          *DAGSnapshot
    Artifacts    []*ArtifactSnapshot
    ProcessState *ProcessStateSnapshot

    Metadata      map[string]interface{}
}

type WorkspaceSnapshot struct {
    ID          string
    RootPath    string
    Files       map[string]*FileSnapshot
    GitBranch   string
    GitCommit   string
}

type FileSnapshot struct {
    Path       string
    Content    []byte
    Checksum   string
    ModifiedAt time.Time
}

type MemorySnapshot struct {
    Facts       []UserFact
    Preferences []Preference
    Blackboard []*BlackboardEntry
    Context    map[string]interface{}
}

type DAGSnapshot struct {
    ID          string
    Status      DAGStatus
    Tasks       []*TaskSnapshot
    CurrentTask string  // Task being executed
    Completed   int
    Failed      int
}

type TaskSnapshot struct {
    ID          string
    Name        string
    Status      TaskStatus
    Output      interface{}
    Error       string
    Attempts    int
}

type ArtifactSnapshot struct {
    ID       string
    Name     string
    Type     string
    Path     string
    Checksum string
    Version  int
}

type ProcessStateSnapshot struct {
    ProcessID  string
    Role      ProcessRole
    Status    ProcessStatus
    Variables map[string]interface{}
}
```

## Checkpoint Manager Interface

```go
type CheckpointManager interface {
    // Create checkpoint
    Create(ctx context.Context, req *CreateCheckpointRequest) (*Checkpoint, error)

    // Restore from checkpoint
    Restore(ctx context.Context, checkpointID string) (*RestoreResult, error)

    // List checkpoints
    List(ctx context.Context, sessionID string) ([]*Checkpoint, error)

    // Get checkpoint
    Get(ctx context.Context, id string) (*Checkpoint, error)

    // Delete checkpoint
    Delete(ctx context.Context, id string) error

    // Cleanup expired checkpoints
    Cleanup(ctx context.Context) (int, error)

    // Auto-checkpoint configuration
    SetAutoCheckpoint(ctx context.Context, config *AutoCheckpointConfig) error
}

type CreateCheckpointRequest struct {
    SessionID  string
    WorkflowID string
    DAGID      string
    Label      string  // Optional label
    TTL        time.Duration
    Incremental bool   // If true, only snapshot changes since last checkpoint
}

type RestoreResult struct {
    WorkspaceRestored bool
    MemoryRestored   bool
    DAGRestored      bool
    ArtifactsRestored bool
    ProcessStateRestored bool
    RollbackToTask   string  // Task to resume from
}
```

## Checkpoint Creation

```go
func (m *CheckpointManager) Create(ctx context.Context, req *CreateCheckpointRequest) (*Checkpoint, error) {
    // Get previous checkpoint for incremental
    var prevCheckpoint *Checkpoint
    if req.Incremental {
        prevCheckpoint, _ = m.getLatest(ctx, req.SessionID)
    }

    checkpoint := &Checkpoint{
        ID:          uuid.New().String(),
        SessionID:   req.SessionID,
        WorkflowID:  req.WorkflowID,
        DAGID:       req.DAGID,
        Version:     prevCheckpoint.Version + 1,
        Label:       req.Label,
        CreatedAt:  time.Now(),
    }

    if req.TTL > 0 {
        exp := time.Now().Add(req.TTL)
        checkpoint.ExpiresAt = &exp
    }

    // Snapshot workspace
    workspaceSnap, err := m.snapshotWorkspace(ctx, req.SessionID, prevCheckpoint)
    if err != nil {
        return nil, err
    }
    checkpoint.Workspace = workspaceSnap

    // Snapshot memory
    checkpoint.Memory, _ = m.snapshotMemory(ctx, req.SessionID)

    // Snapshot DAG
    checkpoint.DAG, _ = m.snapshotDAG(ctx, req.DAGID)

    // Snapshot artifacts
    checkpoint.Artifacts, _ = m.snapshotArtifacts(ctx, req.SessionID, prevCheckpoint)

    // Snapshot process state
    checkpoint.ProcessState, _ = m.snapshotProcessState(ctx, req.SessionID)

    // Save to store
    if err := m.store.Save(ctx, checkpoint); err != nil {
        return nil, err
    }

    return checkpoint, nil
}

func (m *CheckpointManager) snapshotWorkspace(ctx context.Context, sessionID string, prev *Checkpoint) (*WorkspaceSnapshot, error) {
    workspace, err := m.workspaceManager.GetBySession(ctx, sessionID)
    if err != nil {
        return nil, err
    }

    snap := &WorkspaceSnapshot{
        ID:        workspace.ID,
        RootPath:  workspace.RootPath,
        GitBranch: workspace.Branch,
    }

    // List files
    files, err := m.workspaceManager.ListFiles(ctx, workspace.RootPath)
    if err != nil {
        return nil, err
    }

    snap.Files = make(map[string]*FileSnapshot)

    for _, file := range files {
        // Check if changed since last checkpoint
        if prev != nil && prev.Workspace != nil {
            if prevFile, ok := prev.Workspace.Files[file.Path]; ok {
                if prevFile.Checksum == file.Checksum {
                    // Unchanged, skip content
                    snap.Files[file.Path] = prevFile
                    continue
                }
            }
        }

        // Read and snapshot
        content, err := os.ReadFile(filepath.Join(workspace.RootPath, file.Path))
        if err != nil {
            continue
        }

        snap.Files[file.Path] = &FileSnapshot{
            Path:     file.Path,
            Content:  content,
            Checksum: file.Checksum,
        }
    }

    // Get git commit
    if gitCommit, err := m.gitClient.CurrentCommit(ctx, workspace.RootPath); err == nil {
        snap.GitCommit = gitCommit
    }

    return snap, nil
}
```

## Checkpoint Restoration

```go
func (m *CheckpointManager) Restore(ctx context.Context, checkpointID string) (*RestoreResult, error) {
    checkpoint, err := m.Get(ctx, checkpointID)
    if err != nil {
        return nil, err
    }

    result := &RestoreResult{}

    // Restore workspace
    if err := m.restoreWorkspace(ctx, checkpoint.Workspace); err != nil {
        return nil, err
    }
    result.WorkspaceRestored = true

    // Restore memory
    if err := m.restoreMemory(ctx, checkpoint.SessionID, checkpoint.Memory); err != nil {
        return nil, err
    }
    result.MemoryRestored = true

    // Restore DAG
    if err := m.restoreDAG(ctx, checkpoint.DAG); err != nil {
        return nil, err
    }
    result.DAGRestored = true

    // Restore artifacts
    if err := m.restoreArtifacts(ctx, checkpoint.SessionID, checkpoint.Artifacts); err != nil {
        return nil, err
    }
    result.ArtifactsRestored = true

    // Restore process state
    if err := m.restoreProcessState(ctx, checkpoint.ProcessState); err != nil {
        return nil, err
    }
    result.ProcessStateRestored = true

    // Determine where to resume
    result.RollbackToTask = m.determineResumeTask(checkpoint.DAG)

    return result, nil
}

func (m *CheckpointManager) restoreWorkspace(ctx context.Context, snap *WorkspaceSnapshot) error {
    workspace, err := m.workspaceManager.GetBySession(ctx, snap.ID)
    if err != nil {
        return err
    }

    // Restore files
    for path, fileSnap := range snap.Files {
        fullPath := filepath.Join(workspace.RootPath, path)

        // Ensure directory exists
        os.MkdirAll(filepath.Dir(fullPath), 0755)

        // Write file
        if err := os.WriteFile(fullPath, fileSnap.Content, 0644); err != nil {
            return err
        }
    }

    // Restore git state
    if snap.GitCommit != "" {
        m.gitClient.Checkout(ctx, workspace.RootPath, snap.GitCommit)
    }

    return nil
}

func (m *CheckpointManager) determineResumeTask(dagSnap *DAGSnapshot) string {
    // Find the last completed task
    var lastCompleted string
    for _, task := range dagSnap.Tasks {
        if task.Status == TaskStatusDone {
            lastCompleted = task.ID
        }
    }
    return lastCompleted
}
```

## Auto-Checkpoint

```go
type AutoCheckpointConfig struct {
    Enabled       bool
    Interval      time.Duration  // Create checkpoint every N minutes
    OnPhaseEnd    bool           // Checkpoint after each workflow phase
    OnTaskEnd     bool           // Checkpoint after each task
    MaxCheckpoints int           // Keep last N checkpoints
    Incremental   bool          // Use incremental snapshots
}

func (m *CheckpointManager) AutoCheckpointLoop(ctx context.Context, config *AutoCheckpointConfig) error {
    if !config.Enabled {
        return nil
    }

    ticker := time.NewTicker(config.Interval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-ticker.C:
            // Create periodic checkpoint
            m.Create(ctx, &CreateCheckpointRequest{
                SessionID:   m.sessionID,
                Incremental: config.Incremental,
                Label:       fmt.Sprintf("auto-%d", time.Now().Unix()),
            })

            // Cleanup old checkpoints
            m.cleanupOld(ctx, config.MaxCheckpoints)
        }
    }
}
```

## Rollback Command

```go
func (m *CheckpointManager) Rollback(ctx context.Context, sessionID string, steps int) error {
    // Get checkpoint history
    checkpoints, err := m.List(ctx, sessionID)
    if err != nil {
        return err
    }

    if len(checkpoints) < steps {
        return fmt.Errorf("only %d checkpoints available", len(checkpoints))
    }

    // Get checkpoint to restore to
    targetCheckpoint := checkpoints[len(checkpoints)-steps]

    // Restore
    result, err := m.Restore(ctx, targetCheckpoint.ID)
    if err != nil {
        return err
    }

    // Resume execution from rollback point
    return m.resumeFrom(ctx, result.RollbackToTask)
}
```

## Snapshot Storage

```go
type CheckpointStore interface {
    Save(ctx context.Context, checkpoint *Checkpoint) error
    Get(ctx context.Context, id string) (*Checkpoint, error)
    List(ctx context.Context, sessionID string) ([]*Checkpoint, error)
    Delete(ctx context.Context, id string) error
    DeleteExpired(ctx context.Context) (int, error)
}

// Storage formats:
// - Full snapshot: JSON + file blobs in directory
// - Incremental: JSON pointing to previous + deltas
```

## Event Integration

```go
// Checkpoint events published to event bus
const (
    EventCheckpointCreated   EventType = "checkpoint_created"
    EventCheckpointRestored  EventType = "checkpoint_restored"
    EventCheckpointDeleted   EventType = "checkpoint_deleted"
)

// Subscribe to checkpoint events
kernel.eventBus.Subscribe("checkpoint_created", func(ctx context.Context, event *Event) error {
    log.Printf("Checkpoint created: %s", event.Data["checkpoint_id"])
    return nil
})
```

## Directory Structure

```
internal/checkpoint/
    manager.go          # Main checkpoint manager
    snapshot.go         # Snapshot creation
    restore.go          # Restoration logic
    storage.go          # Storage backend
    auto.go             # Auto-checkpoint loop
    store.go           # SQLite/file storage
```

## Usage Examples

```go
// Manual checkpoint
cp, err := checkpointManager.Create(ctx, &CreateCheckpointRequest{
    SessionID:  "sess_abc123",
    WorkflowID: "create-project",
    Label:      "before-merge",
    TTL:        24 * time.Hour,
})

// Restore
result, err := checkpointManager.Restore(ctx, cp.ID)

// Rollback last workflow
err := checkpointManager.Rollback(ctx, sessionID, 1)

// Undo last 3 checkpoints
err := checkpointManager.Rollback(ctx, sessionID, 3)
```
