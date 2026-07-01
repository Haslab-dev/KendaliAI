package resource

import (
	"fmt"
	"sync"
)

type LeaseType string

const (
	LeaseRead      LeaseType = "Read"
	LeaseWrite     LeaseType = "Write"
	LeaseExclusive LeaseType = "Exclusive"
)

type Lease struct {
	Resource string    `json:"resource"`
	PID      string    `json:"pid"`
	Type     LeaseType `json:"type"`
}

type LeaseManager struct {
	mu     sync.Mutex
	leases map[string][]*Lease
}

func NewLeaseManager() *LeaseManager {
	return &LeaseManager{
		leases: make(map[string][]*Lease),
	}
}

func (lm *LeaseManager) Acquire(resource, pid string, leaseType LeaseType) (bool, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	activeList := lm.leases[resource]

	for _, active := range activeList {
		if active.Type == LeaseExclusive && active.PID != pid {
			return false, fmt.Errorf("resource locked exclusively by %s", active.PID)
		}
		if leaseType == LeaseExclusive && active.PID != pid {
			return false, fmt.Errorf("resource is read/write shared lock by %s", active.PID)
		}
	}

	l := &Lease{Resource: resource, PID: pid, Type: leaseType}
	lm.leases[resource] = append(activeList, l)
	return true, nil
}

func (lm *LeaseManager) Release(resource, pid string) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	activeList := lm.leases[resource]
	var newList []*Lease
	for _, active := range activeList {
		if active.PID != pid {
			newList = append(newList, active)
		}
	}
	if len(newList) == 0 {
		delete(lm.leases, resource)
	} else {
		lm.leases[resource] = newList
	}
}
