package kernel

import (
	"fmt"
	"sync"
)

type ComponentRegistry struct {
	mu         sync.RWMutex
	components map[string]interface{}
}

func NewComponentRegistry() *ComponentRegistry {
	return &ComponentRegistry{
		components: make(map[string]interface{}),
	}
}

func (cr *ComponentRegistry) Register(name string, comp interface{}) error {
	cr.mu.Lock()
	defer cr.mu.Unlock()

	if _, exists := cr.components[name]; exists {
		return fmt.Errorf("component %s already registered", name)
	}

	cr.components[name] = comp
	return nil
}

func (cr *ComponentRegistry) Get(name string) (interface{}, bool) {
	cr.mu.RLock()
	defer cr.mu.RUnlock()

	comp, ok := cr.components[name]
	return comp, ok
}
