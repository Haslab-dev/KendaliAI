# KendaliAI Implementation Plan

**Version:** 0.3.4
**Based on:** RFC Index + Architecture Review
**Status:** Draft

---

## Architecture Overview

The architecture follows a **microkernel** design where the kernel coordinates but doesn't implement business logic.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Channels (Telegram, Discord, REST)           │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Intent Parser                                 │
│  (Classify: continue, fix, retry, undo, review, explain, plan) │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Kernel (Microkernel)                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Process │  │  Event  │  │  IPC /  │  │Registry │            │
│  │ Manager │  │   Bus   │  │ Mailbox │  │         │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
│                                                                  │
│  The kernel COORDINATES, not implements.                        │
│  Business logic lives in pluggable services.                    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      │                           │                           │
      ▼                           ▼                           ▼
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│  Workflow   │           │   Model     │           │  Policy     │
│  Engine     │           │   Router    │           │  Engine     │
└──────┬──────┘           └─────────────┘           └─────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supervisor (Process Tree)                      │
│                                                                  │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│    │ Generic │  │ Generic │  │ Generic │  │ Generic │        │
│    │ Agent   │  │ Agent   │  │ Agent   │  │ Agent   │        │
│    │Process  │  │Process  │  │Process  │  │Process  │        │
│    └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Execution Runtime + Policy Engine                    │
│                                                                  │
│   Capability ──► Policy ──► Scheduler ──► Sandbox ──► Tool     │
│                                                                  │
│   Code Capability ──► AST Runtime / File Runtime / Git Runtime  │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supporting Services                            │
│                                                                  │
│   Blackboard ◄──── Observations ◄──── Memory                      │
│                                                                  │
│   Checkpoint ◄──── Workspace ◄──── Artifact Graph               │
│                                                                  │
│   Repository Index ◄──── Incremental Watcher                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Changes

### 1. Microkernel (Not Monolithic)

The kernel **coordinates** via IPC, not implements:

```
Kernel
  │
  ├── Process Registry (spawn, kill, wait)
  ├── Mailbox (message routing)
  ├── Event Bus (pub/sub)
  ├── Resource Tracker (limits, not management)
  └── Registry (component lookup)

Business logic lives in:
  ├── Workflow Engine (owns DAG)
  ├── Supervisor (orchestrates agents)
  ├── Capability Runtime (executes)
  └── Policy Engine (authorizes)
```

### 2. Workflow Owns DAG

```
Workflow Template
  │
  ▼
Instantiate Workflow
  │
  ▼
Planner fills reasoning steps
  │
  ▼
Workflow OWNS the DAG
  │
  ▼
Executor executes under Workflow control
```

Planner = reasoning
Workflow = execution ownership

### 3. Generic Agent Process

All agents are the same process type with different manifests:

```go
type AgentProcess struct {
    Manifest  AgentManifest  // YAML config
    Prompt   PromptTemplate
    Memory   MemoryScope    // private/shared/readonly
    Runtime  CapabilitySet  // what it can do
    Policy   PolicySet      // security rules
    Model    ModelProfile   // which model to use
}

# Different agents are just different manifests
planner.yaml    → role: planner, high reasoning
coder.yaml      → role: coder, code capabilities
reviewer.yaml   → role: reviewer, security policies
```

### 4. ChangeSet (Not Text Patches)

```
Worker
  │
  ▼
ChangeSet (semantic)
  │
  ├── InsertComponent { name: "Hero", after: "Header" }
  ├── ReplaceFunction { name: "login", newBody: "..." }
  ├── DeleteRoute { path: "/old" }
  └── RenameSymbol { from: "foo", to: "bar" }
  │
  ▼
Conflict Resolver
  │
  ▼
Patch (applied to filesystem)
```

### 5. Blackboard System

Temporary coordination scratchpad:

```
Session
  │
  ▼
Blackboard
  │
  ├── Facts (discovered)
  ├── Questions (open)
  ├── Answers (results)
  ├── Hypotheses
  └── Notes
```

### 6. Policy Engine

Runtime-configurable security:

```yaml
coder:
  can: [read_files, write_files, shell, git]
  cannot: [docker_run, push_git, delete_files]

reviewer:
  can: [read_files, search, git_diff]
  cannot: [write_files, shell]
```

### 7. Checkpoint Manager

Crash recovery:

```
Checkpoint
  │
  ├── Workspace Snapshot
  ├── Memory Snapshot
  ├── DAG Snapshot
  ├── Artifact Snapshot
  └── Process State
```

### 8. Human Approval Gate

