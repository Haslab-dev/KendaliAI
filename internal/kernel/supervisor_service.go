package kernel

import (
	"fmt"
	"log"
)

type ProcessFailure string

const (
	FailHeartbeatLost ProcessFailure = "HeartbeatLost"
	FailMemoryLeak    ProcessFailure = "MemoryLeak"
	FailCrashLoop     ProcessFailure = "CrashLoop"
	FailWaitingApp    ProcessFailure = "WaitingApproval"
	FailLongRun       ProcessFailure = "LongRunningTool"
)

type SupervisorStrategy string

const (
	StrategyRestart        SupervisorStrategy = "RESTART"
	StrategyIgnore         SupervisorStrategy = "IGNORE"
	StrategyThrottle       SupervisorStrategy = "THROTTLE"
	StrategyCircuitBreaker SupervisorStrategy = "CIRCUIT_BREAKER"
)

type SupervisorService struct {
	crashCounters map[string]int
}

func NewSupervisorService() *SupervisorService {
	return &SupervisorService{
		crashCounters: make(map[string]int),
	}
}

func (ss *SupervisorService) ClassifyFailure(pid string, failure ProcessFailure) (SupervisorStrategy, error) {
	switch failure {
	case FailWaitingApp:
		log.Printf("Process %s is waiting for human approval. Strategy: IGNORE", pid)
		return StrategyIgnore, nil
	case FailLongRun:
		log.Printf("Process %s is executing a long compile/task. Strategy: IGNORE", pid)
		return StrategyIgnore, nil
	case FailHeartbeatLost, FailMemoryLeak:
		ss.crashCounters[pid]++
		if ss.crashCounters[pid] > 3 {
			log.Printf("Process %s has crashed repeatedly (%d times). Strategy: CIRCUIT_BREAKER", pid, ss.crashCounters[pid])
			return StrategyCircuitBreaker, nil
		}
		log.Printf("Process %s encountered %s. Strategy: RESTART", pid, failure)
		return StrategyRestart, nil
	case FailCrashLoop:
		log.Printf("Process %s detected crash loop. Strategy: CIRCUIT_BREAKER", pid)
		return StrategyCircuitBreaker, nil
	default:
		return StrategyIgnore, fmt.Errorf("unknown failure type: %s", failure)
	}
}
