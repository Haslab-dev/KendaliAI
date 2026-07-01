package kernel

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"
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

type CrashRecord struct {
	RestartAttempts int
	FirstCrash      time.Time
	LastCrash       time.Time
	RestartReason   string
	LastError       string
	Strategy        SupervisorStrategy
	CurrentState    string
}

type SupervisorService struct {
	mu           sync.Mutex
	crashRecords map[string]*CrashRecord
	maxRestarts  int
	window       time.Duration
	stableWindow time.Duration
}

func NewSupervisorService() *SupervisorService {
	return &SupervisorService{
		crashRecords: make(map[string]*CrashRecord),
		maxRestarts:  4,
		window:       10 * time.Second,
		stableWindow: 3 * time.Second,
	}
}

func (ss *SupervisorService) ClassifyFailure(pid string, failure ProcessFailure) (SupervisorStrategy, time.Duration, error) {
	ss.mu.Lock()
	defer ss.mu.Unlock()

	now := time.Now()

	switch failure {
	case FailWaitingApp:
		log.Printf("Process %s is waiting for human approval. Strategy: IGNORE", pid)
		return StrategyIgnore, 0, nil
	case FailLongRun:
		log.Printf("Process %s is executing a long compile/task. Strategy: IGNORE", pid)
		return StrategyIgnore, 0, nil
	case FailHeartbeatLost, FailMemoryLeak, FailCrashLoop:
		record, exists := ss.crashRecords[pid]
		if !exists {
			record = &CrashRecord{
				RestartAttempts: 0,
				FirstCrash:      now,
				LastCrash:       now.Add(-10 * time.Second), // Initialize in the past
				RestartReason:   string(failure),
				LastError:       "Failure detected",
				CurrentState:    "CRASHED",
			}
			ss.crashRecords[pid] = record
		}

		// Reset stable processes
		if now.Sub(record.LastCrash) > ss.stableWindow {
			record.RestartAttempts = 0
			record.FirstCrash = now
		}

		record.LastCrash = now
		record.RestartAttempts++
		record.RestartReason = string(failure)

		if now.Sub(record.FirstCrash) <= ss.window && record.RestartAttempts > ss.maxRestarts {
			record.Strategy = StrategyCircuitBreaker
			record.CurrentState = "BLOCKED"
			log.Printf("Process %s has crashed repeatedly (%d times) within window. Strategy: CIRCUIT_BREAKER",
				pid, record.RestartAttempts)
			return StrategyCircuitBreaker, 0, nil
		}

		// Exponential backoff calculation: base * 2^attempts + jitter
		base := 200.0 // 200 milliseconds base
		factor := math.Pow(2, float64(record.RestartAttempts))
		backoffMs := base * factor

		// Add randomized jitter (up to 15% of backoff time)
		jitterRange := backoffMs * 0.15
		jitter := 0.0
		if jitterRange > 0 {
			jitter = float64(rand.Intn(int(jitterRange)))
		}
		backoffDuration := time.Duration(backoffMs+jitter) * time.Millisecond

		record.Strategy = StrategyRestart
		record.CurrentState = "BACKOFF"

		log.Printf("Process %s encountered %s. Strategy: RESTART. Backoff delay: %v", pid, failure, backoffDuration)
		return StrategyRestart, backoffDuration, nil
	default:
		return StrategyIgnore, 0, fmt.Errorf("unknown failure type: %s", failure)
	}
}

func (ss *SupervisorService) GetRecord(pid string) (*CrashRecord, bool) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	rec, exists := ss.crashRecords[pid]
	if !exists {
		return nil, false
	}
	copied := *rec
	return &copied, true
}
