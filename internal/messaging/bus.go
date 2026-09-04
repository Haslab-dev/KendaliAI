package messaging

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

type Subscription struct {
	ID        string
	SessionID string // empty or "*" for all sessions
	Ch        chan Event
}

type EventBus struct {
	mu          sync.RWMutex
	subscribers map[string]*Subscription
	history     []Event
	maxHistory  int
}

var DefaultBus = NewEventBus()

func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[string]*Subscription),
		history:     make([]Event, 0, 500),
		maxHistory:  500,
	}
}

func (b *EventBus) Subscribe(sessionID string) *Subscription {
	b.mu.Lock()
	defer b.mu.Unlock()

	id := uuid.New().String()
	sub := &Subscription{
		ID:        id,
		SessionID: sessionID,
		Ch:        make(chan Event, 512),
	}
	b.subscribers[id] = sub
	return sub
}

func (b *EventBus) Unsubscribe(id string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if sub, exists := b.subscribers[id]; exists {
		delete(b.subscribers, id)
		close(sub.Ch)
	}
}

func (b *EventBus) GetHistory(limit int) []Event {
	b.mu.RLock()
	defer b.mu.RUnlock()

	total := len(b.history)
	if limit <= 0 || limit > total {
		limit = total
	}
	start := total - limit
	res := make([]Event, limit)
	copy(res, b.history[start:])
	return res
}

func (b *EventBus) Publish(ev Event) {
	if ev.ID == "" {
		ev.ID = uuid.New().String()
	}
	if ev.Timestamp.IsZero() {
		ev.Timestamp = time.Now()
	}

	b.mu.Lock()
	// Store structured events in history (filtering high-speed deltas to keep log history clean and useful)
	if ev.Type != EventAgentTextDelta && ev.Type != EventAgentThinkingDelta {
		b.history = append(b.history, ev)
		if len(b.history) > b.maxHistory {
			b.history = b.history[len(b.history)-b.maxHistory:]
		}
	}
	b.mu.Unlock()

	b.mu.RLock()
	defer b.mu.RUnlock()

	for _, sub := range b.subscribers {
		if sub.SessionID == "" || sub.SessionID == "*" || sub.SessionID == ev.SessionID {
			select {
			case sub.Ch <- ev:
			default:
				// non-blocking if subscriber channel buffer is full
			}
		}
	}
}
