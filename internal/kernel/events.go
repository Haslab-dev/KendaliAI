package kernel

import (
	"context"
	"sync"
	"time"
)

type Event struct {
	ID        string      `json:"id"`
	Type      string      `json:"type"`
	Source    string      `json:"source"`
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
}

type EventBus struct {
	mu          sync.RWMutex
	subscribers map[string]chan *Event
}

func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[string]chan *Event),
	}
}

func (eb *EventBus) Subscribe(subID string) chan *Event {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	ch := make(chan *Event, 100)
	eb.subscribers[subID] = ch
	return ch
}

func (eb *EventBus) Unsubscribe(subID string) {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	if ch, ok := eb.subscribers[subID]; ok {
		close(ch)
		delete(eb.subscribers, subID)
	}
}

func (eb *EventBus) Publish(ctx context.Context, ev *Event) {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	for _, ch := range eb.subscribers {
		select {
		case ch <- ev:
		case <-ctx.Done():
			return
		default:
			// Non-blocking write to avoid slow subscriber bottlenecks
		}
	}
}
