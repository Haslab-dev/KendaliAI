# RFC-0020: Workflow Engine

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000, RFC-0019

## Overview

Hermes isn't task-based. It's workflow-based.

A workflow is a reusable template for complex multi-phase operations.

## Workflow vs Task

| Aspect | Task | Workflow |
|--------|------|----------|
| Scope | Single operation | Multi-phase operation |
| Reusability | Not reusable | Fully reusable |
| Examples | "Read file", "Run tests" | "Create project", "Fix bug" |
| Planning | Atomic | Composed of phases |

## Workflow Template

```go
type Workflow struct {
    ID          string
    Name        string
    Description string
    Phases      []Phase
    Variables   map[string]interface{}
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type Phase struct {
    ID           string
    Name         string
    Type         PhaseType
    AgentRole    ProcessRole
    Capabilities []Capability
    Inputs       []VariableRef
    Outputs      []VariableRef
    RetryPolicy  *RetryPolicy
    Timeout      time.Duration
}

type PhaseType string

const (
    PhasePlanning      PhaseType = "planning"
    PhaseAnalysis      PhaseType = "analysis"
    PhaseCoding        PhaseType = "coding"
    PhaseTesting       PhaseType = "testing"
    PhaseReview        PhaseType = "review"
    PhaseDocumentation PhaseType = "documentation"
    PhaseDeployment    PhaseType = "deployment"
    PhaseMerge         PhaseType = "merge"
    PhaseSummary       PhaseType = "summary"
    PhaseWaitUser      PhaseType = "wait_user"
)
```

## Standard Workflows

### CreateProject Workflow

```yaml
name: CreateProject
description: Create a new project from scratch

phases:
  - id: planning
    name: Planning
    type: planning
    agent_role: planner
    capabilities: [read_files, search]
    inputs: [goal]
    outputs: [plan]

  - id: analysis
    name: Repository Analysis
    type: analysis
    agent_role: researcher
    capabilities: [read_files, search, git]
    inputs: [plan]
    outputs: [analysis_result]

  - id: coding
    name: Implementation
    type: coding
    agent_role: coder
    capabilities: [read_files, write_files, shell, git, build]
    inputs: [analysis_result]
    outputs: [patches]

  - id: testing
    name: Testing
    type: testing
    agent_role: tester
    capabilities: [read_files, shell, test]
    inputs: [patches]
    outputs: [test_results]

  - id: review
    name: Code Review
    type: review
    agent_role: reviewer
    capabilities: [read_files, search, git_diff]
    inputs: [patches, test_results]
    outputs: [review_report]

  - id: merge
    name: Merge and Build
    type: merge
    agent_role: supervisor
    capabilities: [git]
    inputs: [patches, review_report]
    outputs: [commit]

  - id: summary
    name: Summary
    type: summary
    agent_role: document
    capabilities: [read_files]
    inputs: [commit, test_results, review_report]
    outputs: [summary_report]

  - id: wait_user
    name: Wait for User
    type: wait_user
    agent_role: supervisor
    inputs: [summary_report]
    outputs: [user_feedback]
```

### FixBug Workflow

```yaml
name: FixBug
description: Analyze and fix a bug

phases:
  - id: analysis
    name: Bug Analysis
    type: analysis
    agent_role: researcher
    capabilities: [read_files, search, git]
    inputs: [bug_report]
    outputs: [root_cause]

  - id: coding
    name: Implement Fix
    type: coding
    agent_role: coder
    capabilities: [read_files, write_files, shell]
    inputs: [root_cause]
    outputs: [patch]

  - id: testing
    name: Verify Fix
    type: testing
    agent_role: tester
    capabilities: [shell, test]
    inputs: [patch]
    outputs: [test_results]

  - id: review
    name: Review
    type: review
    agent_role: reviewer
    capabilities: [read_files, git_diff]
    inputs: [patch]
    outputs: [review_report]

  - id: merge
    name: Merge
    type: merge
    agent_role: supervisor
    capabilities: [git]
    inputs: [patch, review_report]
    outputs: [commit]
```

### CodeReview Workflow

```yaml
name: CodeReview
description: Perform a comprehensive code review

phases:
  - id: analysis
    name: Gather Context
    type: analysis
    agent_role: researcher
    capabilities: [read_files, search, git]
    inputs: [diff]
    outputs: [context]

  - id: architecture
    name: Architecture Review
    type: review
    agent_role: architect
    capabilities: [read_files, search]
    inputs: [context]
    outputs: [arch_review]

  - id: security
    name: Security Review
    type: review
    agent_role: security
    capabilities: [read_files, search]
    inputs: [context]
    outputs: [security_review]

  - id: performance
    name: Performance Review
    type: review
    agent_role: performance
    capabilities: [read_files, search, shell]
    inputs: [context]
    outputs: [perf_review]

  - id: summary
    name: Compile Report
    type: summary
    agent_role: reviewer
    capabilities: []
    inputs: [arch_review, security_review, perf_review]
    outputs: [review_report]
```

## Workflow Engine

