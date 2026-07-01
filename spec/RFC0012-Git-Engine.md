# RFC-0012: Git Engine

**Status:** Draft
**Version:** 0.3.4

## Problem

Currently, git operations are ad-hoc. There's no:
- Consistent branching strategy
- Commit message standards
- Automatic change tracking
- Patch generation

## Solution

Build a Git engine with automatic workflow:

```
Task starts
     │
     ▼
Create feature branch (task_{id}_{slug})
     │
     ▼
Track changes
     │
     ▼
On task completion:
     │
     ├─► Generate commit message (conventional commits)
     │
     ├─► Create patch
     │
     └─► Optionally PR/merge
```

## Git Engine Interface

```go
type GitEngine interface {
    CreateBranch(ctx context.Context, sessionID, taskName string) (branch string, err error)
    TrackChanges(ctx context.Context) ([]Change, error)
    GenerateCommitMessage(ctx context.Context, changes []Change) (string, error)
    Commit(ctx context.Context, message string) (string, error)
    CreatePatch(ctx context.Context) (string, error)
    ApplyPatch(ctx context.Context, patch string) error
    CreatePR(ctx context.Context, targetBranch string) (*PR, error)
    GetStatus(ctx context.Context) (*GitStatus, error)
}
```

## Conventional Commits Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
