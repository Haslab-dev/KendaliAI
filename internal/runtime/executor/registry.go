package executor

import (
	"context"
	"fmt"
	"sync"

	"github.com/kendaliai/app/internal/sandbox"
)

type CapabilityDescriptor struct {
	Name             string   `json:"name"`
	RequiredPolicies []string `json:"requiredPolicies,omitempty"`
	TimeoutSeconds   int      `json:"timeoutSeconds,omitempty"`
}

type Executor interface {
	Run(ctx context.Context, env sandbox.RuntimeEnvironment, args map[string]interface{}) (string, error)
}

type ExecutorRegistry struct {
	mu           sync.RWMutex
	executors    map[string]Executor
	capabilities map[string]CapabilityDescriptor
}

func NewExecutorRegistry() *ExecutorRegistry {
	return &ExecutorRegistry{
		executors:    make(map[string]Executor),
		capabilities: make(map[string]CapabilityDescriptor),
	}
}

func (er *ExecutorRegistry) Register(desc CapabilityDescriptor, exec Executor) {
	er.mu.Lock()
	defer er.mu.Unlock()
	er.capabilities[desc.Name] = desc
	er.executors[desc.Name] = exec
}

func (er *ExecutorRegistry) Get(name string) (CapabilityDescriptor, Executor, error) {
	er.mu.RLock()
	defer er.mu.RUnlock()

	desc, exists1 := er.capabilities[name]
	exec, exists2 := er.executors[name]
	if !exists1 || !exists2 {
		return CapabilityDescriptor{}, nil, fmt.Errorf("capability executor '%s' not found", name)
	}

	return desc, exec, nil
}
