package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/capability"
	"github.com/kendaliai/app/internal/channels"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/git"
	"github.com/kendaliai/app/internal/kernel"
	"github.com/kendaliai/app/internal/review"
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
	fmt.Println("🚀 Starting Minimum Autonomous Kernel (MAK) Phase 6 Integration Test...")

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

	// 3. Initialize Phase 6 components
	ga := git.NewLocalGitAdapter(cwd)
	_ = ak.RegisterComponent("git_adapter", ga)

	tc := channels.NewTelegramChannelAdapter("bot-token-123", "chat-id-456")
	_ = ak.RegisterComponent("telegram_channel", tc)

	rb := kernel.NewRuntimeBus()
	_ = ak.RegisterComponent("runtime_bus", rb)

	re := review.NewReviewEngine()
	_ = ak.RegisterComponent("review_engine", re)

	wsBaseDir := filepath.Join(cwd, "build", "workspaces")
	wsm := workspace.NewWorkspaceManager(wsBaseDir)
	ws, _ := wsm.Create(ctx, "session-p6-test")
	defer os.RemoveAll(ws.RootPath)

	fe := capability.NewFilesystemExecutor(ws.RootPath)
	_ = ak.RegisterComponent("filesystem_executor", fe)

	fmt.Println("✅ All Phase 6 pipeline services registered successfully.")

	// 4. Verify Git Adapter & conventional commit formatting
	_ = ga.CreateBranch("feat/authentication")
	commitMsg, err := ga.Commit(git.GitCommit{
		Type:    "feat",
		Scope:   "auth",
		Message: "add local authentication gate",
	})
	if err != nil {
		fmt.Printf("❌ Git commit failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("📦 Git Engine commit output: %s\n", commitMsg)

	// 5. Verify Channel Abstraction (Telegram Channel)
	msg, _ := tc.Receive(ctx)
	_ = tc.Typing(ctx)
	_ = tc.Reply(ctx, "Hello back from agent kernel gateway!")
	approved, _ := tc.RequestApproval(ctx, "Capability Request: exec shell script")
	fmt.Printf("💬 Channel Gateway Dialog Flow: Received='%s', Approved=%v\n", msg, approved)

	// 6. Verify Capability Executors
	execResult, err := fe.Execute(ctx, map[string]interface{}{
		"path":    "hello.txt",
		"content": "Hello World Phase 6",
	})
	if err != nil {
		fmt.Printf("❌ Filesystem Executor failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("⚙️ Capability Executor output: %s\n", execResult)

	// 7. Verify Semantic Runtime Bus
	rtChan := rb.Subscribe()
	rb.Publish(kernel.RuntimeEvent{
		Type:      kernel.EvCheckpointCreated,
		SessionID: "session-p6-test",
		Payload:   map[string]interface{}{"checkpoint_id": "cp-123"},
	})

	select {
	case event := <-rtChan:
		fmt.Printf("📢 Runtime Bus: Received event: %s, session: %s, payload: %+v\n", event.Type, event.SessionID, event.Payload)
	default:
		fmt.Println("❌ Did not receive runtime event.")
		os.Exit(1)
	}

	// 8. Verify Review Engine static credentials scanner
	leakFile := filepath.Join(ws.RootPath, "leaked_secret.go")
	_ = os.WriteFile(leakFile, []byte("package main\n\nconst token = \"my api_key is secret-token\"\n"), 0644)

	issues, err := re.Scan(leakFile)
	if err != nil {
		fmt.Printf("❌ Review Engine scan failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("🛡️ Review Engine static scanning issue counts: %d\n", len(issues))
	for _, issue := range issues {
		fmt.Printf("   ├─ Alert message: %s (Severity: %s)\n", issue.Message, issue.Severity)
	}

	fmt.Println("🎉 Minimum Autonomous Kernel (MAK) Phase 6 Integration Test: PASS")
}
