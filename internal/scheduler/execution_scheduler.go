package scheduler

import (
	"context"
	"sync"
)

type ScheduledTask struct {
	ID         string
	Priority   int
	Resource   string
	Execute    func(ctx context.Context) error
	ResultChan chan error
}

type ExecutionScheduler struct {
	mu             sync.Mutex
	leases         map[string]string
	taskQueue      []*ScheduledTask
	maxConcurrency int
	runningCount   int
}

func NewExecutionScheduler(maxConcurrency int) *ExecutionScheduler {
	return &ExecutionScheduler{
		leases:         make(map[string]string),
		maxConcurrency: maxConcurrency,
	}
}

func (s *ExecutionScheduler) AcquireLease(resource, pid string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	holder, exists := s.leases[resource]
	if exists && holder != pid {
		return false
	}
	s.leases[resource] = pid
	return true
}

func (s *ExecutionScheduler) ReleaseLease(resource, pid string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if holder, exists := s.leases[resource]; exists && holder == pid {
		delete(s.leases, resource)
	}
}

func (s *ExecutionScheduler) Submit(ctx context.Context, task *ScheduledTask) error {
	s.mu.Lock()
	s.taskQueue = append(s.taskQueue, task)
	s.mu.Unlock()

	go s.processQueue(ctx)

	select {
	case err := <-task.ResultChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *ExecutionScheduler) processQueue(ctx context.Context) {
	s.mu.Lock()
	if s.runningCount >= s.maxConcurrency || len(s.taskQueue) == 0 {
		s.mu.Unlock()
		return
	}

	bestIdx := 0
	for i := 1; i < len(s.taskQueue); i++ {
		if s.taskQueue[i].Priority > s.taskQueue[bestIdx].Priority {
			bestIdx = i
		}
	}

	task := s.taskQueue[bestIdx]
	s.taskQueue = append(s.taskQueue[:bestIdx], s.taskQueue[bestIdx+1:]...)
	s.runningCount++
	s.mu.Unlock()

	err := task.Execute(ctx)
	task.ResultChan <- err

	s.mu.Lock()
	s.runningCount--
	s.mu.Unlock()

	go s.processQueue(ctx)
}
