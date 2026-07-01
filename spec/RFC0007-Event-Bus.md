# RFC-0007: Event Bus

**Status:** Draft
**Version:** 0.3.4

## Problem

Currently, components communicate via direct calls. This makes it impossible for:
- Telegram to receive real-time updates
- Dashboard to show live progress
- Web UI to sync state
- Plugins to hook into events

## Solution

Implement an event bus:

```go
type EventBus interface {
    Publish(ctx context.Context, event *Event) error
    Subscribe(eventType string, handler EventHandler) (subscriptionID string)
    Unsubscribe(subscriptionID string) error
    Stream(ctx context.Context, filters *EventFilters) (<-chan *Event, error)
}
```

## Core Events

```go
// Session events
SessionCreated
SessionUpdated
SessionArchived

// Task events
TaskCreated
TaskStarted
TaskCompleted
TaskFailed
TaskRetried
TaskCancelled

// Tool events
ToolExecutionStarted
ToolExecutionCompleted
ToolExecutionFailed

// Git events
GitBranchCreated
GitCommitCreated
GitPatchApplied

// File events
FileCreated
FileModified
FileDeleted

// User events
UserMessageReceived
UserInterruptRequested
UserFeedbackReceived

// Review events
ReviewStarted
ReviewCompleted
ReviewFailed
```

## Event Schema

```json
{
  "id": "evt_abc123",
  "type": "task_completed",
  "session_id": "sess_abc123",
  "dag_id": "dag_xyz789",
  "task_id": "task_001",
  "timestamp": "2026-07-01T12:30:00Z",
  "source": "executor",
  "data": {
    "duration_ms": 2500,
    "output": { "files_modified": 3 }
  }
}
```

## Subscribers

| Subscriber | Events | Purpose |
|------------|--------|---------|
| Telegram Gateway | task_*, dag_*, user_* | Real-time updates |
| Dashboard | * | Live monitoring |
| Web UI | * | Real-time sync |
| Artifact Store | file_*, git_* | Store outputs |
| Memory | task_completed | Learn from completion |
