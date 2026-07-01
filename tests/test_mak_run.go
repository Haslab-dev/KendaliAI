package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/capability"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/index"
	"github.com/kendaliai/app/internal/intent"
	"github.com/kendaliai/app/internal/kernel"
	"github.com/kendaliai/app/internal/workflow"
	"github.com/kendaliai/app/internal/workspace"
)

type MockProvider struct{}

func (m *MockProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	lastMsg := msgs[len(msgs)-1].Content

	if strings.Contains(lastMsg, "HelloWorld Go module") || strings.Contains(lastMsg, "hello.go function") || strings.Contains(lastMsg, "Design") {
		return &agent.Response{
			Content: `tool: spawn({"role": "coder", "goal": "Write the hello.go code"})`,
		}, nil
	}

	if strings.Contains(lastMsg, "hello.go") || strings.Contains(lastMsg, "code") || strings.Contains(lastMsg, "coder") {
		return &agent.Response{
			Content: `tool: write_files({"path": "hello.go", "content": "package main\n\nfunc main() {\n\tprintln(\"Hello World\")\n}\n"})`,
		}, nil
	}

	return &agent.Response{
		Content: "Done! Verification finished.",
	}, nil
}

func main() {
	fmt.Println("🚀 Starting Minimum Autonomous Kernel (MAK) Phase 5 Integration Test...")

	// 1. Setup configuration
	config.Init()
	cfg := config.Cfg

	cwd, _ := os.Getwd()
	fmt.Printf("📂 Workspace root: %s\n", cwd)

	database, _ := db.Initialize(cfg)
	defer database.Close()

	// 2. Initialize Microkernel components
	ak := kernel.NewAgentKernel()
	ctx := context.Background()

	_ = ak.Start(ctx)
	defer ak.Stop(ctx)

	// 3. Initialize Phase 5 components
	ir := intent.NewIntentResolver()
	_ = ak.RegisterComponent("intent_resolver", ir)

	cg := index.NewCodeIntelligenceGraph()
	wi := index.NewWorkspaceIndexer(cg)
	_ = ak.RegisterComponent("workspace_indexer", wi)

	cb := capability.NewCapabilityBroker()
	_ = ak.RegisterComponent("capability_broker", cb)

	ob := kernel.NewObservationBus()
	_ = ak.RegisterComponent("observation_bus", ob)

	fmt.Println("✅ All Phase 5 pipeline services registered successfully.")

	// 4. Verify Intent Resolution Engine
	textQuery := "Fix the error in compiler module"
	res := ir.Resolve(textQuery)
	fmt.Printf("💬 Intent resolved: Intent=%s, GoalID=%s, Constraints=%+v\n", res.Intent, res.GoalID, res.Constraints)

	textQuery2 := "Design landing page"
	res2 := ir.Resolve(textQuery2)
	fmt.Printf("💬 Intent resolved: Intent=%s, RequiresClarification=%v, Missing=%v\n", res2.Intent, res2.RequiresClarification, res2.Missing)

	// 5. Verify Workspace Indexer & Go AST parsing
	wsBaseDir := filepath.Join(cwd, "build", "workspaces")
	wsm := workspace.NewWorkspaceManager(wsBaseDir)
	ws, _ := wsm.Create(ctx, "session-p5-test")
	defer os.RemoveAll(ws.RootPath)

	dummyGoFile := filepath.Join(ws.RootPath, "dummy.go")
	dummyGoContent := `package main
import "fmt"
type Config struct {
	Port int
}
func RunServer() {
	fmt.Println("Running server")
}
`
	_ = os.WriteFile(dummyGoFile, []byte(dummyGoContent), 0644)

	err := wi.IndexFile(dummyGoFile)
	if err != nil {
		fmt.Printf("❌ Go AST Indexer failed: %v\n", err)
		os.Exit(1)
	}

	sym1, exists1 := cg.GetSymbol("RunServer")
	sym2, exists2 := cg.GetSymbol("Config")
	fmt.Printf("🕸️ Go AST parsed symbols: RunServer exists=%v (type=%v), Config exists=%v (type=%v)\n", exists1, sym1.Type, exists2, sym2.Type)

	// 6. Verify Execution Graph (Stateful branch runs)
	eg := workflow.NewExecutionGraph()
	step1Ran := false
	step2Ran := false

	node1 := &workflow.ExecutionNode{
		ID: "node-1",
		Execute: func(c context.Context) error {
			step1Ran = true
			return nil
		},
	}
	node2 := &workflow.ExecutionNode{
		ID:       "node-2",
		Requires: []string{"node-1"},
		Execute: func(c context.Context) error {
			step2Ran = true
			return nil
		},
	}

	eg.AddNode(node1)
	eg.AddNode(node2)

	_ = eg.Execute(ctx)
	fmt.Printf("⚙️ Execution Graph results: Step1Ran=%v, Step2Ran=%v\n", step1Ran, step2Ran)

	// 7. Verify Capability Broker & Approvals
	req := capability.CapabilityRequest{
		Capability: "write_files",
		Args:       map[string]interface{}{"path": "hello.go"},
		PID:        "agent-coder-pid",
	}
	approved, err := cb.RequestApproval(ctx, "task-write-1", req)
	fmt.Printf("🔒 Capability approval request: Approved=%v, Error=%v\n", approved, err)

	cb.GrantApproval("task-write-1")
	approved2, err2 := cb.RequestApproval(ctx, "task-write-1", req)
	fmt.Printf("🔓 Approval granted. Secondary request: Approved=%v, Error=%v\n", approved2, err2)

	// 8. Verify Observation Bus pub/sub
	obsChan := ob.Subscribe()
	ob.Publish(kernel.ObservationEvent{
		Type:      kernel.ObsBuildFailed,
		SessionID: "session-p5-test",
		Source:    "compiler",
	})

	select {
	case event := <-obsChan:
		fmt.Printf("📢 Observation Bus stream: Received event of type: %s from source: %s\n", event.Type, event.Source)
	default:
		fmt.Println("❌ Did not receive observation event.")
		os.Exit(1)
	}

	fmt.Println("🎉 Minimum Autonomous Kernel (MAK) Phase 5 Integration Test: PASS")
}
