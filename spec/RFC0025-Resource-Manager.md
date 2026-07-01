# RFC-0025: Resource Manager

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000

## Problem

Without resource management:
```
10 users
  │
  ▼
100 docker containers
  │
  ▼
System dead
```

## Solution

Resource manager tracks and limits:
- CPU
- RAM
- Disk
- Docker
- GPU
- Model tokens
- Budget
- Timeouts

## Resource Specification

```go
type ResourceSpec struct {
    CPU      *CPU资源
    Memory   *MemoryResource
    Disk     *DiskResource
    GPU      *GPUResource
    Network  *NetworkResource
    Model    *ModelResource
    Budget   *BudgetResource
    Timeout  time.Duration
}

type CPUResource struct {
    Cores      int
    Percent    int  // 0-100
}

type MemoryResource struct {
    LimitMB    int64
}

type DiskResource struct {
    LimitMB    int64
    Path       string
}

type GPUResource struct {
    Count     int
    MemoryMB  int64
}

type ModelResource struct {
    MaxTokens    int
    MaxConcurrent int
}

type BudgetResource struct {
    MaxUSD      float64
    PerMinute   float64
}
```

## Resource Tracker

```go
type ResourceTracker struct {
    kernel   Kernel
    limits   *GlobalLimits
    usage    map[string]*ResourceUsage  // PID -> usage
    mu       sync.RWMutex
}

type GlobalLimits struct {
    MaxCPUPercent      int
    MaxMemoryMB        int64
    MaxDiskMB          int64
    MaxDockerContainers int
    MaxGPUCount        int
    MaxTokensPerMinute  int
    MaxConcurrentUsers  int
    MaxBudgetPerHour   float64
}

type ResourceUsage struct {
    PID         string
    CPUPercent  float64
    MemoryMB    int64
    DiskMB      int64
    DockerCount int
    GPUCount    int
    TokensUsed  int
    CostUSD     float64
    UpdatedAt   time.Time
}

func (r *ResourceTracker) Allocate(pid string, spec *ResourceSpec) error {
    r.mu.Lock()
    defer r.mu.Unlock()

    // Check global limits
    if err := r.checkGlobalLimits(spec); err != nil {
        return err
    }

    // Check user limits
    if err := r.checkUserLimits(pid, spec); err != nil {
        return err
    }

    // Allocate
    r.usage[pid] = &ResourceUsage{
        PID: pid,
    }

    return nil
}

func (r *ResourceTracker) checkGlobalLimits(spec *ResourceSpec) error {
    current := r.getCurrentUsage()

    if spec.CPU != nil && current.CPUPercent+spec.CPU.Percent > r.limits.MaxCPUPercent {
        return fmt.Errorf("CPU limit exceeded: %d%% available", r.limits.MaxCPUPercent-current.CPUPercent)
    }

    if spec.Memory != nil && current.MemoryMB+spec.Memory.LimitMB > r.limits.MaxMemoryMB {
        return fmt.Errorf("memory limit exceeded: %dMB available", r.limits.MaxMemoryMB-current.MemoryMB)
    }

    if spec.Disk != nil && current.DiskMB+spec.Disk.LimitMB > r.limits.MaxDiskMB {
        return fmt.Errorf("disk limit exceeded: %dMB available", r.limits.MaxDiskMB-current.DiskMB)
    }

    if spec.Docker != nil && current.DockerCount+spec.Docker.Count > r.limits.MaxDockerContainers {
        return fmt.Errorf("docker limit exceeded: %d available", r.limits.MaxDockerContainers-current.DockerCount)
    }

    return nil
}

func (r *ResourceTracker) Release(pid string) error {
    r.mu.Lock()
    defer r.mu.Unlock()

    delete(r.usage, pid)
    return nil
}
```

## Budget Manager

