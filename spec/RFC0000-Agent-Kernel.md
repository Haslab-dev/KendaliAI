# RFC-0000: Agent Kernel

**Status:** Draft
**Version:** 0.3.4
**Priority:** Critical (must implement first)

## Overview

Every mature agent system has a small kernel responsible for orchestrating everything else. Nothing talks directly to anything else without going through the kernel.

```
Gateway
    │
    ▼
Agent Kernel
    │
    ├── Session Manager
    ├── Workflow Engine
    ├── Planner
    ├── Executor
    ├── Event Bus
    ├── Memory
    ├── Knowledge Base
    ├── Artifact Store
    ├── Workspace Manager
    └── Model Router
```

The kernel owns the lifecycle, state transitions, permissions, cancellation, scheduling, and recovery. Individual components remain replaceable, which makes it much easier to evolve from a local single-process agent into a distributed system later.

## Kernel Responsibilities

| Responsibility | Description |
|----------------|-------------|
| Lifecycle | Start, stop, pause, resume all processes |
| State Management | Own authoritative state machine |
| Permission Enforcement | Check all operations against policies |
| Resource Tracking | CPU, RAM, GPU, budget, timeouts |
| Message Routing | All inter-process communication via kernel |
| Spawn Control | Limit children, depth, concurrent agents |
| Recovery | Event sourcing, replay, crash recovery |

## Kernel Interface

```go
type Kernel interface {
    // Lifecycle
    Start(ctx context.Context) error
    Stop(ctx context.Context) error

    // Process Management
    Spawn(ctx context.Context, spec ProcessSpec) (*Process, error)
    Wait(ctx context.Context, pid string) (*ProcessResult, error)
    Kill(ctx context.Context, pid string) error
    List(ctx context.Context) ([]*Process, error)

    // Communication
    Send(ctx context.Context, msg *Message) error
    Receive(ctx context.Context, pid string) (*Message, error)

    // Resource Management
    Allocate(ctx context.Context, resources *ResourceSpec) error
    Release(ctx context.Context, resources *ResourceSpec) error
    CheckResources(ctx context.Context) (*ResourceUsage, error)

    // State
    GetState(ctx context.Context) (*KernelState, error)
    SubscribeState(handler StateHandler) (subscriptionID string)

    // Workflow
    StartWorkflow(ctx context.Context, wf *Workflow) error
    PauseWorkflow(ctx context.Context, wfID string) error

    // Registry
    RegisterComponent(name string, component interface{}) error
    GetComponent(name string) interface{}
}
```

## Kernel State

```go
type KernelState struct {
    PID             string
    Status          KernelStatus
    Processes       map[string]*Process
    Resources       *ResourceUsage
    ActiveWorkflows []string
    TotalAgents     int
    Uptime          time.Duration
}

type KernelStatus string

const (
    KernelStarting KernelStatus = "STARTING"
    KernelRunning  KernelStatus = "RUNNING"
    KernelPaused   KernelStatus = "PAUSED"
    KernelStopping KernelStatus = "STOPPING"
    KernelStopped KernelStatus = "STOPPED"
)
```

## Process Registry

The kernel maintains a registry of all known process types:

```go
type ProcessRegistry struct {
    kernel   *Kernel
    processes map[string]*Process
    children  map[string][]string  // parent -> children
    mailboxes map[string]chan *Message
    mu        sync.RWMutex
}

type ProcessSpec struct {
    ID         string
    ParentID   string
    Role       ProcessRole
    Goal       string
    Model      string
    Budget     *Budget
    Timeout    time.Duration
    MaxMemory  int64
    Tools      []Capability
    Memory     *MemoryScope
    Metadata   map[string]interface{}
}

type ProcessRole string

const (
    RoleSupervisor ProcessRole = "supervisor"
    RolePlanner    ProcessRole = "planner"
    RoleCoder      ProcessRole = "coder"
    RoleReviewer   ProcessRole = "reviewer"
    RoleArchitect  ProcessRole = "architect"
    RoleResearcher ProcessRole = "researcher"
    RoleDocument   ProcessRole = "document"
    RoleSecurity   ProcessRole = "security"
    RolePerformance ProcessRole = "performance"
    RoleDevOps     ProcessRole = "devops"
    RoleUI         ProcessRole = "ui"
    RoleBackend    ProcessRole = "backend"
    RoleMobile     ProcessRole = "mobile"
    RoleDatabase   ProcessRole = "database"
    RoleVision     ProcessRole = "vision"
    RoleOCR        ProcessRole = "ocr"
)
```

