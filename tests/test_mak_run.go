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
	"github.com/kendaliai/app/internal/resource"
	"github.com/kendaliai/app/internal/runtime/executor"
	"github.com/kendaliai/app/internal/sandbox"
)

type MockProvider struct{}

func (m *MockProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	return &agent.Response{Content: "Done"}, nil
}

type MockExecutor struct{}

func (me *MockExecutor) Run(ctx context.Context, env sandbox.RuntimeEnvironment, args map[string]interface{}) (string, error) {
	cmd, _ := args["command"].(string)
	res, err := env.Execute(ctx, sandbox.ExecutionRequest{Command: cmd})
	if err != nil {
		return "", err
	}
	return res.Stdout, nil
}

func main() {
	fmt.Println("🚀 Starting Minimum Autonomous Kernel (MAK) v1.0 Integration Test...")

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

	// 3. Initialize v1.0 pipeline services
	mb := kernel.NewMailbox(10)
	_ = ak.RegisterComponent("mailbox", mb)

	lm := resource.NewLeaseManager()
	_ = ak.RegisterComponent("lease_manager", lm)

	env := sandbox.NewLocalRuntimeEnvironment()
	_ = ak.RegisterComponent("runtime_environment", env)

	er := executor.NewExecutorRegistry()
	_ = ak.RegisterComponent("executor_registry", er)

	pr := events.NewProjectionRegistry()
	_ = ak.RegisterComponent("projection_registry", pr)

	fmt.Println("✅ All v1.0 OS primitives registered successfully.")

	// 4. Verify IPC Message Envelopes
	pid := "agent-coder-pid"
	mb.Register(pid)
	defer mb.Unregister(pid)

	envelope := &kernel.Envelope{
		ID:            "env-100",
		CorrelationID: "corr-999",
		ParentProcess: "agent-planner-pid",
		TargetProcess: pid,
		ReplyTo:       "agent-planner-pid",
		Type:          kernel.MsgSpawn,
		Payload:       map[string]interface{}{"role": "coder"},
	}

	err := mb.Send(ctx, envelope)
	if err != nil {
		fmt.Printf("❌ Envelope IPC send failed: %v\n", err)
		os.Exit(1)
	}

	received, err := mb.Receive(ctx, pid)
	if err != nil || received.ID != "env-100" || received.CorrelationID != "corr-999" {
		fmt.Printf("❌ Envelope IPC receive failed or corrupted: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("📦 Mailbox IPC Correlation Envelope: ID=%s, CorrelationID=%s, Payload=%+v\n", received.ID, received.CorrelationID, received.Payload)

	// 5. Verify Resource Lease locks bounds
	resourcePath := "/workspace/auth.go"
	success1, _ := lm.Acquire(resourcePath, "agent-coder-pid", resource.LeaseWrite)
	success2, err2 := lm.Acquire(resourcePath, "agent-reviewer-pid", resource.LeaseExclusive)
	fmt.Printf("🔒 Resource Locks: Write lease: %v, Exclusive lease: %v (Error: %v)\n", success1, success2, err2)

	lm.Release(resourcePath, "agent-coder-pid")
	success3, err3 := lm.Acquire(resourcePath, "agent-reviewer-pid", resource.LeaseExclusive)
	fmt.Printf("🔓 Lock released. Exclusive lock secondary check: %v (Error: %v)\n", success3, err3)

	// 6. Verify Capability Descriptors & Executor Registry
	desc := executor.CapabilityDescriptor{
		Name:             "exec_shell",
		RequiredPolicies: []string{"allow_read_only"},
		TimeoutSeconds:   10,
	}
	er.Register(desc, &MockExecutor{})

	resolvedDesc, exec, err := er.Get("exec_shell")
	if err != nil {
		fmt.Printf("❌ Executor registry resolution failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("🛠️ Executor Registry: Resolved '%s' with Policies: %v\n", resolvedDesc.Name, resolvedDesc.RequiredPolicies)

	runResult, err := exec.Run(ctx, env, map[string]interface{}{"command": "go test ./..."})
	if err != nil {
		fmt.Printf("❌ Executor Run failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("⚙️ Executor Execution output: %s\n", runResult)

	// 7. Verify Pluggable Projection Registry
	goalProj := events.NewGoalProjection()
	metricsProj := events.NewMetricsProjection()

	pr.Register(goalProj)
	pr.Register(metricsProj)

	sessionID := "session-p8"
	goalID := "goal-p8"

	pr.Apply(events.Event{Type: "GoalUpdated", SessionID: sessionID, GoalID: goalID})
	pr.Apply(events.Event{Type: "TaskStarted", SessionID: sessionID, GoalID: goalID})
	pr.Apply(events.Event{Type: "MetricsRecorded", SessionID: sessionID, GoalID: goalID})
	pr.Apply(events.Event{Type: "TaskCompleted", SessionID: sessionID, GoalID: goalID})

	projectedStatus := goalProj.Status[goalID]
	fmt.Printf("📈 Pluggable Projections: Projected Goal state: '%s'\n", projectedStatus)
	fmt.Printf("📊 Pluggable Projections: Projected Metrics: Tokens=%d, Cost=$%f\n", metricsProj.TokenUsage, metricsProj.CostSummary)

	if projectedStatus != "Completed" || metricsProj.TokenUsage != 100 {
		fmt.Println("❌ Projections failure: state accumulation incorrect.")
		os.Exit(1)
	}

	fmt.Println("🎉 Minimum Autonomous Kernel (MAK) v1.0 Integration Test: PASS")
}
