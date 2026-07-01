package runtime

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/kernel"
)

type Supervisor struct {
	Kernel          kernel.Kernel
	Registry        *ManifestRegistry
	Provider        agent.Provider
	Workspace       string
	activeProcesses map[string]*AgentProcess
	mu              sync.Mutex
}

func NewSupervisor(k kernel.Kernel, r *ManifestRegistry, p agent.Provider, workspace string) *Supervisor {
	return &Supervisor{
		Kernel:          k,
		Registry:        r,
		Provider:        p,
		Workspace:       workspace,
		activeProcesses: make(map[string]*AgentProcess),
	}
}

func (s *Supervisor) Spawn(ctx context.Context, spec kernel.ProcessSpec) (*kernel.Process, error) {
	var m *AgentManifest
	var ok bool

	if spec.Metadata != nil {
		if manifestID, hasManifest := spec.Metadata["manifest"].(string); hasManifest {
			m, ok = s.Registry.Get(manifestID)
		}
	}

	if !ok {
		m, ok = s.Registry.Get(string(spec.Role))
	}

	if !ok && len(spec.Capabilities) > 0 {
		m = s.Registry.FindByCapabilities(spec.Capabilities)
		if m != nil {
			ok = true
		}
	}

	if !ok {
		return nil, fmt.Errorf("no manifest matching role '%s' or capabilities %v", spec.Role, spec.Capabilities)
	}

	if len(spec.Capabilities) == 0 {
		spec.Capabilities = m.Capabilities
	}

	proc, err := s.Kernel.Spawn(ctx, spec)
	if err != nil {
		return nil, err
	}

	ap := NewAgentProcess(proc, m, s.Provider, s.Workspace, s.Kernel)

	s.mu.Lock()
	s.activeProcesses[proc.ID] = ap
	s.mu.Unlock()

	go func() {
		s.Kernel.PublishEvent(ctx, &kernel.Event{
			ID:        uuid.New().String(),
			Type:      "process_running",
			Source:    ap.ID,
			Timestamp: time.Now(),
		})

		_, err := ap.Run(ctx)
		if err != nil {
			_ = s.Kernel.Kill(ctx, proc.ID)
		}
	}()

	return proc, nil
}
