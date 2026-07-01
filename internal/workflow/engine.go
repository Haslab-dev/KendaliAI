package workflow

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/kernel"
	"github.com/kendaliai/app/internal/runtime"
)

type WorkflowEngine struct {
	Kernel     kernel.Kernel
	Supervisor *runtime.Supervisor
	mu         sync.Mutex
	dags       map[string]*ExecutionDAG
}

func NewWorkflowEngine(k kernel.Kernel, s *runtime.Supervisor) *WorkflowEngine {
	return &WorkflowEngine{
		Kernel:     k,
		Supervisor: s,
		dags:       make(map[string]*ExecutionDAG),
	}
}

func (we *WorkflowEngine) Start(ctx context.Context, workflowType, sessionID string) (*ExecutionDAG, error) {
	we.mu.Lock()
	defer we.mu.Unlock()

	dagID := "wf-" + uuid.New().String()[:8]
	dag := NewExecutionDAG(dagID)
	we.dags[dagID] = dag

	switch workflowType {
	case "simple_coding":
		node1 := &TaskNode{
			ID:           "t-coding-" + uuid.New().String()[:4],
			Name:         "Coding Phase",
			Role:         "coder",
			Goal:         "Create hello.go in the current directory containing package main and a main function.",
			Capabilities: []string{"read_files", "write_files", "list_files"},
			Status:       DAGPending,
		}
		node2 := &TaskNode{
			ID:           "t-review-" + uuid.New().String()[:4],
			Name:         "Review Phase",
			Role:         "reviewer",
			Goal:         "Verify that hello.go is syntactically valid and secure.",
			Capabilities: []string{"read_files"},
			Dependencies: []string{node1.ID},
			Status:       DAGPending,
		}
		dag.AddNode(node1)
		dag.AddNode(node2)
	default:
		return nil, fmt.Errorf("unknown workflow template: %s", workflowType)
	}

	dag.Status = DAGRunning

	go we.runWorkflowLoop(ctx, dag)

	return dag, nil
}

func (we *WorkflowEngine) runWorkflowLoop(ctx context.Context, dag *ExecutionDAG) {
	for {
		ready := dag.GetReadyNodes()
		if len(ready) == 0 {
			allDone := true
			anyFailed := false
			dag.mu.RLock()
			for _, n := range dag.Nodes {
				if n.Status != DAGCompleted {
					allDone = false
				}
				if n.Status == DAGFailed {
					anyFailed = true
				}
			}
			dag.mu.RUnlock()

			if allDone {
				dag.Status = DAGCompleted
				we.Kernel.PublishEvent(ctx, &kernel.Event{
					ID:        uuid.New().String(),
					Type:      "workflow_completed",
					Source:    dag.ID,
					Timestamp: time.Now(),
				})
				return
			}
			if anyFailed {
				dag.Status = DAGFailed
				we.Kernel.PublishEvent(ctx, &kernel.Event{
					ID:        uuid.New().String(),
					Type:      "workflow_failed",
					Source:    dag.ID,
					Timestamp: time.Now(),
				})
				return
			}

			time.Sleep(100 * time.Millisecond)
			continue
		}

		var wg sync.WaitGroup
		for _, node := range ready {
			wg.Add(1)
			go func(n *TaskNode) {
				defer wg.Done()
				dag.UpdateNodeStatus(n.ID, DAGRunning)

				spec := kernel.ProcessSpec{
					ID:           n.ID,
					Role:         kernel.ProcessRole(n.Role),
					Goal:         n.Goal,
					Capabilities: n.Capabilities,
				}

				proc, err := we.Supervisor.Spawn(ctx, spec)
				if err != nil {
					log.Printf("Workflow %s failed to spawn agent: %v", dag.ID, err)
					dag.UpdateNodeStatus(n.ID, DAGFailed)
					return
				}

				_, err = we.Kernel.Wait(ctx, proc.ID)
				if err != nil {
					dag.UpdateNodeStatus(n.ID, DAGFailed)
				} else {
					dag.UpdateNodeStatus(n.ID, DAGCompleted)
				}
			}(node)
		}
		wg.Wait()
	}
}
