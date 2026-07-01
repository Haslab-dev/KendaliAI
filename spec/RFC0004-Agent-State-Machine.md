# RFC-0004: Agent State Machine

**Status:** Draft
**Version:** 0.3.4

## Problem

Current cognition loop has no formal states. It runs until completion or error, with no way to pause, resume, or handle user interruptions gracefully.

## Solution

Implement a formal state machine for task lifecycle:

```
     ┌─────────────────────────────────────────┐
     │                                         │
     ▼                                         │
   NEW ──► PLANNING ──► READY ──► RUNNING      │
                              │     │          │
                              │     ▼          │
                              │   WAITING_USER  │
                              │     │          │
                              │     ▼          │
                              │   WAITING_TOOL │
                              │     │          │
                              │     └──────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
            FAILED          DONE           ARCHIVED
```

## States

| State | Description |
|-------|-------------|
| `NEW` | Task created, not yet planned |
| `PLANNING` | Planner is generating task DAG |
| `READY` | All dependencies satisfied |
| `RUNNING` | Actively executing |
| `WAITING_USER` | Blocked on user input |
| `WAITING_TOOL` | Blocked on tool completion |
| `FAILED` | Task failed (retryable) |
| `DONE` | Task completed successfully |
| `ARCHIVED` | Task archived after completion |

## State Transitions

```go
func (t *Task) Transition(from, to State) error {
    valid := map[State][]State{
        NEW:         {PLANNING},
        PLANNING:    {READY, FAILED},
        READY:       {RUNNING, FAILED},
        RUNNING:     {WAITING_USER, WAITING_TOOL, DONE, FAILED},
        WAITING_USER: {RUNNING, FAILED},
        WAITING_TOOL: {RUNNING, FAILED},
        FAILED:      {READY, ARCHIVED},  // Retry or archive
        DONE:        {ARCHIVED},
    }
    if !contains(valid[from], to) {
        return ErrInvalidTransition
    }
    t.State = to
    return nil
}
```
