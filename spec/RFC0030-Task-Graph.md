# RFC-0030: Task Graph

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0020, RFC-0022

## Problem

Today:
```
Workflow owns DAG
```

But as workflows get complex, the DAG becomes tied to workflow implementation. This makes it hard to:
- Reuse task graphs across workflows
- Share task patterns between different use cases
- Build complex graphs programmatically

## Solution

```
Workflow
    │
    ▼
Task Graph (separate, reusable)
    │
    ▼
Task State (execution state)
    │
    ▼
Executor
```

## Task Graph Schema

```go
type TaskGraph struct {
    ID       string
    Name     string
    Version  string
    Nodes    []*TaskNode
    Edges    []*TaskEdge
    Metadata map[string]interface{}
}

type TaskNode struct {
    ID          string
    Name        string
    TaskDefID   string       // Reference to task definition
    Config      *TaskConfig  // Node-specific configuration
    Position    *Position   // For visualization
}

type TaskEdge struct {
    ID       string
    Source   string        // Source node ID
    Target   string        // Target node ID
    Type     EdgeType
    Condition *EdgeCondition
}

type EdgeType string

const (
    EdgeSequence EdgeType = "sequence"   // Normal flow
    EdgeParallel EdgeType = "parallel"   // Parallel execution
    EdgeConditional EdgeType = "conditional" // If condition
    EdgeFeedback EdgeType = "feedback"    // Loop back
)

type EdgeCondition struct {
    Type    ConditionType
    Expression string
}
```

## Task Definition Registry

```go
type TaskDefRegistry struct {
    defs map[string]*TaskDefinition
}

type TaskDefinition struct {
    ID          string
    Name        string
    Description string
    Category    TaskCategory
    Capability  Capability
    InputSchema *jsonschema.Schema
    OutputSchema *jsonschema.Schema
    ConfigSchema *jsonschema.Schema
    DefaultConfig map[string]interface{}
    RetryPolicy  *RetryPolicy
    Timeout      time.Duration
}

type TaskCategory string

const (
    CategoryInput    TaskCategory = "input"
    CategoryProcess  TaskCategory = "process"
    CategoryOutput   TaskCategory = "output"
    CategoryControl  TaskCategory = "control"
    CategoryUtility  TaskCategory = "utility"
)
```

## Example Task Definitions

```yaml
# Read File Task
id: task-read-file
name: Read File
category: input
capability: read_files

input_schema:
  type: object
  required: [path]
  properties:
    path:
      type: string
    offset:
      type: integer
    limit:
      type: integer

output_schema:
  type: object
  properties:
    content:
      type: string
    lines:
      type: integer

default_config:
  encoding: utf-8

retry:
  max_attempts: 3
  backoff: 1s

timeout: 30s

---

# Build Task
id: task-build
name: Build Project
category: process
capability: build

input_schema:
  type: object
  properties:
    command:
      type: string
    cwd:
      type: string

output_schema:
  type: object
  properties:
    success:
      type: boolean
    stdout:
      type: string
    stderr:
      type: string
    exit_code:
      type: integer

timeout: 5m

---

# Decision Task
id: task-decision
name: Conditional Decision
category: control

input_schema:
  type: object
  properties:
    condition:
      type: string
    true_branch:
      type: array
      items:
        type: string  # Node IDs
    false_branch:
      type: array
      items:
        type: string  # Node IDs

# No output - controls flow directly
```

## Task Graph Builder

