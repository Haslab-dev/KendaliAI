package kernel

import (
	"sync"
)

type SemanticEventType string

const (
	EvTaskStarted       SemanticEventType = "TaskStarted"
	EvTaskCompleted     SemanticEventType = "TaskCompleted"
	EvGoalUpdated       SemanticEventType = "GoalUpdated"
	EvCheckpointCreated SemanticEventType = "CheckpointCreated"
)

type RuntimeEvent struct {
	Type      SemanticEventType
	SessionID string
	Payload   map[string]interface{}
}

type RuntimeBus struct {
	mu        sync.RWMutex
	listeners []chan RuntimeEvent
}

func NewRuntimeBus() *RuntimeBus {
	return &RuntimeBus{}
}

func (rb *RuntimeBus) Subscribe() chan RuntimeEvent {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	ch := make(chan RuntimeEvent, 20)
	rb.listeners = append(rb.listeners, ch)
	return ch
}

func (rb *RuntimeBus) Publish(event RuntimeEvent) {
	rb.mu.RLock()
	defer rb.mu.RUnlock()

	for _, ch := range rb.listeners {
		select {
		case ch <- event:
		default:
		}
	}
}
