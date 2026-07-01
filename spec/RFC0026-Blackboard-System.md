# RFC-0026: Blackboard System

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000, RFC-0019

## Problem

Currently agents share information via:
- Memory queries
- Direct messages

But workers need a shared scratchpad for ephemeral information:

```
Repo Agent
  │
  ▼
"Found Next.js version 14"
  │
  ▼
Frontend Agent needs React version
```

Memory is durable. Blackboard is temporary.

## Solution

```
Session
  │
  ▼
Blackboard
  │
  ├── Temporary Facts
  ├── Agent Notes
  ├── Open Questions
  ├── Intermediate Results
  └── Hypotheses
```

## Blackboard Schema

```go
type Blackboard struct {
    SessionID   string
    Entries     map[string]*BlackboardEntry
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type BlackboardEntry struct {
    ID          string
    Type        EntryType
    Author      string  // PID of creating agent
    Content     string
    Tags        []string
    Relevance   float64  // 0.0 - 1.0
    ExpiresAt   *time.Time
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type EntryType string

const (
    EntryFact          EntryType = "fact"          // Discovered facts
    EntryNote          EntryType = "note"          // Agent notes
    EntryQuestion      EntryType = "question"      // Open questions
    EntryResult        EntryType = "result"        // Intermediate results
    EntryHypothesis    EntryType = "hypothesis"    // Hypotheses
    EntryWarning       EntryType = "warning"       // Warnings/issues
    EntryDecision      EntryType = "decision"      // Decisions made
)
```

## Blackboard Operations

```go
type BlackboardService interface {
    // Write operations
    Post(ctx context.Context, entry *BlackboardEntry) error
    Update(ctx context.Context, id string, content string) error
    Append(ctx context.Context, id string, content string) error

    // Read operations
    Get(ctx context.Context, id string) (*BlackboardEntry, error)
    Query(ctx context.Context, query *BlackboardQuery) ([]*BlackboardEntry, error)
    GetAll(ctx context.Context) ([]*BlackboardEntry, error)

    // Subscription
    Subscribe(ctx context.Context, handler EntryHandler) (subscriptionID string)
    Unsubscribe(subscriptionID string) error

    // Maintenance
    Expire(ctx context.Context) (int, error)
    Clear(ctx context.Context) error
}

type BlackboardQuery struct {
    Types       []EntryType
    Tags        []string
    Authors     []string  // Filter by agent
    Since       *time.Time
    Until       *time.Time
    MinRelevance float64
    Keywords    []string  // Full-text search
    Limit       int
    Offset      int
}
```

## Entry Types

### Fact
```json
{
  "type": "fact",
  "author": "repo-agent-001",
  "content": "Project uses Next.js 14.2.0",
  "tags": ["framework", "nextjs", "version"],
  "relevance": 0.9
}
```

### Question
```json
{
  "type": "question",
  "author": "frontend-agent-003",
  "content": "What React version is compatible with Next.js 14?",
  "tags": ["dependency", "react"],
  "relevance": 0.8
}
```

### Result
```json
{
  "type": "result",
  "author": "research-agent-002",
  "content": "React 18.2.0 is compatible with Next.js 14",
  "tags": ["answer"],
  "relevance": 0.95,
  "answers_question": "question-id-123"
}
```

### Hypothesis
```json
{
  "type": "hypothesis",
  "author": "planner-agent-001",
  "content": "The landing page should use the App Router pattern",
  "tags": ["architecture"],
  "relevance": 0.7
}
```

## Subscription Model

Agents subscribe to relevant entries:

```go
func (b *Blackboard) Subscribe(ctx context.Context, handler EntryHandler, query *BlackboardQuery) (string, error) {
    subscriptionID := uuid.New().String()

    b.mu.Lock()
    b.subscriptions[subscriptionID] = &Subscription{
        ID:     subscriptionID,
        Query:  query,
        Handler: handler,
        Ch:     make(chan *BlackboardEntry, 100),
    }
    b.mu.Unlock()

    return subscriptionID, nil
}

func (b *Blackboard) Notify(entry *BlackboardEntry) {
    b.mu.RLock()
    defer b.mu.RUnlock()

    for _, sub := range b.subscriptions {
        if sub.Matches(entry) {
            select {
            case sub.Ch <- entry:
            default:
                // Channel full, skip
            }
        }
    }
}
```

## Usage Example

```go
// Repo Agent discovers Next.js version
bb.Post(ctx, &BlackboardEntry{
    Type:     EntryFact,
    Author:   "repo-agent",
    Content:  "Project uses Next.js 14.2.0",
    Tags:     []string{"framework", "nextjs"},
    Relevance: 0.9,
})

// Frontend Agent asks question
bb.Post(ctx, &BlackboardEntry{
    Type:     EntryQuestion,
    Author:   "frontend-agent",
    Content:  "What React version is compatible with Next.js 14?",
    Tags:     []string{"dependency"},
    Relevance: 0.8,
})

// Research Agent answers
bb.Post(ctx, &BlackboardEntry{
    Type:            EntryResult,
    Author:          "research-agent",
    Content:         "React 18.2.0 is compatible with Next.js 14",
    Tags:            []string{"answer"},
    AnswersQuestion: "question-id-from-above",
    Relevance:       0.95,
})
```

## Blackboard vs Memory

| Aspect | Blackboard | Memory |
|--------|------------|--------|
| Lifetime | Session | Permanent |
| Scope | Shared | Private/Shared |
| Updates | Append-only | Overwritable |
| Expiration | TTL or session end | Manual deletion |
| Purpose | Temporary coordination | Long-term knowledge |
| Queries | Real-time subscription | Batch retrieval |

## Integration with Kernel

```go
type Kernel struct {
    // ... existing fields ...
    blackboard *BlackboardService
}

func (k *Kernel) GetBlackboard() *BlackboardService {
    return k.blackboard
}

// All agents access via kernel
agent.blackboard.Post(ctx, entry)
agent.blackboard.Subscribe(ctx, handler, query)
```

## Directory Structure

```
internal/blackboard/
    blackboard.go       # Main service
    entry.go           # Entry types
    query.go           # Query builder
    subscription.go    # Subscription handling
    store.go           # Persistence (optional)
```
