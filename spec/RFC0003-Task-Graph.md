# RFC-0003: Task Graph

**Status:** Draft
**Version:** 0.3.4

## Problem

Current architecture is flat:
```
User → LLM → Execute → Result
```

This doesn't capture:
- Task dependencies
- Partial completion
- Retry logic
- Parallel execution opportunities

## Solution

Replace flat execution with a Directed Acyclic Graph (DAG):

```
Goal: Create Landing Page
     │
     ▼
┌─────────────────────────────┐
│         Task DAG            │
├─────────────────────────────┤
│                             │
│   Task 1: Analyze Repo      │
│          │                  │
│   ┌──────┴──────┐          │
│   ▼             ▼          │
│ Task 2      Task 3          │
│ Read Design  Check deps     │
│   │             │           │
│   └──────┬──────┘          │
│          ▼                  │
│   Task 4: Generate Code     │
│          │                  │
│          ▼                  │
│   Task 5: Run Build         │
│          │                  │
│    ┌─────┴─────┐           │
│    ▼           ▼            │
│ Task 6      Task 7          │
│ Fix err    Commit           │
│    │           │            │
│    └─────┬─────┘            │
│          ▼                  │
│   Task 8: Report            │
│                             │
└─────────────────────────────┘
```

## Task DAG Schema

```json
{
  "id": "dag_xyz789",
  "session_id": "sess_abc123",
  "goal": "Create landing page",
  "status": "RUNNING",
  "tasks": [
    {
      "id": "task_001",
      "name": "Analyze repository",
      "tool": "read_directory",
      "status": "DONE",
      "depends_on": [],
      "output": { "files_found": 42 }
    },
    {
      "id": "task_002",
      "name": "Read design specs",
      "tool": "read_file",
      "status": "DONE",
      "depends_on": ["task_001"],
      "output": { "design": "..." }
    },
    {
      "id": "task_003",
      "name": "Generate components",
      "tool": "code_generation",
      "status": "WAITING",
      "depends_on": ["task_002"]
    }
  ]
}
```
