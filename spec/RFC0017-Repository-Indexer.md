# RFC-0017: Repository Indexer

**Status:** Draft
**Version:** 0.3.4

## Problem

Context is rebuilt on every request. This is:
- Slow (no caching)
- Expensive (repeated embedding)
- Incomplete (no cross-reference)

## Solution

Build a continuous indexer:

```go
type RepositoryIndexer interface {
    Index(ctx context.Context, repoPath string) error
    Update(ctx context.Context, changedFiles []string) error
    Query(ctx context.Context, query string) ([]IndexResult, error)
    GetSymbol(ctx context.Context, symbolName string) (*Symbol, error)
    GetCallGraph(ctx context.Context, functionName string) (*CallGraph, error)
}
```

## Index Schema

```json
{
  "repo_path": "/path/to/repo",
  "indexed_at": "2026-07-01T12:00:00Z",
  "language": "typescript",
  "files": {
    "src/auth/login.ts": {
      "type": "file",
      "ast": { ... },
      "exports": ["login", "logout"],
      "imports": ["src/utils/jwt", "src/db/user"],
      "symbols": [
        { "name": "login", "type": "function", "line": 10 },
        { "name": "logout", "type": "function", "line": 50 }
      ]
    }
  },
  "call_graph": {
    "login": ["jwt.verify", "db.user.findByEmail"],
    "logout": ["jwt.sign"]
  },
  "dependency_graph": {
    "src/auth/login.ts": ["src/utils/jwt.ts", "src/db/user.ts"],
    "src/utils/jwt.ts": []
  }
}
```

## Symbol Types

| Type | Description |
|------|-------------|
| `function` | Function declarations |
| `class` | Class declarations |
| `interface` | Interface declarations |
| `type` | Type aliases |
| `enum` | Enum declarations |
| `constant` | Const declarations |
| `variable` | Let/var declarations |
| `component` | React components |
| `route` | API/web routes |
| `test` | Test cases |
