package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/checkpoint"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/kernel"
	"github.com/kendaliai/app/internal/session"
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
	fmt.Println("🚀 Starting Minimum Autonomous Kernel (MAK) Phase 4 Integration Test...")

	// 1. Setup configuration and database
	config.Init()
	cfg := config.Cfg

	cwd, _ := os.Getwd()
	fmt.Printf("📂 Workspace root: %s\n", cwd)

	database, err := db.Initialize(cfg)
	if err != nil {
		fmt.Printf("❌ DB Initialization failed: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	// 2. Initialize Microkernel components
	ak := kernel.NewAgentKernel()
	ctx := context.Background()

	err = ak.Start(ctx)
	if err != nil {
		fmt.Printf("❌ Failed to start kernel: %v\n", err)
		os.Exit(1)
	}
	defer ak.Stop(ctx)

	// 3. Initialize Phase 4 isolated workspace manager
	wsBaseDir := filepath.Join(cwd, "build", "workspaces")
	wsm := workspace.NewWorkspaceManager(wsBaseDir)
	_ = ak.RegisterComponent("workspace_manager", wsm)

	sessionID := "session-p4-test"
	ws, err := wsm.Create(ctx, sessionID)
	if err != nil {
		fmt.Printf("❌ Isolated Workspace creation failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("📂 Created isolated sandbox path: %s\n", ws.RootPath)

	// 4. Initialize Deep Checkpoint Manager bound to sandbox environment
	cpm := checkpoint.NewCheckpointManager(ws.RootPath)
	_ = ak.RegisterComponent("checkpoint", cpm)

	testFile := filepath.Join(ws.RootPath, "active_task.txt")
	_ = os.WriteFile(testFile, []byte("Execution details for Phase 4"), 0644)
	fmt.Println("💾 Wrote active_task.txt to workspace.")

	cp, err := cpm.Create(ctx, sessionID)
	if err != nil {
		fmt.Printf("❌ Failed to create deep checkpoint: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("💾 Deep Checkpoint created: ID=%s, snapshotted files: %v\n", cp.ID, cp.Files)

	_ = os.Remove(testFile)
	if _, err := os.Stat(testFile); !os.IsNotExist(err) {
		fmt.Println("❌ File was not successfully deleted.")
		os.Exit(1)
	}
	fmt.Println("🗑️ Deleted active_task.txt from workspace.")

	restored, err := cpm.Restore(ctx, cp.ID)
	if err != nil || !restored {
		fmt.Printf("❌ Checkpoint restoration failed: %v\n", err)
		os.Exit(1)
	}

	if _, err := os.Stat(testFile); os.IsNotExist(err) {
		fmt.Println("❌ Deep restore failed: active_task.txt was not restored.")
		os.Exit(1)
	}
	fmt.Println("🔄 Deep restore successfully recovered active_task.txt.")

	// 5. Initialize Session Persistence Service
	ss := session.NewSessionService(database)
	_ = ak.RegisterComponent("session_service", ss)

	err = ss.Save(session.SessionState{
		SessionID:      sessionID,
		WorkspaceRoot:  ws.RootPath,
		GoalGraphJSON:  `{"roots":["g-1"],"goals":{"g-1":{"id":"g-1","title":"Create Component"}}}`,
		BlackboardJSON: `{"entries":[]}`,
		ActivePIDsJSON: `[]`,
	})
	if err != nil {
		fmt.Printf("❌ Failed to save session details: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("💾 Session state details saved to SQLite.")

	loadedState, err := ss.Load(sessionID)
	if err != nil || loadedState == nil {
		fmt.Printf("❌ Failed to load session details: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("🔄 Loaded session state from SQLite: SessionID=%s, Goals=%s\n", loadedState.SessionID, loadedState.GoalGraphJSON)

	// Clean up backup directories
	_ = os.RemoveAll(ws.RootPath)

	fmt.Println("🎉 Minimum Autonomous Kernel (MAK) Phase 4 Integration Test: PASS")
}
