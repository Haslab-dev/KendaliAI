# RFC-0001: Session Service

**Status:** Draft
**Version:** 0.3.4

## Problem

Currently, there is no session concept. Messages flow directly from Telegram to the cognition loop without any persistent state. This means:
- Cannot resume interrupted work
- No context persistence across sessions
- No way to track token usage per task
- No workspace isolation per task

## Solution

```
Telegram
     │
     ▼
Conversation
     │
     ▼
Session
     │
     ▼
Workspace
```

## Session Schema

```json
{
  "id": "sess_abc123",
  "user_id": "user_456",
  "workspace_id": "ws_def789",
  "created_at": "2026-07-01T12:00:00Z",
  "updated_at": "2026-07-01T12:30:00Z",
  "current_goal": "Create landing page",
  "status": "RUNNING",
  "active_files": ["src/index.tsx", "src/App.tsx"],
  "token_usage": {
    "input": 15000,
    "output": 8000
  },
  "artifacts": ["artifact_001", "artifact_002"],
  "state": {
    "current_plan_id": "plan_ghi456",
    "current_task_id": "task_003",
    "checkpoint": "after_build_step"
  }
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/:id` | Get session details |
| PATCH | `/api/sessions/:id` | Update session state |
| DELETE | `/api/sessions/:id` | Archive session |
| GET | `/api/sessions/:id/events` | Stream session events |
| POST | `/api/sessions/:id/continue` | Resume session |