## Message Passing

All inter-process communication goes through the kernel:

```go
type Message struct {
    ID        string
    From      string  // PID
    To        string  // PID
    Type      MessageType
    Payload   any
    Timestamp time.Time
}

type MessageType string

const (
    MsgSpawn       MessageType = "spawn"
    MsgResult      MessageType = "result"
    MsgError       MessageType = "error"
    MsgStatus      MessageType = "status"
    MsgInterrupt   MessageType = "interrupt"
    MsgResume      MessageType = "resume"
    MsgCancel      MessageType = "cancel"
    MsgHeartbeat   MessageType = "heartbeat"
    MsgLog         MessageType = "log"
    MsgArtifact    MessageType = "artifact"
)

func (k *Kernel) Send(ctx context.Context, msg *Message) error {
    k.mu.Lock()
    mailbox, ok := k.mailboxes[msg.To]
    k.mu.Unlock()

    if !ok {
        return fmt.Errorf("process %s not found", msg.To)
    }

    select {
    case mailbox <- msg:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    case <-time.After(5 * time.Second):
        return fmt.Errorf("message delivery timeout")
    }
}
```

## Permission Enforcement

```go
type Permission struct {
    Capability Capability
    Resource  string
    Action    Action
}

type Policy struct {
    ProcessRole ProcessRole
    Allow      []Permission
    Deny       []Permission
}

func (k *Kernel) CheckPermission(pid string, cap Capability, resource string) error {
    proc, err := k.GetProcess(pid)
    if err != nil {
        return err
    }

    policy := k.getPolicy(proc.Role)

    for _, p := range policy.Deny {
        if p.Capability == cap && p.Resource == resource {
            return fmt.Errorf("permission denied: %s on %s", cap, resource)
        }
    }

    for _, p := range policy.Allow {
        if p.Capability == cap && p.Resource == resource {
            return nil
        }
    }

    return fmt.Errorf("permission denied: %s on %s", cap, resource)
}
```

## Resource Limits

```go
type ResourceLimits struct {
    MaxChildren      int           // Max child processes
    MaxDepth         int           // Max process tree depth
    MaxRuntime       time.Duration // Max execution time
    MaxTokens        int           // Max tokens per process
    MaxCost          float64       // Max cost in USD
    MaxMemoryMB      int64         // Max memory in MB
    MaxDockerContainers int        // Max docker containers
    MaxConcurrent    int           // Max concurrent processes
}

type ProcessResourceUsage struct {
    PID         string
    CPUPercent  float64
    MemoryMB    int64
    TokensUsed  int
    CostUSD     float64
    Runtime     time.Duration
}

func (k *Kernel) EnforceLimits(ctx context.Context) error {
    for _, proc := range k.GetProcesses() {
        if proc.Status != ProcessRunning {
            continue
        }

        usage := k.getResourceUsage(proc.PID)

        // Check each limit
        if proc.Budget.MaxTokens > 0 && usage.TokensUsed > proc.Budget.MaxTokens {
            return fmt.Errorf("process %s exceeded token limit", proc.PID)
        }

        if proc.Budget.MaxCost > 0 && usage.CostUSD > proc.Budget.MaxCost {
            return fmt.Errorf("process %s exceeded cost limit", proc.PID)
        }

        if proc.Budget.MaxRuntime > 0 && usage.Runtime > proc.Budget.MaxRuntime {
            return fmt.Errorf("process %s exceeded runtime limit", proc.PID)
        }
    }
    return nil
}
```

