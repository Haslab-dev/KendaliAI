# RFC-0009: Knowledge Base

**Status:** Draft
**Version:** 0.3.4

## Problem

Current memory is just embeddings with no hierarchy. This means:
- No concept of user preferences
- No organizational knowledge
- No project-specific context
- No TTL/expiration

## Solution

Implement hierarchical knowledge:

```
Knowledge Hierarchy
│
├── Personal Memory
│   ├── User preferences
│   ├── Coding style
│   └── Recent conversations
│
├── Conversation Memory
│   ├── Current task context
│   ├── Active files
│   └── User feedback
│
├── Workspace Memory
│   ├── Workspace-specific knowledge
│   └── Task history
│
├── Project Memory
│   ├── Project architecture
│   ├── Dependencies
│   ├── Coding conventions
│   └── README/SUMMARY.md
│
├── Organization Memory
│   ├── Team standards
│   ├── Shared libraries
│   └── Documentation
│
└── Global Knowledge Base
    ├── Common patterns
    ├── Best practices
    └── External documentation
```

## Memory Entry Schema

```json
{
  "id": "mem_abc123",
  "hierarchy": "project",
  "scope": "project:kendaliai",
  "key": "architecture",
  "value": "The project uses a layered architecture with gateway, agent, and tool layers.",
  "embedding": [0.123, -0.456, ...],
  "importance": 0.8,
  "access_count": 42,
  "last_accessed": "2026-07-01T12:00:00Z",
  "expires_at": "2026-08-01T12:00:00Z",
  "created_at": "2026-06-01T12:00:00Z",
  "ttl_hours": 720
}
```

## Memory Retrieval

```go
type MemoryStore interface {
    Store(ctx context.Context, entry *MemoryEntry) error
    Search(ctx context.Context, query string, hierarchy string, limit int) ([]*MemoryEntry, error)
    Get(ctx context.Context, id string) (*MemoryEntry, error)
    UpdateAccess(ctx context.Context, id string) error
    Expire(ctx context.Context) (int, error)
}
```
