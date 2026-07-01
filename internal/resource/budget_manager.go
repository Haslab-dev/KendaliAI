package resource

import (
	"fmt"
	"sync"
)

type Budget struct {
	MaxCost     float64 `json:"maxCost"`
	SpentCost   float64 `json:"spentCost"`
	MaxTokens   int     `json:"maxTokens"`
	SpentTokens int     `json:"spentTokens"`
}

type BudgetManager struct {
	mu      sync.RWMutex
	budgets map[string]*Budget
}

func NewBudgetManager() *BudgetManager {
	return &BudgetManager{
		budgets: make(map[string]*Budget),
	}
}

func (bm *BudgetManager) Register(scopeID string, maxCost float64, maxTokens int) {
	bm.mu.Lock()
	defer bm.mu.Unlock()

	bm.budgets[scopeID] = &Budget{
		MaxCost:   maxCost,
		MaxTokens: maxTokens,
	}
}

func (bm *BudgetManager) Spend(scopeID string, cost float64, tokens int) error {
	bm.mu.Lock()
	defer bm.mu.Unlock()

	b, exists := bm.budgets[scopeID]
	if !exists {
		return fmt.Errorf("budget scope '%s' not registered", scopeID)
	}

	if b.MaxCost > 0 && b.SpentCost+cost > b.MaxCost {
		return fmt.Errorf("cost budget exceeded for scope %s: limit %f, trying to spend %f", scopeID, b.MaxCost, b.SpentCost+cost)
	}

	if b.MaxTokens > 0 && b.SpentTokens+tokens > b.MaxTokens {
		return fmt.Errorf("token budget exceeded for scope %s: limit %d, trying to spend %d", scopeID, b.MaxTokens, b.SpentTokens+tokens)
	}

	b.SpentCost += cost
	b.SpentTokens += tokens
	return nil
}

func (bm *BudgetManager) Get(scopeID string) (*Budget, bool) {
	bm.mu.RLock()
	defer bm.mu.RUnlock()

	b, ok := bm.budgets[scopeID]
	return b, ok
}
