# RFC-0022: Dynamic DAG

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000

## Problem

Current DAG is static:
```
Task A
  │
  ▼
Task B
  │
  ▼
Task C
```

Real agents don't work this way. They continuously re-plan:
```
Task A
  │
  ▼ (new discovery)
  │
Planner (re-plan)
  │
  ▼
Insert Task D
  │
  ▼
Continue
```

## Solution

Need a mutable DAG with operations:
- Insert task
- Delete task
- Split task
- Merge tasks
- Replan subtree

## Dynamic DAG Interface

```go
type DynamicDAG interface {
    // Core operations
    AddTask(task *DAGTask) error
    RemoveTask(taskID string) error
    UpdateTask(task *DAGTask) error
    GetTask(taskID string) (*DAGTask, error)

    // Dependency operations
    AddEdge(from, to string) error
    RemoveEdge(from, to string) error

    // Structural operations
    InsertTask(afterTaskID string, task *DAGTask) error
    SplitTask(taskID string, newTasks []*DAGTask) error
    MergeTasks(taskIDs []string, mergedTask *DAGTask) error
    ReplanSubtree(rootTaskID string, newTasks []*DAGTask) error

    // Queries
    GetReadyTasks() []*DAGTask
    GetTaskDependencies(taskID string) []*DAGTask
    GetTaskDependents(taskID string) []*DAGTask
    TopologicalSort() []*DAGTask

    // State
    GetStatus() DAGStatus
    Validate() error
}
```

## DAG Task (Extended)

```go
type DAGTask struct {
    ID            string
    Name          string
    Tool          string
    Params        *TaskParams
    Status        TaskStatus
    DependsOn     []string
    Dependents    []string
    Priority      int
    Attempts      int
    MaxAttempts   int
    CreatedAt     time.Time
    StartedAt     *time.Time
    CompletedAt   *time.Time
    Output        interface{}
    Error         *TaskError
    Metadata      map[string]interface{}

    // For dynamic operations
    Splittable    bool
    Mergeable     bool
    Replanable    bool
}
```

## Insert Task

Insert a new task after an existing task:

```go
func (d *MutableDAG) InsertTask(afterTaskID string, task *DAGTask) error {
    // Validate
    if err := d.validateTask(task); err != nil {
        return err
    }

    // Get existing task
    existing, err := d.GetTask(afterTaskID)
    if err != nil {
        return err
    }

    // Find tasks that depend on afterTaskID
    dependents := d.GetTaskDependents(afterTaskID)

    // Remove edges: existing -> dependents
    for _, dep := range dependents {
        d.removeEdgeInternal(afterTaskID, dep.ID)
    }

    // Add: existing -> new task
    d.addEdgeInternal(afterTaskID, task.ID)

    // Add: new task -> dependents
    for _, dep := range dependents {
        d.addEdgeInternal(task.ID, dep.ID)
    }

    // Add new task
    task.DependsOn = []string{afterTaskID}
    d.tasks[task.ID] = task

    d.publishEvent(EventTaskInserted, task)

    return nil
}
```

## Split Task

Split a complex task into multiple simpler tasks:

```go
func (d *MutableDAG) SplitTask(taskID string, newTasks []*DAGTask) error {
    task, err := d.GetTask(taskID)
    if err != nil {
        return err
    }

    if !task.Splittable {
        return fmt.Errorf("task %s is not splittable", taskID)
    }

    // Get dependents
    dependents := d.GetTaskDependents(taskID)

    // Remove all edges from original task
    for _, dep := range dependents {
        d.removeEdgeInternal(taskID, dep.ID)
    }

    // Insert chain of new tasks
    prevID := taskID
    for i, newTask := range newTasks {
        if i == 0 {
            // First new task depends on original's dependencies
            newTask.DependsOn = task.DependsOn
        } else {
            // Depends on previous
            newTask.DependsOn = []string{prevID}
        }

        d.tasks[newTask.ID] = newTask
        d.addEdgeInternal(prevID, newTask.ID)

        prevID = newTask.ID
    }

    // Last new task depends on original dependents
    for _, dep := range dependents {
        d.addEdgeInternal(prevID, dep.ID)
    }

    // Remove original task
    delete(d.tasks, taskID)

    d.publishEvent(EventTaskSplit, map[string]interface{}{
        "original": taskID,
        "new_tasks": newTasks,
    })

    return nil
}
```

## Merge Tasks

Merge multiple tasks into one:

