# RFC-0011: Context Engine

**Status:** Draft
**Version:** 0.3.4

## Problem

Currently, the entire repository is sent to the LLM. This is:
- Expensive (too many tokens)
- Slow (too much processing)
- Noisy (irrelevant files)

## Solution

Build a context engine that intelligently selects relevant files:

```
User asks about "authentication"
        │
        ▼
Repository Index (pre-built)
        │
        ▼
Dependency Graph (who imports whom)
        │
        ▼
Relevant Files (auth/*.ts, middleware/*.ts)
        │
        ▼
Summarizer (compress each file)
        │
        ▼
LLM Context
```

## Context Engine Interface

```go
type ContextEngine interface {
    BuildIndex(ctx context.Context, repoPath string) error
    Query(ctx context.Context, question string, maxTokens int) (*Context, error)
    RefreshIndex(ctx context.Context, changedFiles []string) error
}
```

## Context Schema

```json
{
  "question": "How does authentication work?",
  "max_tokens": 8000,
  "selected_files": [
    {
      "path": "src/auth/login.ts",
      "reason": "Directly implements authentication",
      "summary": "Login handler using JWT. Validates credentials against DB...",
      "lines": "1-50",
      "importance": 0.95
    },
    {
      "path": "src/middleware/auth.ts",
      "reason": "Auth middleware that guards routes",
      "summary": "JWT verification middleware. Checks Authorization header...",
      "lines": "1-30",
      "importance": 0.85
    }
  ],
  "total_tokens": 7500,
  "truncated": false
}
```

## Index Storage

```json
{
  "repo_path": "/path/to/repo",
  "indexed_at": "2026-07-01T12:00:00Z",
  "file_count": 1242,
  "imports": [
    {
      "file": "src/auth/login.ts",
      "imports": ["src/utils/jwt.ts", "src/db/user.ts"]
    }
  ],
  "exports": [
    {
      "file": "src/auth/login.ts",
      "exports": ["login", "logout"]
    }
  ]
}
```
