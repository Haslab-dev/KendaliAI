package capability

import (
	"context"
	"fmt"
	"sync"
)

type CapabilityRequest struct {
	Capability string                 `json:"capability"`
	Args       map[string]interface{} `json:"args,omitempty"`
	PID        string                 `json:"pid"`
}

type CapabilityBroker struct {
	mu         sync.RWMutex
	approvals  map[string]bool
	restricted map[string]bool
}

func NewCapabilityBroker() *CapabilityBroker {
	broker := &CapabilityBroker{
		approvals:  make(map[string]bool),
		restricted: make(map[string]bool),
	}
	broker.restricted["exec"] = true
	broker.restricted["write_files"] = true
	return broker
}

func (cb *CapabilityBroker) RequestApproval(ctx context.Context, taskID string, req CapabilityRequest) (bool, error) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if !cb.restricted[req.Capability] {
		return true, nil
	}

	approved, exists := cb.approvals[taskID]
	if exists {
		return approved, nil
	}

	cb.approvals[taskID] = false
	return false, fmt.Errorf("pending approval for task %s (capability: %s)", taskID, req.Capability)
}

func (cb *CapabilityBroker) GrantApproval(taskID string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.approvals[taskID] = true
}
