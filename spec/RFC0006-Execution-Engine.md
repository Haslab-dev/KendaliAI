# RFC-0006: Execution Engine

**Status:** Draft
**Version:** 0.3.4

## Problem

Current `ExecuteParallel` is a simple worker pool. It lacks:
- Retry with exponential backoff
- Timeout per task
- Cancellation
- Event emission
- Priority queuing

## Solution

Build a proper execution engine:

```
┌─────────────────────────────────────────┐
│              Scheduler                  │
│  - Priority queue                       │
│  - Dependency resolution                │
│  - Load balancing                       │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│         Execution Queue                 │
│  - Pending tasks                        │
│  - Running tasks                        │
│  - Completed tasks                      │
│  - Failed tasks                         │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│    Worker Pool (configurable N)         │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │ W1  │ │ W2  │ │ W3  │ │ W4  │       │
│  └─────┘ └─────┘ └─────┘ └─────┘       │
└──────────────────┬──────────────────────┘
                   │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    ┌───────┐  ┌───────┐  ┌───────┐
    │ Retry │  │Timeout │  │Cancel │
    │ Logic │  │ Logic │  │ Logic │
    └───────┘  └───────┘  └───────┘
```

## Execution Engine Interface

```go
type ExecutionEngine interface {
    Execute(ctx context.Context, dag *TaskDAG) (<-chan *TaskEvent, error)
    Pause(ctx context.Context, dagID string) error
    Resume(ctx context.Context, dagID string) error
    Cancel(ctx context.Context, dagID string) error
    Retry(ctx context.Context, taskID string) error
}
```

## Task Event Types

```go
type TaskEvent struct {
    Type      EventType    // TaskStarted, TaskCompleted, TaskFailed, etc.
    TaskID    string
    DAGID     string
    Timestamp time.Time
    Data      interface{}
}

type EventType string

const (
    TaskStarted   EventType = "task_started"
    TaskCompleted EventType = "task_completed"
    TaskFailed    EventType = "task_failed"
    TaskRetried   EventType = "task_retried"
    TaskCancelled EventType = "task_cancelled"
    TaskWaiting   EventType = "task_waiting"
    DAGStarted    EventType = "dag_started"
    DAGCompleted  EventType = "dag_completed"
    DAGFailed     EventType = "dag_failed"
)
```
