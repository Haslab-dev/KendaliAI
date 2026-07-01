package main

import (
	"context"
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/events"
	"github.com/kendaliai/app/internal/kernel"
	"github.com/kendaliai/app/internal/providers"
	"github.com/kendaliai/app/internal/telemetry"
)

type MockProvider struct{}

func (m *MockProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	return &agent.Response{Content: "Done"}, nil
}

func main() {
	fmt.Println("🚀 Starting Minimum Autonomous Kernel (MAK) Phase 7 Integration Test...")

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

	// 3. Initialize Phase 7 components
	mb := providers.NewModelBroker()
	_ = ak.RegisterComponent("model_broker", mb)

	es := events.NewEventStore(database)
	_ = ak.RegisterComponent("event_store", es)

	ss := kernel.NewSupervisorService()
	_ = ak.RegisterComponent("supervisor_service", ss)

	ts := telemetry.NewTelemetryService()
	_ = ak.RegisterComponent("telemetry_service", ts)

	fmt.Println("✅ All Phase 7 pipeline services registered successfully.")

	// 4. Verify Model Broker fallback resolution
	profile := providers.TaskProfile{
		TaskType:    "plan",
		ContextSize: 120000,
	}
	chain, err := mb.Resolve(profile)
	if err != nil {
		fmt.Printf("❌ Model Broker resolution failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("🤖 Model Broker resolved fallback chain: %v\n", chain)

	// 5. Verify Event Sourcing Store persistence & replays
	sessionID := "sess-p7-test"
	goalID := "goal-p7-test"
	_ = es.SaveEvent(ctx, sessionID, goalID, "TaskStarted", `{"taskId":"task-1"}`)
	_ = es.SaveEvent(ctx, sessionID, goalID, "TaskCompleted", `{"taskId":"task-1","status":"success"}`)

	evs, err := es.ReplaySession(sessionID)
	if err != nil || len(evs) != 2 {
		fmt.Printf("❌ Event Store ReplaySession failed: %v, len=%d\n", err, len(evs))
		os.Exit(1)
	}
	fmt.Printf("⏳ Event Store: Replayed %d events for session %s\n", len(evs), sessionID)

	goalEvs, err := es.ReplayGoal(goalID)
	if err != nil || len(goalEvs) != 2 {
		fmt.Printf("❌ Event Store ReplayGoal failed: %v, len=%d\n", err, len(goalEvs))
		os.Exit(1)
	}
	fmt.Printf("🎯 Event Store: Replayed %d events for goal %s\n", len(goalEvs), goalID)

	// 6. Verify Supervisor Service Failure Classification
	strategy1, _ := ss.ClassifyFailure("agent-1", kernel.FailWaitingApp)
	strategy2, _ := ss.ClassifyFailure("agent-1", kernel.FailHeartbeatLost)
	_, _ = ss.ClassifyFailure("agent-1", kernel.FailHeartbeatLost)
	_, _ = ss.ClassifyFailure("agent-1", kernel.FailHeartbeatLost)
	strategy5, _ := ss.ClassifyFailure("agent-1", kernel.FailHeartbeatLost)
	fmt.Printf("🛡️ Supervisor: Failure strategies: WaitingApp=%s, HeartbeatLost_1=%s, HeartbeatLost_4=%s\n", strategy1, strategy2, strategy5)

	if strategy5 != kernel.StrategyCircuitBreaker {
		fmt.Println("❌ Supervisor Service failure: repeated crash did not circuit break.")
		os.Exit(1)
	}

	// 7. Verify Telemetry & Distributed Tracing
	ts.RecordTokens(goalID, 1200)
	ts.RecordCost(goalID, 0.054)
	tokens, cost := ts.GetMetrics(goalID)
	fmt.Printf("📊 Telemetry Metrics: Tokens=%d, Cost=$%f\n", tokens, cost)

	traceID := "trace-999"
	parentSpan := ts.StartSpan(traceID, "span-parent", "", "GoalResolution")
	childSpan := ts.StartSpan(traceID, "span-child", "span-parent", "CodeGeneration")

	recoveredSpan, exists := ts.GetSpan(childSpan.SpanID)
	fmt.Printf("🕸️ Trace Spans: ParentSpanID of '%s' resolved to '%s' (exists=%v)\n", recoveredSpan.Name, recoveredSpan.ParentSpanID, exists)

	if !exists || recoveredSpan.ParentSpanID != parentSpan.SpanID {
		fmt.Println("❌ Distributed Tracing failure: Trace span hierarchy incorrect.")
		os.Exit(1)
	}

	fmt.Println("🎉 Minimum Autonomous Kernel (MAK) Phase 7 Integration Test: PASS")
}