```go
type BudgetManager struct {
    userBudgets map[string]*UserBudget
    rates       map[string]float64  // model -> USD per 1K tokens
    mu          sync.RWMutex
}

type UserBudget struct {
    UserID       string
    MonthlyLimit float64
    DailyLimit   float64
    UsedThisMonth float64
    UsedToday    float64
    LastReset    time.Time
}

func (b *BudgetManager) CheckBudget(userID string, tokens int, model string) error {
    b.mu.Lock()
    defer b.mu.Unlock()

    budget, ok := b.userBudgets[userID]
    if !ok {
        return fmt.Errorf("no budget configured for user %s", userID)
    }

    // Reset daily if needed
    if time.Since(budget.LastReset) > 24*time.Hour {
        budget.UsedToday = 0
        budget.LastReset = time.Now()
    }

    // Calculate cost
    rate := b.rates[model]
    cost := float64(tokens) / 1000 * rate

    // Check limits
    if budget.UsedToday+cost > budget.DailyLimit {
        return fmt.Errorf("daily budget exceeded: $%.2f remaining", budget.DailyLimit-budget.UsedToday)
    }

    if budget.UsedThisMonth+cost > budget.MonthlyLimit {
        return fmt.Errorf("monthly budget exceeded: $%.2f remaining", budget.MonthlyLimit-budget.UsedThisMonth)
    }

    return nil
}

func (b *BudgetManager) Charge(userID string, tokens int, model string) error {
    b.mu.Lock()
    defer b.mu.Unlock()

    rate := b.rates[model]
    cost := float64(tokens) / 1000 * rate

    budget := b.userBudgets[userID]
    budget.UsedToday += cost
    budget.UsedThisMonth += cost

    return nil
}
```

## Rate Limiter

```go
type RateLimiter struct {
    tokensPerMinute map[string]*TokenBucket
    mu              sync.RWMutex
}

type TokenBucket struct {
    UserID       string
    Tokens       float64
    LastRefill   time.Time
    MaxTokens    float64
    RefillRate   float64  // tokens per second
}

func (r *RateLimiter) Allow(userID string, tokens int) bool {
    r.mu.Lock()
    defer r.mu.Unlock()

    bucket, ok := r.tokensPerMinute[userID]
    if !ok {
        bucket = &TokenBucket{
            UserID:     userID,
            MaxTokens:  10000,  // 10k tokens per minute default
            RefillRate: 166.67, // refill 10k per minute = 166.67/sec
        }
        r.tokensPerMinute[userID] = bucket
    }

    // Refill
    now := time.Now()
    elapsed := now.Sub(bucket.LastRefill).Seconds()
    bucket.Tokens = min(bucket.MaxTokens, bucket.Tokens+elapsed*bucket.RefillRate)
    bucket.LastRefill = now

    // Check
    if bucket.Tokens >= float64(tokens) {
        bucket.Tokens -= float64(tokens)
        return true
    }

    return false
}
```

## Resource Monitor

```go
type ResourceMonitor struct {
    tracker    *ResourceTracker
    notifier   *Notifier
    limits     *GlobalLimits
    stopCh     chan struct{}
}

func (m *ResourceMonitor) Start(ctx context.Context) {
    m.stopCh = make(chan struct{})

    go m.monitorLoop(ctx)
    go m.cleanupLoop(ctx)
}

func (m *ResourceMonitor) monitorLoop(ctx context.Context) {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            m.checkResources(ctx)
        }
    }
}

func (m *ResourceMonitor) checkResources(ctx context.Context) {
    usage := m.tracker.GetCurrentUsage()

    // Check each limit
    if float64(usage.CPUPercent)/float64(m.limits.MaxCPUPercent) > 0.9 {
        m.publishWarning(ctx, "cpu", "CPU usage above 90%")
    }

    if float64(usage.MemoryMB)/float64(m.limits.MaxMemoryMB) > 0.9 {
        m.publishWarning(ctx, "memory", "Memory usage above 90%")
    }

    if usage.DockerCount > m.limits.MaxDockerContainers-2 {
        m.publishWarning(ctx, "docker", "Docker containers nearly exhausted")
    }
}

func (m *ResourceMonitor) publishWarning(ctx context.Context, resource, message string) {
    m.notifier.Notify(&Warning{
        Resource: resource,
        Message:  message,
        Severity: SeverityHigh,
        Time:     time.Now(),
    })
}
```

## Directory Structure

```
internal/resource/
    manager.go        # Resource manager
    tracker.go        # Usage tracking
    limits.go         # Limit definitions
    budget.go         # Budget management
    rate.go           # Rate limiting
    monitor.go        # Resource monitor
```
