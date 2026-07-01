# RFC-0002: Workspace Manager

**Status:** Draft
**Version:** 0.3.4

## Problem

All tasks run in the same filesystem context. This causes:
- File collisions between tasks
- No way to clean up after task completion
- Difficult to compare task outputs
- No audit trail of what each task touched

## Solution

Every task gets an isolated workspace:

```
~/.kendaliai/workspaces/
   └── sess_abc123/
       ├── repo/           # Cloned/copied repository
       ├── docs/           # Task documentation
       ├── output/         # Generated artifacts
       ├── cache/          # Cached data
       ├── memory.json     # Workspace memory
       └── task.json       # Task state
```

## Workspace Lifecycle

1. **Create** — Clone repo, setup directories
2. **Mount** — Bind to session
3. **Execute** — Run tasks
4. **Snapshot** — Save state on interruption
5. **Archive** — Compress and store on completion

## Implementation

```go
type WorkspaceManager interface {
    Create(ctx context.Context, sessionID string) (*Workspace, error)
    Get(ctx context.Context, id string) (*Workspace, error)
    Archive(ctx context.Context, id string) error
    Clone(ctx context.Context, repoURL string) error
}
```
