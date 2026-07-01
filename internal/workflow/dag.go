package workflow

import (
	"sync"
)

type DAGStatus string

const (
	DAGPending   DAGStatus = "PENDING"
	DAGRunning   DAGStatus = "RUNNING"
	DAGCompleted DAGStatus = "COMPLETED"
	DAGFailed    DAGStatus = "FAILED"
)

type TaskNode struct {
	ID           string
	Name         string
	Role         string
	Goal         string
	Capabilities []string
	Dependencies []string
	Status       DAGStatus
}

type ExecutionDAG struct {
	mu           sync.RWMutex
	ID           string
	Nodes        map[string]*TaskNode
	Dependencies map[string][]string
	Status       DAGStatus
}

func NewExecutionDAG(id string) *ExecutionDAG {
	return &ExecutionDAG{
		ID:           id,
		Nodes:        make(map[string]*TaskNode),
		Dependencies: make(map[string][]string),
		Status:       DAGPending,
	}
}

func (d *ExecutionDAG) AddNode(node *TaskNode) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.Nodes[node.ID] = node
	for _, dep := range node.Dependencies {
		d.Dependencies[node.ID] = append(d.Dependencies[node.ID], dep)
	}
}

func (d *ExecutionDAG) GetReadyNodes() []*TaskNode {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var ready []*TaskNode
	for _, node := range d.Nodes {
		if node.Status != DAGPending {
			continue
		}

		allDepsDone := true
		for _, depID := range node.Dependencies {
			depNode, exists := d.Nodes[depID]
			if !exists || depNode.Status != DAGCompleted {
				allDepsDone = false
				break
			}
		}

		if allDepsDone {
			ready = append(ready, node)
		}
	}
	return ready
}

func (d *ExecutionDAG) UpdateNodeStatus(id string, status DAGStatus) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if node, ok := d.Nodes[id]; ok {
		node.Status = status
	}
}
