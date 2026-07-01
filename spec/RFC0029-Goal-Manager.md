# RFC-0029: Goal Manager

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000, RFC-0020

## Problem

Currently goals are static:

```go
type Session struct {
    Goal string
}
```

But goals evolve:

```
User: "Create Landing Page"
    │
    ▼
Agent: Analyzes, plans, executes
    │
    ▼
User: "Actually use Tailwind"
    │
    ▼
Agent: Updates design
    │
    ▼
User: "Add dark mode"
    │
    ▼
Agent: Adds dark mode
    │
    ▼
User: "Deploy it"
    │
    ▼
Agent: Deploys
```

Goals become trees, not strings.

## Solution

```
Goal (Tree)
  │
  ├── Create Landing Page
  │     │
  │     ├── Use Tailwind (modification)
  │     │
  │     ├── Add Dark Mode (sub-goal)
  │     │
  │     └── Deploy (sub-goal)
  │
  └── Create API (separate goal)
```

## Goal Schema

```go
type Goal struct {
    ID           string
    ParentID     *string           // nil for root goals
    RootID       string            // Top-level goal ID
    Title        string
    Description  string
    Status       GoalStatus
    Priority     Priority
    Constraints  []Constraint
    Acceptance   []AcceptanceCriterion
    Dependencies []string           // Goal IDs this depends on
    Metadata     map[string]interface{}
    CreatedAt    time.Time
    UpdatedAt    time.Time
    CompletedAt  *time.Time
}

type GoalStatus string

const (
    GoalActive    GoalStatus = "active"
    GoalPaused    GoalStatus = "paused"
    GoalCompleted GoalStatus = "completed"
    GoalCancelled GoalStatus = "cancelled"
    GoalFailed   GoalStatus = "failed"
)

type Priority int

const (
    PriorityLow    Priority = 1
    PriorityMedium Priority = 5
    PriorityHigh  Priority = 10
    PriorityCritical Priority = 100
)

type Constraint struct {
    Type      ConstraintType
    Key       string
    Value     interface{}
    Hard      bool  // Hard constraint vs soft preference
}

type ConstraintType string

const (
    ConstraintBudget    ConstraintType = "budget"
    ConstraintTime     ConstraintType = "time"
    ConstraintTech     ConstraintType = "technology"
    ConstraintStyle    ConstraintType = "style"
    ConstraintScope   ConstraintType = "scope"
)

type AcceptanceCriterion struct {
    ID          string
    Description string
    Status      CriterionStatus
    Evidence    []string  // Artifact IDs that prove this
}

type CriterionStatus string

const (
    CriterionPending  CriterionStatus = "pending"
    CriterionMet     CriterionStatus = "met"
    CriterionUnmet   CriterionStatus = "unmet"
    CriterionPartial CriterionStatus = "partial"
)
```

## Goal Relationships

```go
type GoalGraph struct {
    goals map[string]*Goal
    children map[string][]string  // parent -> children
    parents map[string]string      // child -> parent
    roots []string
}

func (g *GoalGraph) AddGoal(goal *Goal) error
func (g *GoalGraph) UpdateGoal(id string, updates *GoalUpdate) error
func (g *GoalGraph) AddSubGoal(parentID string, goal *Goal) error
func (g *GoalGraph) GetGoal(id string) (*Goal, error)
func (g *GoalGraph) GetChildren(parentID string) ([]*Goal, error)
func (g *GoalGraph) GetRoot(goalID string) (*Goal, error)
func (g *GoalGraph) GetGoalTree(rootID string) (*GoalTree, error)
func (g *GoalGraph) GetActiveGoals() ([]*Goal, error)
```

## Goal Tree

```go
type GoalTree struct {
    Root   *Goal
    Nodes  []*GoalNode
}

type GoalNode struct {
    Goal    *Goal
    Depth   int
    Path    string  // e.g., "1.2.3"
    Children []*GoalNode
}
```

## Goal Manager Interface

```go
type GoalManager interface {
    // CRUD
    Create(ctx context.Context, goal *Goal) error
    Get(ctx context.Context, id string) (*Goal, error)
    Update(ctx context.Context, id string, updates *GoalUpdate) error
    Delete(ctx context.Context, id string) error

    // Hierarchy
    AddSubGoal(ctx context.Context, parentID string, goal *Goal) (*Goal, error)
    GetTree(ctx context.Context, rootID string) (*GoalTree, error)
    GetLineage(ctx context.Context, goalID string) ([]*Goal, error)

    // Status
    Complete(ctx context.Context, id string) error
    Fail(ctx context.Context, id string, reason string) error
    Pause(ctx context.Context, id string) error
    Resume(ctx context.Context, id string) error

    // Queries
    GetActive(ctx context.Context) ([]*Goal, error)
    GetBySession(ctx context.Context, sessionID string) ([]*Goal, error)
    GetByParent(ctx context.Context, parentID string) ([]*Goal, error)

    // Evaluation
    CheckAcceptance(ctx context.Context, goalID string) (*AcceptanceResult, error)
}

type GoalUpdate struct {
    Title       *string
    Description *string
    Status      *GoalStatus
    Priority    *Priority
    Constraints *[]Constraint
}

type AcceptanceResult struct {
    GoalID      string
    AllMet      bool
    Criteria    []*CriterionResult
    EvidenceMet int
    TotalCriteria int
}

type CriterionResult struct {
    Criterion *AcceptanceCriterion
    Status    CriterionStatus
    Evidence  []*Evidence
}
```