## Spawn Control

```go
func (k *Kernel) Spawn(ctx context.Context, spec ProcessSpec) (*Process, error) {
    // Check parent exists
    if spec.ParentID != "" {
        parent, err := k.GetProcess(spec.ParentID)
        if err != nil {
            return nil, fmt.Errorf("parent process not found: %s", spec.ParentID)
        }

        // Check depth limit
        depth := k.getProcessDepth(spec.ParentID)
        if depth >= k.limits.MaxDepth {
            return nil, fmt.Errorf("max process depth %d exceeded", k.limits.MaxDepth)
        }

        // Check children limit
        children := k.getChildren(spec.ParentID)
        if len(children) >= k.limits.MaxChildren {
            return nil, fmt.Errorf("max children %d exceeded", k.limits.MaxChildren)
        }
    }

    // Create process
    proc := &Process{
        ID:        spec.ID,
        ParentID:  spec.ParentID,
        Role:      spec.Role,
        Goal:      spec.Goal,
        Status:    ProcessCreated,
        CreatedAt: time.Now(),
    }

    // Setup mailbox
    k.mailboxes[proc.ID] = make(chan *Message, 100)

    // Add to registry
    k.mu.Lock()
    k.processes[proc.ID] = proc
    if spec.ParentID != "" {
        k.children[spec.ParentID] = append(k.children[spec.ParentID], proc.ID)
    }
    k.mu.Unlock()

    return proc, nil
}
```

## Event Publishing

The kernel publishes all significant events:

```go
func (k *Kernel) PublishEvent(ctx context.Context, event *KernelEvent) error {
    k.mu.RLock()
    defer k.mu.RUnlock()

    event.KernelPID = k.pid
    event.Timestamp = time.Now()

    for _, handler := range k.eventHandlers {
        if err := handler(ctx, event); err != nil {
            log.Printf("event handler error: %v", err)
        }
    }

    return nil
}

type KernelEvent struct {
    Type      KernelEventType
    PID       string
    ParentPID string
    Role      ProcessRole
    Timestamp time.Time
    Data      interface{}
}

const (
    EventProcessSpawned    KernelEventType = "process_spawned"
    EventProcessStarted    KernelEventType = "process_started"
    EventProcessCompleted  KernelEventType = "process_completed"
    EventProcessFailed     KernelEventType = "process_failed"
    EventProcessKilled     KernelEventType = "process_killed"
    EventResourceWarning   KernelEventType = "resource_warning"
    EventResourceExceeded  KernelEventType = "resource_exceeded"
    EventMessageSent       KernelEventType = "message_sent"
    EventWorkflowStarted   KernelEventType = "workflow_started"
    EventWorkflowCompleted KernelEventType = "workflow_completed"
)
```

## Startup Sequence

```go
func (k *Kernel) Start(ctx context.Context) error {
    // 1. Initialize components
    k.setStatus(KernelStarting)

    // 2. Setup signal handlers
    go k.handleSignals()

    // 3. Start garbage collector for dead processes
    go k.gc()

    // 4. Start resource monitor
    go k.monitorResources()

    // 5. Start event publisher
    go k.publishHeartbeats()

    k.setStatus(KernelRunning)
    k.PublishEvent(ctx, &KernelEvent{Type: EventKernelReady})

    return nil
}
```

## Directory Structure

```
internal/kernel/
    kernel.go           # Main kernel implementation
    process.go          # Process management
    mailbox.go          # Message passing
    lifecycle.go        # Lifecycle management
    registry.go         # Process registry
    resource.go         # Resource management
    permission.go       # Permission enforcement
    events.go           # Event publishing
    supervisor.go       # Supervisor pattern
```
