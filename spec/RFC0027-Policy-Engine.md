# RFC-0027: Policy Engine

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000, RFC-0024

## Problem

Currently, capability permissions are hardcoded per role:

```go
if role == RoleCoder {
    allow("read_files")
    allow("write_files")
    deny("docker")
}
```

This is inflexible and doesn't support:
- Dynamic policy changes
- User-level overrides
- Context-aware decisions
- Audit trails
- Policy composition

## Solution

```
Policy Engine
  │
  ├── Policy Registry
  ├── Policy Evaluator
  ├── Audit Logger
  └── Context Provider
```

## Policy Schema

```go
type Policy struct {
    ID          string
    Name        string
    Description string
    Effect      PolicyEffect  // ALLOW or DENY
    Conditions  []Condition
    Actions     []string      // Capabilities or operations
    Priority    int           // Higher = evaluated first
    Enabled     bool
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type PolicyEffect string

const (
    EffectAllow PolicyEffect = "ALLOW"
    EffectDeny  PolicyEffect = "DENY"
)

type Condition struct {
    Type      ConditionType
    Field     string      // e.g., "user.tier", "process.role", "resource.type"
    Operator  Operator
    Value     interface{}
    Negate    bool
}

type ConditionType string

const (
    CondRole           ConditionType = "role"
    CondUser           ConditionType = "user"
    CondCapability     ConditionType = "capability"
    CondResource       ConditionType = "resource"
    CondTime           ConditionType = "time"
    CondBudget         ConditionType = "budget"
    CondIPAddress      ConditionType = "ip_address"
    CondChannel        ConditionType = "channel"
)

type Operator string

const (
    OpEq         Operator = "eq"
    OpNeq        Operator = "neq"
    OpIn         Operator = "in"
    OpNotIn      Operator = "not_in"
    OpContains   Operator = "contains"
    OpGt         Operator = "gt"
    OpLt         Operator = "lt"
    OpGte        Operator = "gte"
    OpLte        Operator = "lte"
    OpMatches    Operator = "matches"  // Regex
)
```

## Policy Examples

### Coder Role Policy

```yaml
id: policy-coder
name: Coder Role Policy
description: Permissions for coder agents

effect: ALLOW

conditions:
  - type: role
    operator: eq
    value: coder

actions:
  - read_files
  - write_files
  - list_files
  - search_files
  - modify_code
  - shell
  - git_status
  - git_diff
  - git_branch
  - build
  - test

priority: 100
enabled: true
```

### Reviewer Role Policy

```yaml
id: policy-reviewer
name: Reviewer Role Policy
description: Permissions for reviewer agents (no file modification)

effect: ALLOW

conditions:
  - type: role
    operator: eq
    value: reviewer

actions:
  - read_files
  - list_files
  - search_files
  - git_status
  - git_diff
  - analyze
  - review

priority: 100
enabled: true
```

### Shell Restriction

```yaml
id: policy-shell-restricted
name: Shell Restriction
description: Restrict dangerous shell commands

effect: DENY

conditions:
  - type: capability
    operator: eq
    value: shell

actions:
  - shell

conditions_detail:
  - type: capability
    operator: contains
    value: "rm -rf"
    field: command
    negate: true

priority: 200  # Higher than allow policies
enabled: true
```

### Budget Policy

```yaml
id: policy-budget-limit
name: Budget Limit
description: Limit LLM spend per session

effect: ALLOW

conditions:
  - type: budget
    operator: lt
    value: 10.00  # $10

actions:
  - llm_call

priority: 50
enabled: true
```

### Docker Restriction

```yaml
id: policy-docker-restricted
name: Docker Restriction
description: Only DevOps can use Docker

effect: DENY

conditions:
  - type: role
    operator: not_in
    value:
      - devops
      - system

actions:
  - docker_run
  - docker_build

priority: 150
enabled: true
```

## Policy Engine Interface

```go
type PolicyEngine interface {
    // Policy Management
    AddPolicy(policy *Policy) error
    UpdatePolicy(id string, policy *Policy) error
    DeletePolicy(id string) error
    GetPolicy(id string) (*Policy, error)
    ListPolicies() ([]*Policy, error)

    // Evaluation
    Check(ctx context.Context, req *PolicyRequest) (*PolicyResult, error)
    CheckCapability(ctx context.Context, pid string, cap Capability) error
    CheckAction(ctx context.Context, pid string, action string, resource string) error

    // Audit
    GetAuditLog(ctx context.Context, query *AuditQuery) ([]*AuditEntry, error)
}

type PolicyRequest struct {
    ProcessID   string
    UserID      string
    Role        ProcessRole
    Capability  Capability
    Action      string
    Resource    string
    Channel     string
    Budget      float64
    Metadata    map[string]interface{}
    Timestamp   time.Time
}

type PolicyResult struct {
    Allowed  bool
    PolicyID string  // Policy that decided
    Reason   string
    AuditID  string
}
```

