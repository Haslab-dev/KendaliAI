package kernel

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

type KernelStatus string

const (
	KernelStarting KernelStatus = "STARTING"
	KernelRunning  KernelStatus = "RUNNING"
	KernelPaused   KernelStatus = "PAUSED"
	KernelStopping KernelStatus = "STOPPING"
	KernelStopped  KernelStatus = "STOPPED"
)

type Kernel interface {
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
	Status() KernelStatus

	// Component Registry
	RegisterComponent(name string, component interface{}) error
	GetComponent(name string) (interface{}, bool)

	// Process Management
	Spawn(ctx context.Context, spec ProcessSpec) (*Process, error)
	Wait(ctx context.Context, pid string) (*Process, error)
	Kill(ctx context.Context, pid string) error
	ListProcesses(ctx context.Context) ([]*Process, error)

	// Inter-Process Communication (Mailbox)
	Send(ctx context.Context, msg *Message) error
	Receive(ctx context.Context, pid string) (*Message, error)

	// Events
	PublishEvent(ctx context.Context, ev *Event)
	SubscribeEvents(subID string) chan *Event
	UnsubscribeEvents(subID string)
}

type AgentKernel struct {
	mu          sync.RWMutex
	currStatus  KernelStatus
	uptimeStart time.Time

	registry  *ComponentRegistry
	processes *ProcessRegistry
	mailbox   *Mailbox
	eventBus  *EventBus
}

func NewAgentKernel() *AgentKernel {
	return &AgentKernel{
		currStatus: KernelStopped,
		registry:   NewComponentRegistry(),
		processes:  NewProcessRegistry(),
		mailbox:    NewMailbox(1000),
		eventBus:   NewEventBus(),
	}
}

func (ak *AgentKernel) Start(ctx context.Context) error {
	ak.mu.Lock()
	defer ak.mu.Unlock()

	if ak.currStatus == KernelRunning {
		return fmt.Errorf("kernel already running")
	}

	ak.currStatus = KernelRunning
	ak.uptimeStart = time.Now()

	ak.PublishEvent(ctx, &Event{
		ID:        uuid.New().String(),
		Type:      "kernel_started",
		Source:    "kernel",
		Timestamp: time.Now(),
	})

	return nil
}

func (ak *AgentKernel) Stop(ctx context.Context) error {
	ak.mu.Lock()
	defer ak.mu.Unlock()

	if ak.currStatus != KernelRunning {
		return fmt.Errorf("kernel is not running")
	}

	ak.currStatus = KernelStopped

	// Kill running processes
	procs := ak.processes.List()
	for _, p := range procs {
		if p.Status == ProcessRunning {
			ak.processes.UpdateStatus(p.ID, ProcessCancelled)
			ak.mailbox.Unregister(p.ID)
		}
	}

	ak.PublishEvent(ctx, &Event{
		ID:        uuid.New().String(),
		Type:      "kernel_stopped",
		Source:    "kernel",
		Timestamp: time.Now(),
	})

	return nil
}

func (ak *AgentKernel) Status() KernelStatus {
	ak.mu.RLock()
	defer ak.mu.RUnlock()
	return ak.currStatus
}

func (ak *AgentKernel) RegisterComponent(name string, component interface{}) error {
	return ak.registry.Register(name, component)
}

func (ak *AgentKernel) GetComponent(name string) (interface{}, bool) {
	return ak.registry.Get(name)
}

func (ak *AgentKernel) Spawn(ctx context.Context, spec ProcessSpec) (*Process, error) {
	if spec.ID == "" {
		spec.ID = "p-" + uuid.New().String()[:8]
	}

	p := &Process{
		ID:           spec.ID,
		ParentID:     spec.ParentID,
		SessionID:    spec.SessionID,
		WorkspaceID:  spec.WorkspaceID,
		Goal:         spec.Goal,
		Role:         spec.Role,
		Status:       ProcessCreated,
		Model:        spec.Model,
		Timeout:      spec.Timeout,
		Capabilities: spec.Capabilities,
		CreatedAt:    time.Now(),
	}

	ak.processes.Register(p)
	ak.mailbox.Register(p.ID)

	ak.PublishEvent(ctx, &Event{
		ID:        uuid.New().String(),
		Type:      "process_spawned",
		Source:    "kernel",
		Data:      p,
		Timestamp: time.Now(),
	})

	return p, nil
}

func (ak *AgentKernel) Wait(ctx context.Context, pid string) (*Process, error) {
	p, ok := ak.processes.Get(pid)
	if !ok {
		return nil, fmt.Errorf("process %s not found", pid)
	}

	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if p.Status == ProcessDone || p.Status == ProcessFailed || p.Status == ProcessCancelled {
				return p, nil
			}
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

func (ak *AgentKernel) Kill(ctx context.Context, pid string) error {
	p, ok := ak.processes.Get(pid)
	if !ok {
		return fmt.Errorf("process %s not found", pid)
	}

	if p.Status == ProcessRunning || p.Status == ProcessCreated {
		ak.processes.UpdateStatus(pid, ProcessCancelled)
		ak.mailbox.Unregister(pid)

		ak.PublishEvent(ctx, &Event{
			ID:        uuid.New().String(),
			Type:      "process_killed",
			Source:    "kernel",
			Data:      pid,
			Timestamp: time.Now(),
		})
	}

	return nil
}

func (ak *AgentKernel) ListProcesses(ctx context.Context) ([]*Process, error) {
	return ak.processes.List(), nil
}

func (ak *AgentKernel) Send(ctx context.Context, msg *Message) error {
	return ak.mailbox.Send(ctx, msg)
}

func (ak *AgentKernel) Receive(ctx context.Context, pid string) (*Message, error) {
	return ak.mailbox.Receive(ctx, pid)
}

func (ak *AgentKernel) PublishEvent(ctx context.Context, ev *Event) {
	ak.eventBus.Publish(ctx, ev)
}

func (ak *AgentKernel) SubscribeEvents(subID string) chan *Event {
	return ak.eventBus.Subscribe(subID)
}

func (ak *AgentKernel) UnsubscribeEvents(subID string) {
	ak.eventBus.Unsubscribe(subID)
}
