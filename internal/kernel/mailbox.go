package kernel

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type MessageType string

const (
	MsgSpawn     MessageType = "spawn"
	MsgResult    MessageType = "result"
	MsgError     MessageType = "error"
	MsgStatus    MessageType = "status"
	MsgInterrupt MessageType = "interrupt"
	MsgResume    MessageType = "resume"
	MsgCancel    MessageType = "cancel"
	MsgHeartbeat MessageType = "heartbeat"
	MsgLog       MessageType = "log"
	MsgArtifact  MessageType = "artifact"
)

type Message struct {
	ID        string      `json:"id"`
	From      string      `json:"from"` // PID
	To        string      `json:"to"`   // PID
	Type      MessageType `json:"type"`
	Payload   interface{} `json:"payload"`
	Timestamp time.Time   `json:"timestamp"`
}

type Mailbox struct {
	mu        sync.RWMutex
	queues    map[string]chan *Message
	queueSize int
}

func NewMailbox(queueSize int) *Mailbox {
	return &Mailbox{
		queues:    make(map[string]chan *Message),
		queueSize: queueSize,
	}
}

func (m *Mailbox) Register(pid string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.queues[pid]; !exists {
		m.queues[pid] = make(chan *Message, m.queueSize)
	}
}

func (m *Mailbox) Unregister(pid string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if q, exists := m.queues[pid]; exists {
		close(q)
		delete(m.queues, pid)
	}
}

func (m *Mailbox) Send(ctx context.Context, msg *Message) error {
	m.mu.RLock()
	q, ok := m.queues[msg.To]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("mailbox for PID %s not registered", msg.To)
	}

	select {
	case q <- msg:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(5 * time.Second):
		return fmt.Errorf("message delivery timeout to PID %s", msg.To)
	}
}

func (m *Mailbox) Receive(ctx context.Context, pid string) (*Message, error) {
	m.mu.RLock()
	q, ok := m.queues[pid]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("mailbox for PID %s not registered", pid)
	}

	select {
	case msg, open := <-q:
		if !open {
			return nil, fmt.Errorf("mailbox for PID %s closed", pid)
		}
		return msg, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