```
Workflow
  │
  ▼
Approval Required?
  │
  ├── [Yes] → Wait for Human → Continue/Abort
  │
  └── [No] → Continue
```

Triggers: expensive operations, deletions, production deploys, budget limits.

---

## Directory Structure

```
kendaliai/
├── cmd/kendaliai/
│   └── [existing commands]
├── internal/
│   ├── kernel/                    # RFC0000
│   │   ├── kernel.go             # Microkernel (coordination only)
│   │   ├── process.go            # Process registry
│   │   ├── mailbox.go           # IPC routing
│   │   ├── lifecycle.go          # State transitions
│   │   ├── registry.go           # Component registry
│   │   └── events.go            # Event pub/sub
│   │
│   ├── runtime/                  # RFC0019
│   │   ├── agent.go             # Generic Agent Process
│   │   ├── supervisor.go        # Supervisor pattern
│   │   ├── worker.go             # Worker implementation
│   │   ├── manifests/            # Agent YAML manifests
│   │   │   ├── planner.yaml
│   │   │   ├── coder.yaml
│   │   │   ├── reviewer.yaml
│   │   │   └── [more]
│   │   └── registry.go           # Manifest loader
│   │
│   ├── workflow/                 # RFC0020
│   │   ├── engine.go            # Workflow engine (OWNS DAG)
│   │   ├── dag.go               # DAG management
│   │   ├── phase.go              # Phase definitions
│   │   ├── templates/           # Standard templates
│   │   └── approval.go          # Human approval gate
│   │
│   ├── planner/                  # RFC0005
│   │   ├── planner.go           # Reasoning (not execution)
│   │   ├── context.go           # Planning context
│   │   └── replan.go            # Replanning logic
│   │
│   ├── executor/                 # RFC0006
│   │   ├── executor.go          # Task execution
│   │   ├── changeset.go         # ChangeSet handling
│   │   └── merge.go             # Conflict resolution
│   │
│   ├── execution/                # RFC0024
│   │   ├── runtime.go           # Execution runtime
│   │   ├── process.go            # Process execution
│   │   ├── capability.go         # Capability definitions
│   │   ├── sandbox.go            # Sandboxing
│   │   ├── code.go              # Code capability
│   │   ├── filesystem.go         # File runtime
│   │   ├── ast.go               # AST runtime
│   │   └── shell.go             # Shell runtime
│   │
│   ├── policy/                  # RFC0027
│   │   ├── engine.go            # Policy engine
│   │   ├── evaluator.go         # Policy evaluation
│   │   ├── audit.go             # Audit logging
│   │   └── policies/            # Built-in policies
│   │
│   ├── blackboard/              # RFC0026
│   │   ├── blackboard.go        # Shared scratchpad
│   │   ├── entry.go             # Entry types
│   │   └── subscription.go      # Real-time subscription
│   │
│   ├── checkpoint/              # RFC0028
│   │   ├── manager.go           # Checkpoint manager
│   │   ├── snapshot.go          # Snapshot creation
│   │   └── restore.go          # Restoration logic
│   │
│   ├── goals/                   # RFC0029
│   │   ├── manager.go           # Goal manager
│   │   ├── graph.go            # Goal relationships
│   │   ├── tree.go             # Goal tree operations
│   │   └── evaluation.go        # Acceptance evaluation
│   │
│   ├── taskgraph/               # RFC0030
│   │   ├── graph.go             # Task graph definition
│   │   ├── builder.go          # Graph builder
│   │   ├── registry.go          # Task definition registry
│   │   ├── state.go            # Execution state
│   │   └── templates.go         # Pre-built graph templates
│   │
│   ├── context/                 # RFC0031
│   │   ├── manager.go           # Context manager
│   │   ├── builder.go           # Context builder
│   │   ├── scorer.go            # Relevance/freshness scoring
│   │   ├── cache.go            # Context caching
│   │   └── assembler.go         # Assembly by task type
│   │
│   ├── prompts/                 # RFC0032
│   │   ├── compiler.go          # Prompt compiler
│   │   ├── template.go         # Template definitions
│   │   ├── engine.go           # Template engine
│   │   ├── resolver.go          # Variable resolution
│   │   ├── validator.go         # Validation
│   │   ├── versioning.go        # Version management
│   │   └── templates/           # Prompt templates
│   │
│   ├── scheduler/               # RFC0033
│   │   ├── scheduler.go          # Main scheduler
│   │   ├── dependency.go        # Dependency graph
│   │   ├── priority.go          # Priority queue
│   │   ├── resource_checker.go # Resource limits
│   │   ├── rate_limiter.go     # Rate limiting
│   │   └── worker.go          # Worker implementation
│   │
│   ├── observation/             # RFC0021
│   │   ├── engine.go           # Observation engine
│   │   ├── normalizers/         # Git, shell, build normalizers
│   │   └── aggregator.go        # Context aggregation
│   │
│   ├── dag/                     # RFC0022
│   │   ├── mutable.go          # Dynamic DAG
│   │   └── operations.go        # Insert, split, merge, replan
│   │
│   ├── resource/                # RFC0025
│   │   ├── manager.go          # Resource tracking
│   │   ├── budget.go           # Budget management
│   │   └── rate.go             # Rate limiting
│   │
│   ├── index/                   # RFC0017
│   │   ├── indexer.go          # Repository indexer
│   │   ├── watcher.go          # Incremental file watcher
│   │   └── graphs/             # Symbol, call, import graphs
│   │
│   ├── intent/                  # NEW
│   │   ├── parser.go           # Intent classification
│   │   └── workflow_gen.go     # Workflow selection
│   │
│   ├── memory/                  # ENHANCED
│   │   ├── semantic.go         # Semantic memory
│   │   ├── episodic.go         # Episodic memory
│   │   ├── procedural.go       # Procedural memory
│   │   └── working.go          # Working memory
│   │
│   ├── artifact/               # RFC0008
│   │   ├── store.go           # Artifact store
│   │   └── graph.go           # Artifact dependency graph
│   │
│   ├── session/                # RFC0001
│   ├── workspace/              # RFC0002
│   ├── knowledge/              # RFC0009
│   ├── context/                # RFC0011
│   ├── git/                    # RFC0012
│   ├── review/                  # RFC0013
│   ├── channels/              # RFC0015
│   └── tools/                  # RFC0023
│
└── spec/
    └── [28 RFCs]
```

