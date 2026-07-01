# RFC-0013: Review Engine

**Status:** Draft
**Version:** 0.3.4

## Problem

Code is not automatically reviewed. There are no:
- Architecture checks
- Security scans
- Performance analysis
- Test coverage verification

## Solution

Build a dedicated review agent:

```go
type ReviewEngine interface {
    Review(ctx context.Context, artifacts []*Artifact) (*ReviewReport, error)
}
```

## Review Report Schema

```json
{
  "id": "review_abc123",
  "session_id": "sess_abc123",
  "artifacts_reviewed": ["art_001", "art_002"],
  "started_at": "2026-07-01T12:00:00Z",
  "completed_at": "2026-07-01T12:15:00Z",
  "scores": {
    "architecture": 8,
    "security": 9,
    "performance": 7,
    "testability": 6,
    "readability": 8,
    "maintainability": 7
  },
  "issues": [
    {
      "severity": "high",
      "category": "security",
      "file": "src/auth/login.ts",
      "line": 42,
      "message": "SQL injection vulnerability detected",
      "suggestion": "Use parameterized queries"
    }
  ],
  "recommendations": [
    "Add rate limiting to authentication endpoint",
    "Implement caching for frequently accessed data"
  ],
  "summary": "Code is well-structured with minor security concerns"
}
```

## Review Categories

| Category | Checks |
|----------|--------|
| Architecture | Layer separation, dependency direction, coupling |
| Security | SQL injection, XSS, auth bypass, secrets in code |
| Performance | N+1 queries, missing indexes, inefficient loops |
| Testability | Low coupling, interface usage, mockability |
| Readability | Naming, comments, function length |
| Maintainability | Duplication, complexity, dead code |
| Accessibility | ARIA labels, keyboard navigation, color contrast |
| Best Practices | Error handling, logging, validation |