```go
type WorkflowEngine struct {
    kernel   Kernel
    registry *WorkflowRegistry
    executor *PhaseExecutor
}

type WorkflowRegistry struct {
    workflows map[string]*Workflow
    mu        sync.RWMutex
}

func (e *WorkflowEngine) Start(ctx context.Context, workflowID string, inputs map[string]interface{}) (*WorkflowRun, error) {
    wf, ok := e.registry.Get(workflowID)
    if !ok {
        return nil, fmt.Errorf("workflow %s not found", workflowID)
    }

    run := &WorkflowRun{
        ID:          uuid.New().String(),
        WorkflowID:  workflowID,
        Status:      RunStarted,
        PhaseIndex:  0,
        PhaseRuns:   make([]*PhaseRun, 0, len(wf.Phases)),
        Variables:   inputs,
        StartedAt:   time.Now(),
    }

    // Execute phases sequentially
    for i, phase := range wf.Phases {
        phaseRun, err := e.executePhase(ctx, run, phase, i)
        if err != nil {
            run.Status = RunFailed
            run.Error = err
            return run, err
        }
        run.PhaseRuns = append(run.PhaseRuns, phaseRun)

        // Check for wait_user phase
        if phase.Type == PhaseWaitUser {
            run.Status = RunWaitingUser
            return run, nil
        }
    }

    run.Status = RunCompleted
    run.CompletedAt = time.Now()
    return run, nil
}

func (e *WorkflowEngine) Resume(ctx context.Context, runID string, userInput interface{}) (*WorkflowRun, error) {
    run, err := e.GetRun(runID)
    if err != nil {
        return nil, err
    }

    // Set user input as phase output
    lastPhase := run.PhaseRuns[len(run.PhaseRuns)-1]
    lastPhase.Outputs["user_feedback"] = userInput
    run.Variables["user_feedback"] = userInput

    // Continue from next phase
    wf, _ := e.registry.Get(run.WorkflowID)
    for i := run.PhaseIndex + 1; i < len(wf.Phases); i++ {
        phaseRun, err := e.executePhase(ctx, run, wf.Phases[i], i)
        if err != nil {
            run.Status = RunFailed
            return run, err
        }
        run.PhaseRuns = append(run.PhaseRuns, phaseRun)
    }

    run.Status = RunCompleted
    return run, nil
}
```

## Phase Executor

```go
type PhaseExecutor struct {
    kernel  Kernel
    runtime *Runtime
}

func (e *PhaseExecutor) Execute(ctx context.Context, run *WorkflowRun, phase *Phase) (*PhaseRun, error) {
    phaseRun := &PhaseRun{
        ID:        uuid.New().String(),
        PhaseID:   phase.ID,
        Status:    PhaseRunning,
        StartedAt: time.Now(),
    }

    // Create agent for this phase
    proc, err := e.runtime.Spawn(ctx, ProcessSpec{
        ID:       fmt.Sprintf("%s-%s", run.ID, phase.ID),
        ParentID: run.SupervisorPID,
        Role:     phase.AgentRole,
        Goal:     fmt.Sprintf("Execute phase: %s", phase.Name),
        Tools:    phase.Capabilities,
        Budget: &Budget{
            MaxTokens: 50000,
            MaxCost:   0.10,
            Timeout:   phase.Timeout,
        },
    })
    if err != nil {
        return nil, err
    }

    phaseRun.PID = proc.ID

    // Prepare inputs
    inputs := e.prepareInputs(run, phase)

    // Send execution message
    err = e.kernel.Send(ctx, &Message{
        From:    "workflow-engine",
        To:      proc.ID,
        Type:    MsgExecute,
        Payload: &ExecuteRequest{
            Phase:   phase,
            Inputs:  inputs,
        },
    })
    if err != nil {
        return nil, err
    }

    // Wait for result
    result, err := e.kernel.Wait(ctx, proc.ID)
    if err != nil {
        phaseRun.Status = PhaseFailed
        return phaseRun, err
    }

    phaseRun.Outputs = result.Outputs
    phaseRun.Status = PhaseCompleted
    phaseRun.CompletedAt = time.Now()

    return phaseRun, nil
}
```

## Workflow Variables

Variables flow between phases:

```go
type VariableRef struct {
    Name string
    Type string  // string, int, bool, object, array
}

type WorkflowRun struct {
    ID         string
    WorkflowID string
    Status     RunStatus
    PhaseIndex int
    PhaseRuns  []*PhaseRun
    Variables  map[string]interface{}
    Error      error
    StartedAt  time.Time
    CompletedAt *time.Time
}

// Variables are passed between phases
// Phase N outputs become Phase N+1 inputs
```

## Retry Policy

```go
type RetryPolicy struct {
    MaxAttempts    int
    BackoffBase    time.Duration
    BackoffMultiplier float64
    RetryableErrors []string
}

func (p *RetryPolicy) ShouldRetry(err error, attempts int) bool {
    if attempts >= p.MaxAttempts {
        return false
    }

    for _, pattern := range p.RetryableErrors {
        if strings.Contains(err.Error(), pattern) {
            return true
        }
    }

    return false
}
```

## Workflow Templates

```go
var StandardWorkflows = []*Workflow{
    {
        Name: "CreateProject",
        Phases: []Phase{/* ... */},
    },
    {
        Name: "FixBug",
        Phases: []Phase{/* ... */},
    },
    {
        Name: "CodeReview",
        Phases: []Phase{/* ... */},
    },
    {
        Name: "Documentation",
        Phases: []Phase{/* ... */},
    },
    {
        Name: "Refactor",
        Phases: []Phase{/* ... */},
    },
    {
        Name: "TestCoverage",
        Phases: []Phase{/* ... */},
    },
}
```

## Directory Structure

```
internal/workflow/
    engine.go          # Workflow engine
    registry.go        # Workflow registry
    phase.go           # Phase definitions
    executor.go        # Phase executor
    template.go        # Standard templates
    variables.go       # Variable management
    retry.go           # Retry policy

workflows/
    create_project.yaml
    fix_bug.yaml
    code_review.yaml
    documentation.yaml
    refactor.yaml
    test_coverage.yaml
```