```go
func (d *MutableDAG) MergeTasks(taskIDs []string, mergedTask *DAGTask) error {
    // Validate all tasks are mergeable
    for _, id := range taskIDs {
        task, err := d.GetTask(id)
        if err != nil {
            return err
        }
        if !task.Mergeable {
            return fmt.Errorf("task %s is not mergeable", id)
        }
    }

    // Collect all dependencies
    var allDeps []string
    for _, id := range taskIDs {
        task, _ := d.GetTask(id)
        allDeps = append(allDeps, task.DependsOn...)
    }

    // Deduplicate
    allDeps = unique(allDeps)

    // Get all dependents
    var allDependents []string
    for _, id := range taskIDs {
        deps := d.GetTaskDependents(id)
        for _, dep := range deps {
            if !contains(taskIDs, dep.ID) {
                allDependents = append(allDependents, dep.ID)
            }
        }
    }

    // Remove all old tasks
    for _, id := range taskIDs {
        delete(d.tasks, id)
        d.removeAllEdgesFor(id)
    }

    // Create merged task
    mergedTask.ID = fmt.Sprintf("merged_%s", uuid.New().String()[:8])
    mergedTask.DependsOn = allDeps
    d.tasks[mergedTask.ID] = mergedTask

    // Add edges from all deps to merged
    for _, dep := range allDeps {
        d.addEdgeInternal(dep, mergedTask.ID)
    }

    // Add edges from merged to all dependents
    for _, dep := range allDependents {
        d.addEdgeInternal(mergedTask.ID, dep)
    }

    d.publishEvent(EventTasksMerged, map[string]interface{}{
        "merged":    taskIDs,
        "new_task":  mergedTask,
    })

    return nil
}
```

## Replan Subtree

Replace a subtree with a new plan:

```go
func (d *MutableDAG) ReplanSubtree(rootTaskID string, newTasks []*DAGTask) error {
    root, err := d.GetTask(rootTaskID)
    if err != nil {
        return err
    }

    if !root.Replanable {
        return fmt.Errorf("task %s is not replanable", rootTaskID)
    }

    // Get dependents of root (tasks that wait for root's children outputs)
    dependents := d.GetTaskDependents(rootTaskID)

    // Get original dependencies
    originalDeps := root.DependsOn

    // Remove root and all its descendants
    toRemove := d.getDescendants(rootTaskID)
    toRemove = append(toRemove, rootTaskID)
    for _, id := range toRemove {
        delete(d.tasks, id)
        d.removeAllEdgesFor(id)
    }

    // Insert new tasks connecting original deps to original dependents
    if len(newTasks) == 0 {
        // No tasks - skip directly
        for _, origDep := range originalDeps {
            for _, dep := range dependents {
                d.addEdgeInternal(origDep, dep)
            }
        }
    } else {
        // Connect first task to original deps
        newTasks[0].DependsOn = originalDeps

        // Connect last task to dependents
        newTasks[len(newTasks)-1].Dependents = dependents

        // Build chain
        prevID := ""
        for i, task := range newTasks {
            d.tasks[task.ID] = task

            if prevID != "" {
                d.addEdgeInternal(prevID, task.ID)
            }

            // Connect dependencies
            if i == 0 {
                for _, dep := range originalDeps {
                    d.addEdgeInternal(dep, task.ID)
                }
            }

            prevID = task.ID
        }

        // Connect last task to dependents
        for _, dep := range dependents {
            d.addEdgeInternal(prevID, dep)
        }
    }

    d.publishEvent(EventSubtreeReplanned, map[string]interface{}{
        "root":      rootTaskID,
        "new_tasks": newTasks,
    })

    return nil
}
```

## DAG Visualization

```go
func (d *MutableDAG) Visualize() string {
    var sb strings.Builder
    sb.WriteString("digraph DAG {\n")

    for _, task := range d.tasks {
        color := d.getStatusColor(task.Status)
        sb.WriteString(fmt.Sprintf("  %s [label=\"%s\\n(%s)\" color=\"%s\"]\n",
            task.ID, task.Name, task.Status, color))
    }

    for _, task := range d.tasks {
        for _, depID := range task.DependsOn {
            sb.WriteString(fmt.Sprintf("  %s -> %s\n", depID, task.ID))
        }
    }

    sb.WriteString("}\n")
    return sb.String()
}
```

## Event Publishing

```go
const (
    EventTaskInserted   DAGEventType = "task_inserted"
    EventTaskRemoved    DAGEventType = "task_removed"
    EventTaskSplit      DAGEventType = "task_split"
    EventTasksMerged    DAGEventType = "tasks_merged"
    EventSubtreeReplanned DAGEventType = "subtree_replanned"
    EventEdgeAdded      DAGEventType = "edge_added"
    EventEdgeRemoved    DAGEventType = "edge_removed"
    EventDAGValidated   DAGEventType = "dag_validated"
)

func (d *MutableDAG) publishEvent(eventType DAGEventType, data interface{}) {
    if d.eventHandler != nil {
        d.eventHandler(&DAGEvent{
            Type:      eventType,
            DAGID:     d.id,
            Timestamp: time.Now(),
            Data:      data,
        })
    }
}
```

## Directory Structure

```
internal/dag/
    dag.go              # Core DAG interface
    mutable.go          # Mutable implementation
    task.go             # Task definitions
    edge.go             # Edge operations
    validate.go         # Validation
    visualize.go        # DOT visualization
    events.go           # Event publishing
```
