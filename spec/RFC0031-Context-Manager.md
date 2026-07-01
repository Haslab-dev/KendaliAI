# RFC-0031: Context Manager

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000, RFC-0011, RFC-0017, RFC-0026

## Problem

Currently context assembly is ad-hoc:

```go
func (p *Planner) CreatePlan(ctx context.Context, goal string) {
    // What files? All of them? Just src?
    files := repoIndex.Query(goal)

    // What memories? All recent? Just relevant?
    memories := memory.Search(goal)

    // What observations? All?
    observations := observationStore.GetRecent()

    // Concatenate everything into prompt
    prompt := files + memories + observations
}
```

This leads to:
- Context overflow (too many tokens)
- Missing relevant context
- No prioritization
- No freshness scoring

## Solution

```
Repository
    │
    ▼
Indexer
    │
    ▼
Memory
    │
    ▼
Context Manager
    │
    ├── Relevance Scorer
    ├── Freshness Scorer
    ├── Priority Queue
    └── Token Budget
    │
    ▼
Context Builder
    │
    ▼
Prompt
```

## Context Manager Interface

```go
type ContextManager interface {
    // Build context for a specific task
    Build(ctx context.Context, req *ContextRequest) (*Context, error)

    // Update context incrementally
    Update(ctx context.Context, updates *ContextUpdate) error

    // Query what's in context
    Query(ctx context.Context) (*ContextSnapshot, error)
}

type ContextRequest struct {
    TaskType    TaskType
    Goal        string
    MaxTokens   int
    Include     *ContextInclude
    Exclude     *ContextExclude
    Priority    *ContextPriority
}

type ContextInclude struct {
    Files       []FilePattern
    Memories    []MemoryQuery
    Artifacts   []string
    Conversations []string
    Plans       []string
    Blackboard  *BlackboardQuery
}

type ContextExclude struct {
    Files       []FilePattern
    Memories    []string
    Artifacts   []string
}

type ContextPriority struct {
    Files       PriorityConfig
    Memories    PriorityConfig
    Observations PriorityConfig
}

type PriorityConfig struct {
    Recent      float64  // Weight for recent
    Relevant    float64  // Weight for relevance
    Important   float64  // Weight for importance
    Verified    float64  // Weight for verified vs hypothesis
}
```

## Context Schema

```go
type Context struct {
    ID          string
    RequestID   string
    Goal        string
    TaskType    TaskType

    // Assembled context
    Files       []*FileContext
    Memories    []*MemoryContext
    Artifacts   []*ArtifactContext
    Blackboard  []*BlackboardContext
    Observations []*ObservationContext

    // Metadata
    TotalTokens  int
    RemainingTokens int
    Truncated   bool
    BuildTime   time.Duration
    AssembledAt time.Time
}

type FileContext struct {
    Path        string
    Relevance   float64
    Summary     string
    Lines       string  // "1-50" or "1,5,10-15"
    Content     string  // Truncated content
    Reason      string  // Why was this selected?
    LastModified time.Time
    Language    string
}

type MemoryContext struct {
    ID          string
    Hierarchy   string
    Key         string
    Value       string
    Relevance   float64
    Confidence  float64
    Source      string
}

type ArtifactContext struct {
    ID          string
    Name        string
    Type        string
    Summary     string
    Relevance   float64
}

type BlackboardContext struct {
    ID          string
    Type        EntryType
    Content     string
    Author      string
    Relevance   float64
}

type ObservationContext struct {
    ID          string
    Type        ObservationType
    Summary     string
    ToolName    string
    Timestamp   time.Time
}
```

## Relevance Scoring

```go
type RelevanceScorer struct {
    embedder embedding.Embedder
    indexer  indexer.Indexer
}

func (s *RelevanceScorer) ScoreFiles(ctx context.Context, files []*FileContext, query string) ([]*FileContext, error) {
    // Generate query embedding
    queryEmb, err := s.embedder.Embed(ctx, query)
    if err != nil {
        return nil, err
    }

    // Score each file
    for _, file := range files {
        fileEmb, err := s.embedder.Embed(ctx, file.Content)
        if err != nil {
            continue
        }
        file.Relevance = cosineSimilarity(queryEmb, fileEmb)
    }

    // Sort by relevance
    sort.Slice(files, func(i, j int) bool {
        return files[i].Relevance > files[j].Relevance
    })

    return files, nil
}

func (s *RelevanceScorer) ScoreMemories(ctx context.Context, memories []*MemoryContext, query string) ([]*MemoryContext, error) {
    // Similar scoring but also factor in:
    // - Confidence (user facts > observations)
    // - Access count (frequently accessed = more relevant)
    // - TTL (recent > expired)
}
```

## Freshness Scoring

```go
type FreshnessScorer struct {
    halfLife time.Duration
}

func (s *FreshnessScorer) Score(item interface{}) float64 {
    var age time.Duration
    var lastModified time.Time

    switch v := item.(type) {
    case *FileContext:
        age = time.Since(v.LastModified)
    case *MemoryContext:
        age = time.Since(v.CreatedAt)
    case *ObservationContext:
        age = time.Since(v.Timestamp)
    }

    // Exponential decay: score = e^(-age / halfLife)
    score := math.Exp(-float64(age) / float64(s.halfLife))
    return score
}
```

## Context Builder

