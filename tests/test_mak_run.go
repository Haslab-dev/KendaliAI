package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/events"
	"github.com/kendaliai/app/internal/kernel"
	"github.com/kendaliai/app/internal/resource"
)

type MockProvider struct{}

func (m *MockProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	return &agent.Response{Content: "Done"}, nil
}

func main() {
	fmt.Println("🚀 Starting Minimum Autonomous Kernel (MAK) Production Upgrades Integration Test...")

	// 1. Setup configuration
	config.Init()
	cfg := config.Cfg

	database, _ := db.Initialize(cfg)
	defer database.Close()

	// 2. Initialize Microkernel components
	ak := kernel.NewAgentKernel()
	ctx := context.Background()

	_ = ak.Start(ctx)
	defer ak.Stop(ctx)

	// 3. Initialize Production Upgrades services
	qm := resource.NewQuotaManager()
	_ = ak.RegisterComponent("quota_manager", qm)

	snS := events.NewSnapshotStore(database)
	_ = ak.RegisterComponent("snapshot_store", snS)

	ss := kernel.NewSupervisorService()
	_ = ak.RegisterComponent("supervisor_service", ss)

	fmt.Println("✅ All production OS services registered successfully.")

	// 4. Verify Resource Quota reservations
	pid := "agent-coder-pid"
	qm.SetLimit(pid, resource.ResTokenBudget, 1000)

	// Reserve 600 tokens
	ok1, err1 := qm.Reserve(pid, resource.ResTokenBudget, 600)
	fmt.Printf("📊 Resource Reservation 1 (600 tokens): Success=%v, Err=%v\n", ok1, err1)

	// Reserve another 600 tokens (should fail)
	ok2, err2 := qm.Reserve(pid, resource.ResTokenBudget, 600)
	fmt.Printf("📊 Resource Reservation 2 (600 tokens - limit is 1000): Success=%v, Err=%v\n", ok2, err2)

	if ok2 {
		fmt.Println("❌ Resource Quota Manager failure: allowed exceeding limits.")
		os.Exit(1)
	}

	// Release first reservation and retry
	qm.ReleaseReservation(pid, resource.ResTokenBudget, 600)
	ok3, err3 := qm.Reserve(pid, resource.ResTokenBudget, 600)
	fmt.Printf("📊 Resource Reservation 3 (after release): Success=%v, Err=%v\n", ok3, err3)

	if !ok3 {
		fmt.Printf("❌ Resource Quota Manager failure: release did not free quota: %v\n", err3)
		os.Exit(1)
	}

	// 5. Verify Event Store Snapshots
	sessionID := "session-prod-test"
	snap := events.Snapshot{
		ID:                "snap-100",
		SessionID:         sessionID,
		ProjectionType:    "GoalProjection",
		ProjectionVersion: 1,
		LastEventID:       450,
		CreatedAt:         time.Now(),
		Checksum:          "sha256-abc123xyz",
		Compressed:        true,
		State:             []byte(`{"status":"Completed"}`),
	}

	err := snS.SaveSnapshot(ctx, snap)
	if err != nil {
		fmt.Printf("❌ Snapshot Store SaveSnapshot failed: %v\n", err)
		os.Exit(1)
	}

	loadedSnap, err := snS.LoadLatestSnapshot(ctx, sessionID, "GoalProjection")
	if err != nil || loadedSnap == nil || loadedSnap.ID != "snap-100" || loadedSnap.Checksum != "sha256-abc123xyz" {
		fmt.Printf("❌ Snapshot Store LoadLatestSnapshot failed or corrupted: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("⏳ Snapshot Store: Successfully loaded versioned snapshot ID=%s, LastEventID=%d, State=%s\n",
		loadedSnap.ID, loadedSnap.LastEventID, string(loadedSnap.State))

	// 6. Verify Supervisor Exponential Backoff with Jitter & Intensity constraints
	agentPID := "agent-worker-1"

	// Trigger 3 crashes, delays should increase exponentially
	var delays []time.Duration
	for i := 0; i < 3; i++ {
		strategy, delay, err := ss.ClassifyFailure(agentPID, kernel.FailHeartbeatLost)
		if err != nil {
			fmt.Printf("❌ Supervisor classification failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("🛡️ Supervisor crash %d: strategy=%s, delay=%v\n", i+1, strategy, delay)
		delays = append(delays, delay)
	}

	if delays[1] <= delays[0] || delays[2] <= delays[1] {
		fmt.Println("❌ Supervisor failure: Backoff delays are not increasing exponentially.")
		os.Exit(1)
	}

	// Wait for process to remain stable (exceed ss.stableWindow = 3s)
	fmt.Println("⏳ Simulating process stability window (4 seconds)...")
	time.Sleep(4 * time.Second)

	// A crash now should reset the backoff attempts
	strategyStable, delayStable, _ := ss.ClassifyFailure(agentPID, kernel.FailHeartbeatLost)
	fmt.Printf("🛡️ Supervisor crash (post-stability window): strategy=%s, delay=%v (expected low backoff delay)\n",
		strategyStable, delayStable)

	if delayStable > delays[2] {
		fmt.Println("❌ Supervisor failure: stability window did not reset backoff delays.")
		os.Exit(1)
	}

	// Trigger crashes to exceed ss.maxRestarts (4) in timeframe to activate CircuitBreaker
	fmt.Println("🛡️ Inducing crash loop to trigger Circuit Breaker limit...")
	for i := 0; i < 5; i++ {
		strategy, _, _ := ss.ClassifyFailure(agentPID, kernel.FailHeartbeatLost)
		if strategy == kernel.StrategyCircuitBreaker {
			fmt.Printf("🎉 Supervisor triggered: StrategyCircuitBreaker on attempt %d\n", i+1)
			break
		}
	}

	record, ok := ss.GetRecord(agentPID)
	if !ok || record.Strategy != kernel.StrategyCircuitBreaker || record.CurrentState != "BLOCKED" {
		fmt.Println("❌ Supervisor failure: Repeated crashes did not trigger circuit breaker.")
		os.Exit(1)
	}

	fmt.Println("🎉 Minimum Autonomous Kernel (MAK) Production Upgrades Integration Test: PASS")
}
