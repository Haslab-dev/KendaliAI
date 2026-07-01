# RFC-0033: Tool Scheduler

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0024, RFC-0025

## Problem

Currently tools execute sequentially:

```go
for _, task := range tasks {
    result := executor.Execute(task)  // Wait for each
}
```

This is slow. Many tools could run in parallel:
- Read File A and Read File B (no dependency)
- Search for pattern and Git status (no dependency)
- Check syntax and Run tests (no dependency)

But we can't blindly parallelize because:
- Task B depends on Task A output
- Resource limits (max concurrent file reads)
- Rate limits (Git API)
- Cost limits

## Solution

```
Planner
    │
    ▼
Task Queue
    │
    ▼
Priority Scheduler
    │
    ├── Dependency Resolver
    ├── Resource Checker
    ├── Rate Limiter
    └── Budget Checker
    │
    ▼
Worker Pool
    │
    ├── Worker 1 (Read File A)
    ├── Worker 2 (Read File B)
    ├── Worker 3 (Search) ──► waiting for A
    └── Worker 4 (Build)  ──► waiting for C
    │
    ▼
Results
```

## Tool Scheduler Interface

```go
type ToolScheduler interface {
    // Schedule tasks for execution
    Schedule(ctx context.Context, tasks []*ScheduledTask) (*ScheduleResult, error)

    // Cancel scheduled tasks
    Cancel(ctx context.Context, taskIDs []string) error

    // Get current schedule status
    Status(ctx context.Context) (*SchedulerStatus, error)

    // Pause/resume scheduler
    Pause(ctx context.Context) error
    Resume(ctx context.Context) error
}

type ScheduledTask struct {
    ID          string
    Capability  Capability
    Tool        string
    Params      map[string]interface{}
    DependsOn   []string        // Task IDs this depends on
    Priority    int             // Higher = earlier
    Deadline    *time.Time      // Optional deadline
    MaxRetries  int
    Timeout     time.Duration
}

type ScheduleResult struct {
    Scheduled []*TaskInfo
    Queued    []*TaskInfo
    Rejected  []*RejectedTask
}

type TaskInfo struct {
    ID        string
    Status    TaskStatus
    WorkerID  string
    ScheduledAt time.Time
    StartedAt *time.Time
}

type RejectedTask struct {
    Task      *ScheduledTask
    Reason    string
    Code      RejectionCode
}

type RejectionCode string

const (
    RejectDependency   RejectionCode = "dependency_not_met"
    RejectResource    RejectionCode = "resource_exceeded"
    RejectRateLimit   RejectionCode = "rate_limit"
    RejectBudget      RejectionCode = "budget_exceeded"
    RejectCapacity    RejectionCode = "no_workers"
)
```

## Dependency Graph

```go
type DependencyGraph struct {
    tasks    map[string]*ScheduledTask
    incoming map[string][]string  // task -> tasks that depend on it
    outgoing map[string][]string  // task -> tasks it depends on
}

func NewDependencyGraph(tasks []*ScheduledTask) (*DependencyGraph, error) {
    g := &DependencyGraph{
        tasks:    make(map[string]*ScheduledTask),
        incoming: make(map[string][]string),
        outgoing: make(map[string][]string),
    }

    for _, task := range tasks {
        g.tasks[task.ID] = task

        for _, dep := range task.DependsOn {
            g.outgoing[task.ID] = append(g.outgoing[task.ID], dep)
            g.incoming[dep] = append(g.incoming[dep], task.ID)
        }
    }

    // Check for cycles
    if cycle := g.detectCycle(); cycle != nil {
        return nil, fmt.Errorf("dependency cycle detected: %v", cycle)
    }

    return g, nil
}

func (g *DependencyGraph) GetReadyTasks() []*ScheduledTask {
    var ready []*ScheduledTask

    for id, task := range g.tasks {
        // Check if all dependencies are satisfied
        if g.allDependenciesMet(id) {
            ready = append(ready, task)
        }
    }

    // Sort by priority
    sort.Slice(ready, func(i, j int) bool {
        return ready[i].Priority > ready[j].Priority
    })

    return ready
}

func (g *DependencyGraph) allDependenciesMet(taskID string) bool {
    deps := g.outgoing[taskID]
    for _, dep := range deps {
        depTask := g.tasks[dep]
        if depTask.Status != TaskStatusCompleted {
            return false
        }
    }
    return true
}

func (g *DependencyGraph) MarkCompleted(taskID string) {
    g.tasks[taskID].Status = TaskStatusCompleted
}
```

## Priority Queue

