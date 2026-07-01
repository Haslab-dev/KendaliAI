# RFC-0019: Agent Runtime

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000 (Agent Kernel)

## Overview

A sub-agent should be a **first-class execution unit**, not just a goroutine or multiple LLM calls.

Think of it like an Operating System:

```
User

↓

Kernel

↓

Supervisor Agent

↓

Spawn Workers

↓

Workers execute independently

↓

Supervisor collects results

↓

Final response
```

Exactly like a process tree in Linux:

```
PID 1

Supervisor

├── PID 2
│   Repository Analyzer
│
├── PID 3
│   UI Generator
│
├── PID 4
│   Backend Generator
│
├── PID 5
│   Reviewer
│
└── PID 6
    Documentation
```

## Process Model

Every spawned agent is a Process:

```go
type Process struct {
    ID          string
    ParentID    string
    SessionID   string
    WorkspaceID string
    Goal        string
    Role        ProcessRole
    Status      ProcessStatus
    Model       string
    Budget      *Budget
    Memory      *MemoryScope
    Tools       []Capability
    CreatedAt   time.Time
    StartedAt   *time.Time
    CompletedAt *time.Time
}

type ProcessStatus string

const (
    ProcessCreated   ProcessStatus = "CREATED"
    ProcessQueued    ProcessStatus = "QUEUED"
    ProcessStarting  ProcessStatus = "STARTING"
    ProcessRunning   ProcessStatus = "RUNNING"
    ProcessWaiting   ProcessStatus = "WAITING"
    ProcessMerging   ProcessStatus = "MERGING"
    ProcessDone      ProcessStatus = "DONE"
    ProcessFailed    ProcessStatus = "FAILED"
    ProcessCancelled ProcessStatus = "CANCELLED"
    ProcessArchived  ProcessStatus = "ARCHIVED"
)
```

## Memory Scopes

Each agent gets isolated memory:

```go
type MemoryScope struct {
    Private    *PrivateMemory   // Agent's private memory
    Shared     *SharedMemory    // Shared with parent/siblings
    ReadOnly   *ReadOnlyContext // Immutable context
}

type PrivateMemory struct {
    Facts       []UserFact
    Preferences []Preference
    Context     []ContextItem
    Workspace   map[string]interface{}  // Local workspace memory
}

type SharedMemory struct {
    SessionMemory   map[string]interface{}
    WorkspaceMemory map[string]interface{}
    ArtifactRefs    []string
}

type ReadOnlyContext struct {
    UserPreferences *UserPreferences
    ProjectKB       *ProjectKnowledge
    TeamStandards   *TeamStandards
}
```

## Supervisor Pattern

Supervisors manage child processes:

```go
type Supervisor struct {
    kernel     Kernel
    processes  map[string]*Process
    results    map[string]*ProcessResult
    mu         sync.Mutex
}

func (s *Supervisor) Spawn(ctx context.Context, spec ProcessSpec) (*Process, error) {
    // Kernel decides if spawn is allowed
    proc, err := s.kernel.Spawn(ctx, spec)
    if err != nil {
        return nil, err
    }

    s.mu.Lock()
    s.processes[proc.ID] = proc
    s.mu.Unlock()

    // Start process execution
    go s.runProcess(proc)

    return proc, nil
}

func (s *Supervisor) WaitAll(ctx context.Context) error {
    for _, proc := range s.processes {
        result, err := s.kernel.Wait(ctx, proc.ID)
        if err != nil {
            return err
        }
        s.results[proc.ID] = result
    }
    return nil
}
```

## Mailbox-Based Communication

Agents never communicate directly:

```go
// Agent A sends to Agent B
err := kernel.Send(ctx, &Message{
    From:  "agent-a-pid",
    To:    "agent-b-pid",
    Type:  MsgResult,
    Payload: result,
})

// Agent B receives
msg := <-kernel.Receive(ctx, "agent-b-pid")
```

## Capability-Based Permissions

```go
type Capability string

const (
    CapReadFiles    Capability = "read_files"
    CapWriteFiles   Capability = "write_files"
    CapDeleteFiles  Capability = "delete_files"
    CapShell        Capability = "shell"
    CapDocker       Capability = "docker"
    CapGit          Capability = "git"
    CapSearch       Capability = "search"
    CapBuild        Capability = "build"
    CapTest         Capability = "test"
    CapNetwork      Capability = "network"
    CapMCP          Capability = "mcp"
)

// Process manifest
type AgentManifest struct {
    ID                 string
    Role               ProcessRole
    SystemPromptFile   string
    AllowedCapabilities []Capability
    SpawnPolicy        SpawnPolicy
    Model              ModelPreference
    OutputSchema       string
}

type SpawnPolicy struct {
    MaxChildren     int
    MaxDepth        int
    CanSpawnWorkers bool
}
```

## Agent Manifest Examples

```yaml
# reviewer.yaml
id: reviewer
role: reviewer
system_prompt: reviewer.md
allowed_capabilities:
  - read_files
  - search
  - git_diff
spawn_policy:
  max_children: 0
  can_spawn_workers: false
model:
  preferred:
    - gemini
    - gpt-5.5
output_schema: review_report.json

---

# coder.yaml
id: coder
role: coder
system_prompt: coder.md
allowed_capabilities:
  - read_files
  - write_files
  - shell
  - git
  - build
  - test
spawn_policy:
  max_children: 4
  can_spawn_workers: true
model:
  preferred:
    - claude-opus
    - gpt-5.5
output_schema: code_patch.json

---

# ui-agent.yaml
id: ui-agent
role: ui
system_prompt: ui-developer.md
allowed_capabilities:
  - read_files
  - write_files
  - shell
  - git
spawn_policy:
  max_children: 2
  can_spawn_workers: true
model:
  preferred:
    - claude-sonnet
capabilities:
  - react
  - tailwind
  - nextjs
```