```go
type TaskGraphBuilder struct {
    registry *TaskDefRegistry
    graph    *TaskGraph
}

func NewBuilder(registry *TaskDefRegistry) *TaskGraphBuilder {
    return &TaskGraphBuilder{
        registry: registry,
        graph: &TaskGraph{
            ID:    uuid.New().String(),
            Nodes: make([]*TaskNode, 0),
            Edges: make([]*TaskEdge, 0),
        },
    }
}

func (b *TaskGraphBuilder) AddNode(id, taskDefID string, config map[string]interface{}) *TaskGraphBuilder {
    def := b.registry.Get(taskDefID)

    // Deep copy and merge config
    nodeConfig := mergeConfig(def.DefaultConfig, config)

    b.graph.Nodes = append(b.graph.Nodes, &TaskNode{
        ID:        id,
        Name:      def.Name,
        TaskDefID: taskDefID,
        Config: &TaskConfig{
            Values: nodeConfig,
        },
    })

    return b
}

func (b *TaskGraphBuilder) Then(fromID, toID string) *TaskGraphBuilder {
    b.graph.Edges = append(b.graph.Edges, &TaskEdge{
        ID:     uuid.New().String(),
        Source: fromID,
        Target: toID,
        Type:   EdgeSequence,
    })
    return b
}

func (b *TaskGraphBuilder) Parallel(nodeIDs []string, afterID string) *TaskGraphBuilder {
    // Create parallel execution node
    for _, nodeID := range nodeIDs {
        b.graph.Edges = append(b.graph.Edges, &TaskEdge{
            ID:     uuid.New().String(),
            Source: afterID,
            Target: nodeID,
            Type:   EdgeParallel,
        })
    }
    return b
}

func (b *TaskGraphBuilder) If(condition string, trueNodes, falseNodes []string) *TaskGraphBuilder {
    // Add conditional edges
    for _, nodeID := range trueNodes {
        b.graph.Edges = append(b.graph.Edges, &TaskEdge{
            ID:       uuid.New().String(),
            Source:   "decision_node", // Would be the node that creates this
            Target:   nodeID,
            Type:     EdgeConditional,
            Condition: &EdgeCondition{
                Type:      ConditionExpression,
                Expression: condition,
            },
        })
    }
    return b
}

func (b *TaskGraphBuilder) Build() (*TaskGraph, error) {
    // Validate graph
    if err := b.validate(); err != nil {
        return nil, err
    }

    return b.graph, nil
}
```

## Task State (Separate from Graph)

```go
type TaskState struct {
    GraphID   string
    NodeID    string
    Status    TaskStatus
    Attempts  int
    StartedAt *time.Time
    CompletedAt *time.Time
    Input     interface{}
    Output    interface{}
    Error     *TaskError
    Metadata  map[string]interface{}
}

type ExecutionState struct {
    GraphID     string
    NodeStates  map[string]*TaskState
    CurrentNode string
    History     []*StateTransition
}

func (s *ExecutionState) GetNodeState(nodeID string) *TaskState {
    return s.NodeStates[nodeID]
}

func (s *ExecutionState) IsNodeComplete(nodeID string) bool {
    state := s.NodeStates[nodeID]
    return state != nil && state.Status == TaskStatusCompleted
}

func (s *ExecutionState) GetNextReadyNodes() []*TaskNode {
    var ready []*TaskNode
    for _, node := range s.Graph.Nodes {
        if s.isReady(node) {
            ready = append(ready, node)
        }
    }
    return ready
}
```

## Workflow-TaskGraph Separation

```go
type Workflow struct {
    ID          string
    TemplateID  string
    GraphID     string  // References shared TaskGraph
    Variables   map[string]interface{}
}

type TaskGraph struct {
    // Shared definition
    ID       string
    Name     string
    Version  string
    Nodes    []*TaskNode
    Edges    []*TaskEdge
}

// Multiple workflows can share the same task graph
workflowA := &Workflow{
    GraphID: "landing-page-graph",
    // ...
}

workflowB := &Workflow{
    GraphID: "landing-page-graph",  // Same graph!
    // ...
}
```

## Graph Templates

```go
// Pre-defined graph patterns
var GraphTemplates = map[string]*TaskGraphTemplate{
    "linear": {
        Name: "Linear Process",
        Builder: func(steps []string) *TaskGraph {
            // A -> B -> C -> D
        },
    },

    "parallel-fan-in": {
        Name: "Parallel Fan-In",
        Builder: func(main string, parallels []string) *TaskGraph {
            //      -> B
            // A -> C -> D
            //      -> E
        },
    },

    "diamond": {
        Name: "Diamond",
        Builder: func(start, end string, branches int) *TaskGraph {
            //    -> C ->
            // A -> D -> E -> F
            //    -> E ->
        },
    },

    "feedback": {
        Name: "Feedback Loop",
        Builder: func(process, check string) *TaskGraph {
            // Process -> Check -> |
            //              ↓       |
            //           (retry) --+
        },
    },
}
```

## Directory Structure

```
internal/taskgraph/
    graph.go          # Task graph definition
    builder.go        # Graph builder
    registry.go       # Task definition registry
    state.go          # Execution state
    templates.go      # Pre-built graph templates
    validator.go      # Graph validation
```