```go
type PriorityQueue struct {
    tasks    []*ScheduledTask
    index    map[string]int
    comp     func(a, b *ScheduledTask) bool
}

func NewPriorityQueue(capacity int, comp func(a, b *ScheduledTask) bool) *PriorityQueue {
    return &PriorityQueue{
        tasks: make([]*ScheduledTask, 0, capacity),
        index: make(map[string]int),
        comp:  comp,
    }
}

func (q *PriorityQueue) Push(task *ScheduledTask) {
    q.tasks = append(q.tasks, task)
    q.bubbleUp(len(q.tasks) - 1)
}

func (q *PriorityQueue) Pop() *ScheduledTask {
    if len(q.tasks) == 0 {
        return nil
    }

    task := q.tasks[0]
    last := q.tasks[len(q.tasks)-1]
    q.tasks[0] = last
    q.tasks = q.tasks[:len(q.tasks)-1]
    q.bubbleDown(0)

    return task
}

func (q *PriorityQueue) Update(task *ScheduledTask) {
    if idx, ok := q.index[task.ID]; ok {
        q.tasks[idx] = task
        q.bubbleUp(idx)
        q.bubbleDown(idx)
    }
}
```

## Resource Manager Integration

```go
type ResourceChecker struct {
    resourceManager *resource.Manager
}

func (r *ResourceChecker) Check(task *ScheduledTask) *RejectionReason {
    // Check CPU
    if r.resourceManager.GetCPUUsage() > r.resourceManager.GetCPULimit()*0.9 {
        return &RejectionReason{
            Code: RejectResource,
            Message: "CPU limit exceeded",
        }
    }

    // Check Memory
    if r.resourceManager.GetMemoryUsage() > r.resourceManager.GetMemoryLimit()*0.9 {
        return &RejectionReason{
            Code: RejectResource,
            Message: "Memory limit exceeded",
        }
    }

    // Check concurrent file operations
    if task.Capability == CapReadFiles || task.Capability == CapWriteFiles {
        if r.resourceManager.GetFileOps() > r.resourceManager.GetFileOpsLimit() {
            return &RejectionReason{
                Code: RejectResource,
                Message: "Too many concurrent file operations",
            }
        }
    }

    return nil
}
```

## Rate Limiter Integration

```go
type RateLimiter struct {
    limiters map[Capability]*tokenBucket
}

type tokenBucket struct {
    tokens     float64
    maxTokens  float64
    refillRate float64  // tokens per second
    lastRefill time.Time
    mu         sync.Mutex
}

func (r *RateLimiter) Allow(cap Capability, tokens int) bool {
    r.limiters[cap].mu.Lock()
    defer r.limiters[cap].mu.Unlock()

    bucket := r.limiters[cap]
    now := time.Now()
    elapsed := now.Sub(bucket.lastRefill).Seconds()
    bucket.tokens = math.Min(bucket.maxTokens, bucket.tokens+elapsed*bucket.refillRate)
    bucket.lastRefill = now

    if bucket.tokens >= float64(tokens) {
        bucket.tokens -= float64(tokens)
        return true
    }

    return false
}

func (r *RateLimiter) Wait(cap Capability, tokens int, timeout time.Duration) error {
    deadline := time.Now().Add(timeout)

    for time.Now().Before(deadline) {
        if r.Allow(cap, tokens) {
            return nil
        }
        time.Sleep(100 * time.Millisecond)
    }

    return fmt.Errorf("rate limit timeout for %s", cap)
}
```

## Scheduler Implementation

