package kernel

import (
	"sync"
)

type ObservationType string

const (
	ObsBuildFailed   ObservationType = "BUILD_FAILED"
	ObsBuildSuccess  ObservationType = "BUILD_SUCCESS"
	ObsMemoryUpdated ObservationType = "MEMORY_UPDATED"
)

type ObservationEvent struct {
	Type      ObservationType
	SessionID string
	Source    string
	Payload   map[string]interface{}
}

type ObservationBus struct {
	mu        sync.RWMutex
	listeners []chan ObservationEvent
}

func NewObservationBus() *ObservationBus {
	return &ObservationBus{}
}

func (ob *ObservationBus) Subscribe() chan ObservationEvent {
	ob.mu.Lock()
	defer ob.mu.Unlock()
	ch := make(chan ObservationEvent, 10)
	ob.listeners = append(ob.listeners, ch)
	return ch
}

func (ob *ObservationBus) Publish(event ObservationEvent) {
	ob.mu.RLock()
	defer ob.mu.RUnlock()

	for _, ch := range ob.listeners {
		select {
		case ch <- event:
		default:
		}
	}
}