---

## Implementation Phases

### Phase 1: Core Kernel (Weeks 1-4)

| # | Component | Description |
|---|----------|-------------|
| 1 | Microkernel | Process manager, mailbox, event bus, registry |
| 2 | Generic Agent | Agent process with manifest loading |
| 3 | Capability Runtime | Capability → Tool mapping |
| 4 | Policy Engine | Runtime security policies |

### Phase 2: Workflow & Execution (Weeks 5-8)

| # | Component | Description |
|---|----------|-------------|
| 5 | Workflow Engine | Template execution, phase management |
| 6 | Supervisor | Process tree orchestration |
| 7 | Executor | Task execution with retry |
| 8 | ChangeSet | Semantic change representation |

### Phase 3: Intelligence (Weeks 9-12)

| # | Component | Description |
|---|----------|-------------|
| 9 | Planner | Reasoning, replanning, planning context |
| 10 | Blackboard | Shared scratchpad |
| 11 | Observation | Normalizers, context aggregation |
| 12 | Memory Hierarchy | Semantic, episodic, procedural |

### Phase 4: Persistence (Weeks 13-16)

| # | Component | Description |
|---|----------|-------------|
| 13 | Session Service | Session persistence |
| 14 | Workspace Manager | Isolated workspaces |
| 15 | Checkpoint Manager | Snapshots, restore, rollback |
| 16 | Artifact Store | Versioned artifacts |

### Phase 5: Integration (Weeks 17-20)

| # | Component | Description |
|---|----------|-------------|
| 17 | Intent Parser | Classify user intent |
| 18 | Repository Indexer | AST, symbol, call graphs |
| 19 | Dynamic DAG | Mutable task graph |
| 20 | Human Approval | Approval gate system |

### Phase 6: Quality & Communication (Weeks 21-24)

| # | Component | Description |
|---|----------|-------------|
| 21 | Git Engine | Conventional commits, branches |
| 22 | Review Engine | Security, performance checks |
| 23 | Telebot Protocol | Telegram gateway |
| 24 | Knowledge Base | Hierarchical memory |

### Phase 7: Scale (Weeks 25-28)

| # | Component | Description |
|---|----------|-------------|
| 25 | Multi-Agent | Agent coordination |
| 26 | Model Router | Model selection |
| 27 | Distributed Workers | Cloud deployment |
| 28 | Event Sourcing | Event replay |

---

## Minimum Autonomous Kernel (MAK)

For early testing, implement these 10 pieces first:

1. **Kernel** - Process spawn/kill/wait, mailbox, event bus
2. **Session + Workspace** - Basic isolation
3. **Generic Agent Process** - One agent type, manifest-driven
4. **Capability Runtime** - File, Shell, Git capabilities
5. **Policy Engine** - Basic allow/deny
6. **Workflow Engine** - Single phase, linear execution
7. **Blackboard** - Shared facts/questions
8. **Planner** - Simple goal → task decomposition
9. **Executor** - Run task, report result
10. **Telegram Gateway** - Send/receive messages

With these 10 components, you have an end-to-end working system.

---

## Generic Agent Process

All agents are the same type, configured via manifest:

```yaml
# internal/runtime/manifests/coder.yaml
id: coder
role: coder

system_prompt: |
  You are a senior software engineer.
  Write clean, maintainable code.

capabilities:
  - read_files
  - write_files
  - list_files
  - search_files
  - modify_code
  - shell
  - git
  - build
  - test

policies:
  - allow_code_edits
  - deny_production_push
  - deny_delete_files

model:
  primary: claude-opus
  fallback: gpt-5.5
  max_tokens: 100000

resources:
  timeout: 15m
  max_cost: 0.50
```

```yaml
# internal/runtime/manifests/reviewer.yaml
id: reviewer
role: reviewer

system_prompt: |
  You are a security-focused code reviewer.
  Always check for vulnerabilities.

capabilities:
  - read_files
  - search_files
  - git_diff

policies:
  - allow_read_only
  - deny_write_files
  - deny_shell

model:
  primary: gemini
```

---

## ChangeSet Semantics

```go
type ChangeSet struct {
    ID       string
    Author   string  // PID
    TaskID   string
    Changes  []Change
}

type Change interface {
    Apply(ctx context.Context, workspace string) error
    Reverse() error
}

type InsertComponent struct {
    ComponentName string
    AfterComponent string
    Props          map[string]interface{}
}

type ReplaceFunction struct {
    FilePath     string
    FunctionName string
    NewBody      string
}

type DeleteRoute struct {
    Path   string
    Method string
}

type RenameSymbol struct {
    FilePath string
    OldName  string
    NewName  string
}
```

---

## Planner with Context

```go
type PlanningContext struct {
    SessionID   string
    Goal        string
    Workspace    string

    // History
    PastPlans   []*Plan
    FailedPlans []*Plan
    Assumptions []string
    Confidence  float64

    // Current state
    Blackboard  []*BlackboardEntry
    Observations []*Observation
    Memory      []*MemoryEntry

    // Constraints
    Budget      float64
    MaxTokens   int
    Deadline    time.Time
}

func (p *Planner) CreatePlan(ctx context.Context, pc *PlanningContext) (*Plan, error) {
    // Use past failed plans to avoid repeating mistakes
    if len(pc.FailedPlans) > 0 {
        pc.Assumptions = append(pc.Assumptions,
            "Note: Previous attempts failed with: " +
            summarizeFailures(pc.FailedPlans))
    }

    // Call LLM with rich context
    return p.llm.Plan(ctx, &PlanRequest{
        Context:     pc,
        Constraints: buildConstraints(pc),
    })
}
```

---

## Human Approval Gate

```go
type ApprovalRequest struct {
    ID          string
    SessionID   string
    Type        ApprovalType
    Description string
    RiskLevel   RiskLevel
    Options     []ApprovalOption
    Deadline    time.Time
}

type ApprovalType string

const (
    ApprovalDeleteFiles  ApprovalType = "delete_files"
    ApprovalPushGit      ApprovalType = "push_git"
    ApprovalSpendBudget  ApprovalType = "spend_budget"
    ApprovalDeploy       ApprovalType = "deploy"
    ApprovalDestructive  ApprovalType = "destructive"
)

type RiskLevel string

const (
    RiskLow    RiskLevel = "low"
    RiskMedium RiskLevel = "medium"
    RiskHigh   RiskLevel = "high"
    RiskCritical RiskLevel = "critical"
)

// Telegram approval message
func (a *ApprovalRequest) ToTelegramMessage() string {
    emoji := map[RiskLevel]string{
        RiskLow:      "🟢",
        RiskMedium:   "🟡",
        RiskHigh:     "🔴",
        RiskCritical: "🚨",
    }

    return fmt.Sprintf(`%s Approval Required

%s

Risk: %s

Options:
1. ✅ Approve
2. ❌ Reject
3. ⏱️ Ask to wait`,
        emoji[a.RiskLevel],
        a.Description,
        a.RiskLevel)
}
```

---

## Incremental Repository Index