## Goal Evolution

Goals can be modified during execution:

```go
// User says "Actually use Tailwind"
goalManager.Update(ctx, currentGoal.ID, &GoalUpdate{
    Constraints: []Constraint{
        {Type: ConstraintTech, Key: "css", Value: "tailwind", Hard: true},
    },
})

// Or add sub-goal
goalManager.AddSubGoal(ctx, currentGoal.ID, &Goal{
    Title: "Add dark mode",
    Description: "Implement dark mode for the landing page",
    Status: GoalActive,
    Priority: PriorityMedium,
    Constraints: []Constraint{
        {Type: ConstraintTech, Key: "css", Value: "tailwind", Hard: true},
    },
})
```

## Goal-to-Workflow Mapping

```go
func (g *GoalManager) CreateWorkflow(ctx context.Context, goalID string) (*Workflow, error) {
    goal, err := g.Get(ctx, goalID)
    if err != nil {
        return nil, err
    }

    // Map goal to appropriate workflow template
    template := selectTemplate(goal)

    wf := &Workflow{
        GoalID:      goalID,
        RootGoalID:  goal.RootID,
        TemplateID:  template.ID,
        Variables:   goalToVariables(goal),
    }

    return wf, nil
}

func selectTemplate(goal *Goal) *WorkflowTemplate {
    // Analyze constraints to select template
    for _, c := range goal.Constraints {
        if c.Type == ConstraintTech && c.Value == "tailwind" {
            return getTemplate("frontend_with_tailwind")
        }
    }

    // Check for deployment
    if strings.Contains(strings.ToLower(goal.Title), "deploy") {
        return getTemplate("deploy")
    }

    return getTemplate("general")
}
```

## Session-Goal Relationship

```go
type Session struct {
    ID       string
    Goals    []string  // Active goal IDs
    History  []*GoalHistory
}

type GoalHistory struct {
    GoalID      string
    Action      GoalAction
    Timestamp   time.Time
    Details     string
}

type GoalAction string

const (
    ActionGoalCreated   GoalAction = "created"
    ActionGoalModified   GoalAction = "modified"
    ActionGoalCompleted  GoalAction = "completed"
    ActionGoalFailed     GoalAction = "failed"
    ActionGoalPaused     GoalAction = "paused"
    ActionGoalResumed    GoalAction = "resumed"
)
```

## Goal Events

```go
const (
    EventGoalCreated   EventType = "goal_created"
    EventGoalUpdated   EventType = "goal_updated"
    EventGoalCompleted EventType = "goal_completed"
    EventGoalFailed    EventType = "goal_failed"
    EventGoalPaused    EventType = "goal_paused"
    EventGoalResumed   EventType = "goal_resumed"
    EventSubGoalAdded  EventType = "subgoal_added"
)
```

## Example: Landing Page Goal Tree

```json
{
  "id": "goal_001",
  "title": "Create Landing Page",
  "status": "active",
  "priority": "high",
  "constraints": [
    {"type": "technology", "key": "framework", "value": "next.js", "hard": true},
    {"type": "technology", "key": "css", "value": "tailwind", "hard": true},
    {"type": "budget", "key": "max_cost", "value": 5.0, "hard": false}
  ],
  "acceptance": [
    {"id": "acc_1", "description": "Hero section with product name", "status": "pending"},
    {"id": "acc_2", "description": "Features section with 3+ features", "status": "pending"},
    {"id": "acc_3", "description": "Contact form", "status": "pending"},
    {"id": "acc_4", "description": "Responsive on mobile", "status": "pending"}
  ],
  "children": [
    {
      "id": "goal_002",
      "title": "Add Dark Mode",
      "parent_id": "goal_001",
      "status": "pending",
      "dependencies": ["goal_001"]
    },
    {
      "id": "goal_003",
      "title": "Deploy to Vercel",
      "parent_id": "goal_001",
      "status": "pending",
      "dependencies": ["goal_001", "goal_002"]
    }
  ]
}
```

## Directory Structure

```
internal/goals/
    manager.go       # Goal manager
    graph.go         # Goal relationships
    tree.go          # Goal tree operations
    evaluation.go    # Acceptance evaluation
    events.go        # Goal events
```
