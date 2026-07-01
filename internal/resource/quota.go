package resource

import (
	"fmt"
	"sync"
)

type ResourceType string

const (
	ResCPU                 ResourceType = "CPU"
	ResMemory              ResourceType = "Memory"
	ResConcurrentProcesses ResourceType = "ConcurrentProcesses"
	ResConcurrentModels    ResourceType = "ConcurrentModels"
	ResConcurrentTools     ResourceType = "ConcurrentTools"
	ResTokenBudget         ResourceType = "TokenBudget"
	ResCostBudget          ResourceType = "CostBudget"
)

type ResourceQuota struct {
	Resource ResourceType `json:"resource"`
	Limit    int64        `json:"limit"`
	Used     int64        `json:"used"`
	Reserved int64        `json:"reserved"`
}

type QuotaManager struct {
	mu     sync.Mutex
	quotas map[string]map[ResourceType]*ResourceQuota
}

func NewQuotaManager() *QuotaManager {
	return &QuotaManager{
		quotas: make(map[string]map[ResourceType]*ResourceQuota),
	}
}

func (qm *QuotaManager) SetLimit(pid string, resource ResourceType, limit int64) {
	qm.mu.Lock()
	defer qm.mu.Unlock()

	if _, exists := qm.quotas[pid]; !exists {
		qm.quotas[pid] = make(map[ResourceType]*ResourceQuota)
	}
	qm.quotas[pid][resource] = &ResourceQuota{
		Resource: resource,
		Limit:    limit,
		Used:     0,
		Reserved: 0,
	}
}

func (qm *QuotaManager) Reserve(pid string, resource ResourceType, amount int64) (bool, error) {
	qm.mu.Lock()
	defer qm.mu.Unlock()

	pQuotas, exists := qm.quotas[pid]
	if !exists {
		return true, nil
	}

	q, exists := pQuotas[resource]
	if !exists {
		return true, nil
	}

	if q.Used+q.Reserved+amount > q.Limit {
		return false, fmt.Errorf("resource limit exceeded: %s limit=%d used=%d reserved=%d requested=%d",
			resource, q.Limit, q.Used, q.Reserved, amount)
	}

	q.Reserved += amount
	return true, nil
}

func (qm *QuotaManager) Acquire(pid string, resource ResourceType, amount int64) (bool, error) {
	qm.mu.Lock()
	defer qm.mu.Unlock()

	pQuotas, exists := qm.quotas[pid]
	if !exists {
		return true, nil
	}

	q, exists := pQuotas[resource]
	if !exists {
		return true, nil
	}

	if q.Used+amount > q.Limit {
		return false, fmt.Errorf("resource limit exceeded: %s limit=%d used=%d requested=%d",
			resource, q.Limit, q.Used, amount)
	}

	q.Used += amount
	return true, nil
}

func (qm *QuotaManager) ConfirmReservation(pid string, resource ResourceType, amount int64) {
	qm.mu.Lock()
	defer qm.mu.Unlock()

	pQuotas, exists := qm.quotas[pid]
	if !exists {
		return
	}
	q, exists := pQuotas[resource]
	if !exists {
		return
	}

	if q.Reserved >= amount {
		q.Reserved -= amount
	} else {
		q.Reserved = 0
	}
	q.Used += amount
}

func (qm *QuotaManager) Release(pid string, resource ResourceType, amount int64) {
	qm.mu.Lock()
	defer qm.mu.Unlock()

	pQuotas, exists := qm.quotas[pid]
	if !exists {
		return
	}

	q, exists := pQuotas[resource]
	if !exists {
		return
	}

	if q.Used >= amount {
		q.Used -= amount
	} else {
		q.Used = 0
	}
}

func (qm *QuotaManager) ReleaseReservation(pid string, resource ResourceType, amount int64) {
	qm.mu.Lock()
	defer qm.mu.Unlock()

	pQuotas, exists := qm.quotas[pid]
	if !exists {
		return
	}

	q, exists := pQuotas[resource]
	if !exists {
		return
	}

	if q.Reserved >= amount {
		q.Reserved -= amount
	} else {
		q.Reserved = 0
	}
}

func (qm *QuotaManager) GetUsage(pid string, resource ResourceType) (int64, int64) {
	qm.mu.Lock()
	defer qm.mu.Unlock()

	pQuotas, exists := qm.quotas[pid]
	if !exists {
		return 0, 0
	}
	q, exists := pQuotas[resource]
	if !exists {
		return 0, 0
	}
	return q.Used, q.Reserved
}