```go
type RepositoryWatcher struct {
    indexer   *RepositoryIndexer
    fsnotify  *fsnotify.Watcher
    debouncer *Debouncer
}

func (w *RepositoryWatcher) Start(ctx context.Context, path string) error {
    w.fsnotify, _ = fsnotify.NewWatcher()
    w.fsnotify.Add(path)

    go w.watchLoop(ctx)

    return nil
}

func (w *RepositoryWatcher) watchLoop(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        case event := <-w.fsnotify.Events:
            // Debounce to avoid rapid updates
            w.debouncer.Add(event.Path)
        case err := <-w.fsnotify.Errors:
            log.Printf("fsnotify error: %v", err)
        }
    }
}

func (w *RepositoryWatcher) processChanges(paths []string) {
    // Only update what changed
    for _, path := range paths {
        switch {
        case isGoFile(path):
            w.indexer.UpdateGoFile(path)
        case isImportChange(path):
            w.indexer.UpdateImports(path)
        case isTypeChange(path):
            w.indexer.UpdateTypes(path)
        }
    }

    // Publish update event
    w.eventBus.Publish(&Event{
        Type: "index_updated",
        Data: paths,
    })
}
```

---

## Event Sourcing

```go
type EventStore struct {
    db *sql.DB
}

type Event struct {
    ID           string
    AggregateType string  // session, process, workflow
    AggregateID   string
    EventType     string
    Payload       []byte  // JSON
    Version       int
    Timestamp     time.Time
}

func (s *EventStore) Append(ctx context.Context, event *Event) error {
    event.Version = s.getNextVersion(ctx, event.AggregateID)
    return s.db.Insert("events", event)
}

func (s *EventStore) Replay(ctx context.Context, aggregateID string, fromVersion int) ([]*Event, error) {
    return s.db.Query(`
        SELECT * FROM events
        WHERE aggregate_id = ? AND version > ?
        ORDER BY version ASC
    `, aggregateID, fromVersion)
}
```

---

## Version Timeline

| Version | Milestone | Features |
|---------|-----------|----------|
| v0.4.0 | MAK Complete | Kernel, Generic Agent, Workflow, Telegram |
| v0.5.0 | Planning | Planner, Blackboard, Observation |
| v0.6.0 | Persistence | Session, Workspace, Checkpoint, Artifact |
| v0.7.0 | Security | Policy Engine, Approval Gate |
| v0.8.0 | Intelligence | Memory, Knowledge, Context |
| v0.9.0 | Quality | Git, Review, Dynamic DAG |
| v1.0.0 | Scale | Multi-Agent, Model Router, Distributed |
| v1.1.0 | Production | Event Sourcing, Monitoring |

---

## Testing Strategy

### MAK Test

```go
func TestMAK_EndToEnd(t *testing.T) {
    // 1. Create session
    session, _ := sessionService.Create(ctx, &CreateSessionRequest{
        UserID: "test",
        Goal:   "Create a hello world function",
    })

    // 2. Start workflow
    run, _ := workflowEngine.Start(ctx, "simple_coding", session.ID)

    // 3. Agent creates file
    agent, _ := runtime.Spawn(ctx, &ProcessSpec{
        Role:  RoleCoder,
        Goal:  "Create hello.go",
    })

    result, _ := executor.Execute(ctx, &Task{
        Capability: CapWriteFiles,
        Params: map[string]interface{}{
            "path":    "hello.go",
            "content": "package main\n\nfunc main() {}\n",
        },
    })

    // 4. Checkpoint
    cp, _ := checkpointManager.Create(ctx, &CreateCheckpointRequest{
        SessionID: session.ID,
    })

    // 5. Verify artifact
    artifacts, _ := artifactStore.List(ctx, session.ID)
    assert.Len(t, artifacts, 1)
    assert.Equal(t, "hello.go", artifacts[0].Name)

    // 6. Restore from checkpoint
    result, _ = checkpointManager.Restore(ctx, cp.ID)
    assert.True(t, result.WorkspaceRestored)
}
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Agent spawn | < 100ms |
| Task execution | < 500ms (excluding LLM) |
| Checkpoint create | < 1s |
| Checkpoint restore | < 5s |
| Blackboard query | < 10ms |
| Policy check | < 1ms |
| Max concurrent agents | 50 |
| Max concurrent workflows | 10 |

---

## Dependencies

| Module | Version | Purpose |
|--------|---------|---------|
| `github.com/google/uuid` | v1.6.0 | UUID |
| `github.com/fsnotify/fsnotify` | v1.7.0 | File watching |
| `gopkg.in/yaml.v3` | latest | YAML parsing |
| `github.com/hashicorp/golang-lru` | latest | LRU cache |