## Process Tree Example

```
Session: sess_abc123
  │
  └── Supervisor: Planning Phase
      │
      ├── Planner
      │     │
      │     └── Spawns workers based on plan
      │
      ├── Repo Analyzer (worker)
      │
      ├── Backend Agent (supervisor)
      │     ├── API Generator (worker)
      │     └── Database Generator (worker)
      │
      ├── Frontend Agent (supervisor)
      │     ├── Hero Generator (worker)
      │     ├── Dashboard Generator (worker)
      │     └── Components Generator (worker)
      │
      ├── Reviewer (worker)
      │
      └── Documentation (worker)
```

## Merge Phase

After all workers finish:

```go
func (s *Supervisor) Merge(ctx context.Context) (*MergeResult, error) {
    // 1. Collect patches from all workers
    patches := []*Patch{}
    for pid, result := range s.results {
        if result.Output != nil {
            patch, ok := result.Output.(*Patch)
            if ok {
                patches = append(patches, patch)
            }
        }
    }

    // 2. Detect conflicts
    conflicts := DetectConflicts(patches)
    if len(conflicts) > 0 {
        // 3. Resolve or escalate
        return &MergeResult{
            Status:    MergeConflict,
            Conflicts: conflicts,
        }, nil
    }

    // 4. Apply merged patch
    merged := MergePatches(patches)

    // 5. Build
    if err := s.build(merged); err != nil {
        return &MergeResult{
            Status: MergeBuildFailed,
            Error:  err,
        }, err
    }

    // 6. Commit
    commit, err := s.commit(merged)
    if err != nil {
        return nil, err
    }

    return &MergeResult{
        Status:     MergeSuccess,
        Commit:     commit,
        Artifacts:  merged.Artifacts,
    }, nil
}
```

## Lifecycle State Machine

```
CREATED
    │
    ▼
QUEUED
    │
    ▼
STARTING
    │
    ▼
RUNNING
    │
    ├──► WAITING (waiting for children/parent)
    │
    ├──► MERGING (collecting results)
    │
    └──► DONE
            │
            ▼
        FAILED
            │
            ▼
        CANCELLED
            │
            ▼
        ARCHIVED
```

## Resource Limits per Process

```go
type ProcessLimits struct {
    MaxChildren      int           // Max child processes
    MaxDepth         int           // Max process tree depth
    MaxRuntime       time.Duration // Max execution time
    MaxTokens        int           // Max tokens
    MaxCost          float64       // Max cost in USD
    MaxMemoryMB      int64         // Max memory in MB
    MaxConcurrent    int           // Max concurrent operations
}

func NewDefaultLimits() *ProcessLimits {
    return &ProcessLimits{
        MaxChildren:   4,
        MaxDepth:      3,
        MaxRuntime:    10 * time.Minute,
        MaxTokens:     100000,
        MaxCost:       0.30,
        MaxMemoryMB:   50,
        MaxConcurrent: 5,
    }
}
```

## Runtime Architecture

```
                    Agent Kernel
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
 Process Manager   Scheduler/Event Bus   Resource Manager
      │                  │                  │
      ├──────────────┬───┴───────┬──────────┤
      │              │           │
 Supervisor     Planner      Workflow Engine
      │
      ├─────────────── Spawn ───────────────────────────┐
      │                                                 │
 Repo Agent   Frontend Agent   Backend Agent   Review Agent
      │             │                 │               │
      └──────────── Patch / Artifact Bus ─────────────┘
                          │
                     Merge Engine
                          │
                     Workspace Manager
                          │
                      Git + Tool Runtime
```

## Agent Registry

```go
type AgentRegistry struct {
    manifests map[string]*AgentManifest
    kernel   Kernel
    mu       sync.RWMutex
}

func (r *AgentRegistry) Load(path string) error {
    data, err := os.ReadFile(path)
    if err != nil {
        return err
    }

    manifest := &AgentManifest{}
    if err := yaml.Unmarshal(data, manifest); err != nil {
        return err
    }

    r.mu.Lock()
    r.manifests[manifest.ID] = manifest
    r.mu.Unlock()

    return nil
}

func (r *AgentRegistry) Spawn(ctx context.Context, agentID string, spec ProcessSpec) (*Process, error) {
    manifest, ok := r.Get(agentID)
    if !ok {
        return nil, fmt.Errorf("agent %s not found", agentID)
    }

    // Merge spec with manifest
    spec.Role = manifest.Role
    spec.Tools = manifest.AllowedCapabilities

    return r.kernel.Spawn(ctx, spec)
}
```

## Directory Structure

```
internal/runtime/
    kernel.go           # Kernel integration
    supervisor.go       # Supervisor implementation
    worker.go           # Worker implementation
    process.go          # Process model
    mailbox.go          # Mailbox communication
    lifecycle.go        # Lifecycle management
    registry.go         # Agent manifest registry
    limits.go           # Resource limits
    merge.go            # Patch merge engine
    manifest.go         # Manifest loading

agents/
    manifests/          # Agent YAML definitions
        planner.yaml
        coder.yaml
        reviewer.yaml
        architect.yaml
        researcher.yaml
        document.yaml
        security.yaml
        performance.yaml
        devops.yaml
        ui.yaml
        backend.yaml
        mobile.yaml
        database.yaml
        vision.yaml
        ocr.yaml
```