```go
type Scheduler struct {
    workers       int
    dependencyGraph *DependencyGraph
    readyQueue    *PriorityQueue
    runningTasks   map[string]*RunningTask
    completedTasks map[string]*CompletedTask
    resource      *ResourceChecker
    rateLimiter   *RateLimiter
    budgetChecker *BudgetChecker
    eventBus      event.Bus
    mu            sync.RWMutex
}

func (s *Scheduler) Schedule(ctx context.Context, tasks []*ScheduledTask) (*ScheduleResult, error) {
    // Build dependency graph
    graph, err := NewDependencyGraph(tasks)
    if err != nil {
        return nil, err
    }
    s.dependencyGraph = graph

    result := &ScheduleResult{}

    // Classify tasks
    for _, task := range tasks {
        if len(task.DependsOn) > 0 {
            // Has dependencies, queue for later
            result.Queued = append(result.Queued, &TaskInfo{ID: task.ID, Status: TaskStatusQueued})
        } else {
            // No dependencies, check if can run now
            if reason := s.canExecute(task); reason == nil {
                result.Scheduled = append(result.Scheduled, &TaskInfo{ID: task.ID, Status: TaskStatusScheduled})
                s.scheduleTask(task)
            } else {
                result.Rejected = append(result.Rejected, &RejectedTask{
                    Task:   task,
                    Reason: reason.Message,
                    Code:   reason.Code,
                })
            }
        }
    }

    return result, nil
}

func (s *Scheduler) scheduleTask(task *ScheduledTask) {
    s.mu.Lock()
    s.readyQueue.Push(task)
    s.mu.Unlock()

    // Signal workers
    s.workerSignal <- struct{}{}
}

func (s *Scheduler) workerLoop(workerID int) {
    for {
        select {
        case <-s.ctx.Done():
            return
        case <-s.workerSignal:
            s.mu.Lock()
            task := s.readyQueue.Pop()
            s.mu.Unlock()

            if task == nil {
                continue
            }

            s.executeTask(workerID, task)
        }
    }
}

func (s *Scheduler) executeTask(workerID int, task *ScheduledTask) {
    startTime := time.Now()

    // Execute via capability runtime
    result, err := s.capabilityRuntime.Execute(s.ctx, task.Capability, task.Params)

    duration := time.Since(startTime)

    // Record completion
    s.mu.Lock()
    s.completedTasks[task.ID] = &CompletedTask{
        Task:      task,
        Result:    result,
        Error:     err,
        Duration:  duration,
        CompletedAt: time.Now(),
    }

    // Mark dependencies as satisfied
    s.dependencyGraph.MarkCompleted(task.ID)

    // Check for newly ready tasks
    for _, readyTask := range s.dependencyGraph.GetReadyTasks() {
        if reason := s.canExecute(readyTask); reason == nil {
            s.readyQueue.Push(readyTask)
            s.workerSignal <- struct{}{}
        }
    }
    s.mu.Unlock()

    // Publish event
    s.eventBus.Publish(s.ctx, &event.Event{
        Type:   event.TaskCompleted,
        TaskID: task.ID,
        Data: map[string]interface{}{
            "worker_id": workerID,
            "duration":  duration,
            "error":      err,
        },
    })
}
```

## Task Priorities

```go
// Default priorities by capability
var DefaultPriorities = map[Capability]int{
    // High priority
    CapBuild:        100,
    CapTest:         100,
    CapReview:       100,

    // Medium priority
    CapWriteFiles:   50,
    CapReadFiles:    50,
    CapSearchFiles:   50,

    // Low priority
    CapGitStatus:    10,
    CapGitLog:       10,
    CapStoreMemory:  10,
}

// File operation limits
var FileOpLimits = map[string]int{
    "read":  10,  // Max 10 concurrent reads
    "write": 5,   // Max 5 concurrent writes
    "delete": 2,  // Max 2 concurrent deletes
}
```

## Parallel Execution Example

```
Input tasks:
1. Read File A (priority: 50, deps: none)
2. Read File B (priority: 50, deps: none)
3. Search Files (priority: 50, deps: [1])  // Needs A's content
4. Git Status (priority: 10, deps: none)
5. Build (priority: 100, deps: [2, 3])     // Needs B and Search

Schedule:

T=0: Ready: [A, B, GitStatus]
      Workers: [A, B, GitStatus] running

T=1: A completes
      Ready: [Search (deps met), Build (deps not met)]
      Workers: [Search, B, GitStatus] running

T=2: B completes
      Ready: [Build (deps: B met, Search not met)]
      Workers: [Search, GitStatus] running

T=3: Search completes
      Ready: [Build (deps now met)]
      Workers: [Build] running

T=4: Build completes
      All done
```

## Integration with Executor

```go
type ToolExecutor struct {
    scheduler *Scheduler
    runtime   *CapabilityRuntime
}

func (e *ToolExecutor) Execute(ctx context.Context, tasks []*ScheduledTask) ([]*TaskResult, error) {
    result, err := e.scheduler.Schedule(ctx, tasks)
    if err != nil {
        return nil, err
    }

    // Wait for all tasks to complete
    var results []*TaskResult
    for _, task := range tasks {
        res := <-task.ResultCh
        results = append(results, res)
    }

    return results, nil
}
```

## Directory Structure

```
internal/scheduler/
    scheduler.go       # Main scheduler
    dependency.go      # Dependency graph
    priority.go        # Priority queue
    resource_checker.go # Resource limits
    rate_limiter.go    # Rate limiting
    budget_checker.go  # Budget checking
    worker.go          # Worker implementation
```