```go
type ContextBuilder struct {
    ctxManager *ContextManager
    tokenizer  Tokenizer
    maxTokens  int
}

func (b *ContextBuilder) Build(ctx context.Context, req *ContextRequest) (*Context, error) {
    result := &Context{
        ID:          uuid.New().String(),
        RequestID:   req.ID,
        Goal:        req.Goal,
        TaskType:    req.TaskType,
        MaxTokens:   req.MaxTokens,
        AssembledAt: time.Now(),
    }

    budget := req.MaxTokens

    // 1. Add file context (highest priority)
    files, err := b.addFileContext(ctx, req, &budget)
    if err != nil {
        return nil, err
    }
    result.Files = files

    // 2. Add memory context
    memories, err := b.addMemoryContext(ctx, req, &budget)
    if err != nil {
        return nil, err
    }
    result.Memories = memories

    // 3. Add artifact context
    artifacts, err := b.addArtifactContext(ctx, req, &budget)
    if err != nil {
        return nil, err
    }
    result.Artifacts = artifacts

    // 4. Add blackboard context
    blackboard, err := b.addBlackboardContext(ctx, req, &budget)
    if err != nil {
        return nil, err
    }
    result.Blackboard = blackboard

    // 5. Add recent observations
    observations, err := b.addObservationContext(ctx, req, &budget)
    if err != nil {
        return nil, err
    }
    result.Observations = observations

    result.TotalTokens = req.MaxTokens - budget
    result.RemainingTokens = budget
    result.Truncated = budget < 0

    return result, nil
}

func (b *ContextBuilder) addFileContext(ctx context.Context, req *ContextRequest, budget *int) ([]*FileContext, error) {
    // Query indexer for relevant files
    files, err := b.ctxManager.indexer.Query(ctx, &IndexQuery{
        Query:     req.Goal,
        MaxFiles:  50,
        FileTypes: req.Include.Files,
    })
    if err != nil {
        return nil, err
    }

    // Score and rank
    files = b.relevanceScorer.ScoreFiles(ctx, files, req.Goal)
    files = b.freshnessScorer.ScoreFiles(ctx, files)

    // Select within budget
    var selected []*FileContext
    for _, file := range files {
        tokens := b.tokenizer.Count(file.Content)

        if *budget-tokens < 0 {
            // Try summary instead
            if tokens := b.tokenizer.Count(file.Summary); *budget-tokens >= 0 {
                selected = append(selected, &FileContext{
                    Path:      file.Path,
                    Summary:   file.Summary,
                    Relevance: file.Relevance,
                    Reason:    "truncated due to budget",
                })
                *budget -= tokens
            }
            continue
        }

        selected = append(selected, file)
        *budget -= tokens
    }

    return selected, nil
}
```

## Context Assembly for Different Task Types

```go
type TaskType string

const (
    TaskTypePlanning      TaskType = "planning"
    TaskTypeCoding       TaskType = "coding"
    TaskTypeReview       TaskType = "review"
    TaskTypeDebugging    TaskType = "debugging"
    TaskTypeRefactoring  TaskType = "refactoring"
    TaskTypeTesting      TaskType = "testing"
    TaskTypeDocumentation TaskType = "documentation"
    TaskTypeResearch     TaskType = "research"
)

func (b *ContextBuilder) Build(req *ContextRequest) (*Context, error) {
    switch req.TaskType {
    case TaskTypePlanning:
        // Planning needs: high-level architecture, existing code structure
        return b.buildPlanningContext(req)

    case TaskTypeCoding:
        // Coding needs: relevant files, similar code, tests
        return b.buildCodingContext(req)

    case TaskTypeReview:
        // Review needs: full files, dependencies, test coverage
        return b.buildReviewContext(req)

    case TaskTypeDebugging:
        // Debugging needs: error context, recent changes, related files
        return b.buildDebuggingContext(req)

    default:
        return b.buildGeneralContext(req)
    }
}

func (b *ContextBuilder) buildCodingContext(req *ContextRequest) (*Context, error) {
    // For coding, prioritize:
    // 1. Similar existing code (pattern matching)
    // 2. Type definitions
    // 3. Related tests
    // 4. Dependencies
}
```

## Context Caching

```go
type ContextCache struct {
    cache *lru.Cache[string, *Context]
    ttl   time.Duration
}

func (c *ContextCache) Get(key string) (*Context, bool) {
    ctx, ok := c.cache.Get(key)
    if !ok {
        return nil, false
    }

    // Check TTL
    if time.Since(ctx.AssembledAt) > c.ttl {
        c.cache.Remove(key)
        return nil, false
    }

    return ctx, true
}

func (c *ContextCache) Set(key string, ctx *Context) {
    c.cache.Add(key, ctx)
}

// Cache key based on goal + relevant file hashes
func (c *ContextCache) makeKey(goal string, files []*FileContext) string {
    var hashes []string
    for _, f := range files {
        hashes = append(hashes, f.Path+":"+f.LastModified.String())
    }
    sort.Strings(hashes)

    h := sha256.New()
    h.Write([]byte(goal))
    for _, s := range hashes {
        h.Write([]byte(s))
    }
    return fmt.Sprintf("%x", h.Sum(nil))
}
```

## Directory Structure

```
internal/context/
    manager.go          # Main context manager
    builder.go          # Context builder
    scorer.go           # Relevance/freshness scoring
    cache.go            # Context caching
    tokenizer.go        # Token counting
    assembler.go        # Assembly strategies by task type
```
