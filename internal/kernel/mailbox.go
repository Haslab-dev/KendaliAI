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

type Envelope struct {
	ID            string      `json:"id"`
	CorrelationID string      `json:"correlationId"`
	ParentProcess string      `json:"parentProcess,omitempty"`
	TargetProcess string      `json:"targetProcess"`
	ReplyTo       string      `json:"replyTo,omitempty"`
	Type          MessageType `json:"type"`
	Payload       interface{} `json:"payload"`
	Timestamp     time.Time   `json:"timestamp"`
}

type Mailbox struct {
	mu        sync.RWMutex
	queues    map[string]chan *Envelope
	queueSize int
}

func NewMailbox(queueSize int) *Mailbox {
	return &Mailbox{
		queues:    make(map[string]chan *Envelope),
		queueSize: queueSize,
	}
}

func (m *Mailbox) Register(pid string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.queues[pid]; !exists {
		m.queues[pid] = make(chan *Envelope, m.queueSize)
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

func (m *Mailbox) Send(ctx context.Context, env *Envelope) error {
	m.mu.RLock()
	q, ok := m.queues[env.TargetProcess]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("mailbox for PID %s not registered", env.TargetProcess)
	}

	select {
	case q <- env:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(5 * time.Second):
		return fmt.Errorf("envelope delivery timeout to PID %s", env.TargetProcess)
	}
}

func (m *Mailbox) Receive(ctx context.Context, pid string) (*Envelope, error) {
	m.mu.RLock()
	q, ok := m.queues[pid]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("mailbox for PID %s not registered", pid)
	}

	select {
	case env, open := <-q:
		if !open {
			return nil, fmt.Errorf("mailbox for PID %s closed", pid)
		}
		return env, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
