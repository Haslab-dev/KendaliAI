package index

import (
	"sync"
)

type SymbolType string

const (
	SymFunction SymbolType = "function"
	SymStruct   SymbolType = "struct"
	SymImport   SymbolType = "import"
	SymRoute    SymbolType = "route"
)

type CodeSymbol struct {
	Name string     `json:"name"`
	Type SymbolType `json:"type"`
	File string     `json:"file"`
}

type CodeIntelligenceGraph struct {
	mu      sync.RWMutex
	symbols map[string]*CodeSymbol
	calls   map[string][]string
}

func NewCodeIntelligenceGraph() *CodeIntelligenceGraph {
	return &CodeIntelligenceGraph{
		symbols: make(map[string]*CodeSymbol),
		calls:   make(map[string][]string),
	}
}

func (cg *CodeIntelligenceGraph) AddSymbol(name string, symType SymbolType, file string) {
	cg.mu.Lock()
	defer cg.mu.Unlock()
	cg.symbols[name] = &CodeSymbol{Name: name, Type: symType, File: file}
}

func (cg *CodeIntelligenceGraph) AddCall(caller, callee string) {
	cg.mu.Lock()
	defer cg.mu.Unlock()
	cg.calls[caller] = append(cg.calls[caller], callee)
}

func (cg *CodeIntelligenceGraph) GetSymbol(name string) (*CodeSymbol, bool) {
	cg.mu.RLock()
	defer cg.mu.RUnlock()
	s, ok := cg.symbols[name]
	return s, ok
}

func (cg *CodeIntelligenceGraph) GetCallees(caller string) []string {
	cg.mu.RLock()
	defer cg.mu.RUnlock()
	return cg.calls[caller]
}
