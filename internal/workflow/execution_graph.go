package workflow

import (
	"context"
	"fmt"
	"sync"
)

type GraphNodeStatus string

const (
	NodePending   GraphNodeStatus = "PENDING"
	NodeRunning   GraphNodeStatus = "RUNNING"
	NodeCompleted GraphNodeStatus = "COMPLETED"
	NodeFailed    GraphNodeStatus = "FAILED"
	NodePaused    GraphNodeStatus = "PAUSED"
)

type ExecutionNode struct {
	ID       string
	Status   GraphNodeStatus
	Requires []string
	Execute  func(ctx context.Context) error
}

type ExecutionGraph struct {
	mu    sync.RWMutex
	nodes map[string]*ExecutionNode
}

func NewExecutionGraph() *ExecutionGraph {
	return &ExecutionGraph{
		nodes: make(map[string]*ExecutionNode),
	}
}

func (eg *ExecutionGraph) AddNode(node *ExecutionNode) {
	eg.mu.Lock()
	defer eg.mu.Unlock()
	node.Status = NodePending
	eg.nodes[node.ID] = node
}

func (eg *ExecutionGraph) GetNode(id string) (*ExecutionNode, bool) {
	eg.mu.RLock()
	defer eg.mu.RUnlock()
	n, ok := eg.nodes[id]
	return n, ok
}

func (eg *ExecutionGraph) Execute(ctx context.Context) error {
	for {
		eg.mu.Lock()
		var readyNodes []*ExecutionNode
		for _, n := range eg.nodes {
			if n.Status == NodePending {
				ready := true
				for _, reqID := range n.Requires {
					reqNode, exists := eg.nodes[reqID]
					if !exists || reqNode.Status != NodeCompleted {
						ready = false
						break
					}
				}
				if ready {
					readyNodes = append(readyNodes, n)
				}
			}
		}
		eg.mu.Unlock()

		if len(readyNodes) == 0 {
			eg.mu.RLock()
			hasFailed := false
			hasPending := false
			for _, n := range eg.nodes {
				if n.Status == NodeFailed {
					hasFailed = true
				}
				if n.Status == NodePending || n.Status == NodeRunning {
					hasPending = true
				}
			}
			eg.mu.RUnlock()

			if hasFailed {
				return fmt.Errorf("execution graph execution failed")
			}
			if !hasPending {
				break
			}
			break
		}

		for _, n := range readyNodes {
			eg.mu.Lock()
			n.Status = NodeRunning
			eg.mu.Unlock()

			err := n.Execute(ctx)

			eg.mu.Lock()
			if err != nil {
				n.Status = NodeFailed
			} else {
				n.Status = NodeCompleted
			}
			eg.mu.Unlock()
		}
	}

	return nil
}