## Policy Evaluator

```go
type Evaluator struct {
    policies []*Policy
    cache    *lru.Cache
}

func (e *Evaluator) Evaluate(req *PolicyRequest) (*PolicyResult, error) {
    // Check cache
    cacheKey := e.cacheKey(req)
    if cached, ok := e.cache.Get(cacheKey); ok {
        return cached.(*PolicyResult), nil
    }

    // Sort policies by priority (descending)
    sorted := e.sortByPriority(e.policies)

    // Evaluate in order
    for _, policy := range sorted {
        if !e.matchesConditions(req, policy.Conditions) {
            continue
        }

        if e.matchesActions(req, policy.Actions) {
            result := &PolicyResult{
                Allowed:  policy.Effect == EffectAllow,
                PolicyID: policy.ID,
                Reason:   policy.Description,
            }

            // Cache result (short TTL)
            e.cache.Add(cacheKey, result, 5*time.Minute)

            return result, nil
        }
    }

    // Default deny
    return &PolicyResult{
        Allowed: false,
        Reason:  "no matching policy",
    }, nil
}

func (e *Evaluator) matchesConditions(req *PolicyRequest, conditions []Condition) bool {
    for _, cond := range conditions {
        if !e.evaluateCondition(req, cond) {
            return false
        }
    }
    return true
}

func (e *Evaluator) evaluateCondition(req *PolicyRequest, cond Condition) bool {
    var fieldValue interface{}

    switch cond.Field {
    case "role":
        fieldValue = string(req.Role)
    case "user":
        fieldValue = req.UserID
    case "capability":
        fieldValue = string(req.Capability)
    case "resource":
        fieldValue = req.Resource
    case "budget":
        fieldValue = req.Budget
    case "channel":
        fieldValue = req.Channel
    default:
        fieldValue = req.Metadata[cond.Field]
    }

    result := e.compare(fieldValue, cond.Operator, cond.Value)

    if cond.Negate {
        result = !result
    }

    return result
}
```

## Audit Logging

```go
type AuditEntry struct {
    ID          string
    Timestamp   time.Time
    Request     *PolicyRequest
    Result      *PolicyResult
    Latency     time.Duration
}

type AuditLogger interface {
    Log(req *PolicyRequest, result *PolicyResult) error
    Query(query *AuditQuery) ([]*AuditEntry, error)
}

type AuditQuery struct {
    ProcessID string
    UserID    string
    Since     time.Time
    Until     time.Time
    Allowed   *bool  // Filter by allowed/denied
    Limit     int
}
```

## Integration with Kernel

```go
type Kernel struct {
    // ... existing fields ...
    policyEngine *PolicyEngine
}

func (k *Kernel) CheckPermission(pid string, cap Capability, resource string) error {
    proc, err := k.processes.Get(pid)
    if err != nil {
        return err
    }

    req := &PolicyRequest{
        ProcessID:  pid,
        UserID:     proc.UserID,
        Role:       proc.Role,
        Capability: cap,
        Resource:   resource,
        Timestamp:  time.Now(),
    }

    result, err := k.policyEngine.Check(context.Background(), req)
    if err != nil {
        return err
    }

    if !result.Allowed {
        return fmt.Errorf("permission denied: %s by policy %s", result.Reason, result.PolicyID)
    }

    return nil
}
```

## Policy Composition

Policies can be composed using AND/OR:

```go
type PolicySet struct {
    ID       string
    Name     string
    Mode     SetMode  // ALL_MUST_MATCH, ANY_MATCH
    PolicyIDs []string
}

type SetMode string

const (
    SetModeAll SetMode = "ALL_MUST_MATCH"  // AND
    SetModeAny SetMode = "ANY_MATCH"       // OR
)

// Example: Coder + Security policies combined
coderSecuritySet := &PolicySet{
    ID:    "coder-security",
    Name:  "Coder with Security",
    Mode:  SetModeAll,
    PolicyIDs: []string{
        "policy-coder",
        "policy-security-scan",
    },
}
```

## Dynamic Policy Updates

Policies can be updated at runtime:

```go
// Admin updates policy
err := kernel.policyEngine.UpdatePolicy("policy-shell-restricted", &Policy{
    Effect: EffectDeny,
    // ... updated fields ...
})

// All agents automatically get new policy on next check
```

## Directory Structure

```
internal/policy/
    engine.go          # Main policy engine
    evaluator.go       # Policy evaluation
    registry.go       # Policy storage
    audit.go          # Audit logging
    cache.go          # Result caching
    policies/          # Built-in policies
        coder.yaml
        reviewer.yaml
        devops.yaml
        shell-restriction.yaml
        docker-restriction.yaml
        budget-limit.yaml
```
