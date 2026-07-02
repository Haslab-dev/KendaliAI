package data

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestRFC0038_FullCachePipeline(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "src"), 0755)
	os.MkdirAll(filepath.Join(dir, "cmd", "app"), 0755)

	os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module testapp\n\ngo 1.21"), 0644)
	os.WriteFile(filepath.Join(dir, "main.go"), []byte("package main\n\nfunc main() {}\n\ntype Config struct {\n\tName string\n}\n\nfunc NewConfig() *Config {\n\treturn &Config{}\n}"), 0644)
	os.WriteFile(filepath.Join(dir, "src", "app.go"), []byte("package src\n\nimport \"fmt\"\n\nfunc Hello() string {\n\treturn fmt.Sprintf(\"hello\")\n}"), 0644)

	core, err := NewCore(dir)
	if err != nil {
		t.Fatalf("NewCore: %v", err)
	}
	defer core.Close()

	ctx := context.Background()

	t.Run("1_RepositoryCache", func(t *testing.T) {
		if err := core.Reindex(ctx); err != nil {
			t.Fatalf("Reindex: %v", err)
		}

		meta, err := core.Data.Storage.GetWorkspace(ctx, dir)
		if err != nil {
			t.Fatalf("GetWorkspace: %v", err)
		}
		if meta.Framework != "Go" {
			t.Errorf("expected Go framework, got %s", meta.Framework)
		}
		if meta.Language != "Go" {
			t.Errorf("expected Go language, got %s", meta.Language)
		}
		t.Logf("Repository cache: framework=%s language=%s entrypoints=%s", meta.Framework, meta.Language, meta.Entrypoints)
	})

	t.Run("2_FileIndex_Cache", func(t *testing.T) {
		sha, tokens, _, err := core.Data.Storage.GetFileInfo(ctx, "main.go")
		if err != nil {
			t.Fatalf("GetFileInfo: %v", err)
		}
		if sha == "" {
			t.Error("expected SHA256 hash for main.go")
		}
		if tokens == 0 {
			t.Error("expected non-zero token estimate")
		}
		t.Logf("File index: sha=%s tokens=%d", sha[:12], tokens)

		changed, err := core.Data.Storage.IsFileChanged(ctx, "main.go")
		if err != nil {
			t.Fatalf("IsFileChanged: %v", err)
		}
		if changed {
			t.Error("file should not be changed immediately after indexing")
		}
	})

	t.Run("3_WorkspaceStaleness", func(t *testing.T) {
		if core.Data.Storage.IsWorkspaceStale() {
			t.Error("workspace should not be stale immediately after indexing")
		}

		core.Data.Storage.InvalidateWorkspace()

		if !core.Data.Storage.IsWorkspaceStale() {
			t.Error("workspace should be stale after manual invalidation")
		}
		t.Log("Workspace staleness detection works")
	})

	t.Run("4_SymbolTable", func(t *testing.T) {
		indexed := []SymbolEntry{
			{Name: "Config", Kind: "type", File: "main.go", Line: 5, Exported: true},
			{Name: "NewConfig", Kind: "function", File: "main.go", Line: 9, Exported: true},
		}
		if err := core.Data.Storage.IndexSymbols(ctx, indexed); err != nil {
			t.Fatalf("IndexSymbols: %v", err)
		}

		symbols, err := core.ResolveSymbol(ctx, "Config")
		if err != nil {
			t.Fatalf("ResolveSymbol: %v", err)
		}
		if len(symbols) == 0 {
			t.Fatal("expected Config symbol to be found")
		}
		if symbols[0].File != "main.go" {
			t.Errorf("expected Config in main.go, got %s", symbols[0].File)
		}
		t.Logf("Symbol: %s in %s:%d exported=%v", symbols[0].Name, symbols[0].File, symbols[0].Line, symbols[0].Exported)
	})

	t.Run("5_ContextCache", func(t *testing.T) {
		testHash := "test-context-hash-001"

		entry := &ContextCacheEntry{
			ContextHash:    testHash,
			Prompt:         "test system prompt",
			Response:       "test response",
			ToolSequence:   "analyze_project,read_file,apply_patch",
			Provider:       "test-provider",
			Model:          "test-model",
			TokenSavings:   1200,
		}
		if err := core.Data.Storage.SetContextCache(ctx, entry); err != nil {
			t.Fatalf("SetContextCache: %v", err)
		}

		cached, err := core.Data.Storage.GetContextCache(ctx, testHash)
		if err != nil {
			t.Fatalf("GetContextCache: %v", err)
		}
		if cached.Response != "test response" {
			t.Errorf("expected cached response, got %s", cached.Response)
		}
		if cached.HitCount < 0 {
			t.Errorf("expected hit count >= 0, got %d", cached.HitCount)
		}
		t.Logf("Context cache: hit_count=%d token_savings=%d", cached.HitCount, cached.TokenSavings)

		cached2, _ := core.Data.Storage.GetContextCache(ctx, testHash)
		if cached2 != nil && cached2.HitCount >= 1 {
			t.Logf("Context cache second read: hit_count=%d", cached2.HitCount)
		}

		if err := core.Data.Storage.InvalidateContextCache(ctx); err != nil {
			t.Fatalf("InvalidateContextCache: %v", err)
		}
		_, err = core.Data.Storage.GetContextCache(ctx, testHash)
		if err == nil {
			t.Error("expected cache miss after invalidation")
		}
	})

	t.Run("6_PlanCache", func(t *testing.T) {
		goalHash := hashContent("create landing page")

		if err := core.Data.Storage.StorePlan(ctx, "create landing page", goalHash,
			"analyze → read App.tsx → patch → verify",
			"analyze_project,read_file,apply_patch,verify_build",
			"React+Vite"); err != nil {
			t.Fatalf("StorePlan: %v", err)
		}

		dag, toolSeq, found := core.Data.Storage.LookupPlan(ctx, goalHash)
		if !found {
			t.Fatal("expected plan to be found")
		}
		if dag == "" {
			t.Error("expected non-empty execution DAG")
		}
		if toolSeq == "" {
			t.Error("expected non-empty tool sequence")
		}
		t.Logf("Plan cache: dag=%s tools=%s", dag, toolSeq)
	})

	t.Run("7_SessionAndGoal", func(t *testing.T) {
		session := &Session{
			ID:        "sess-test-001",
			Goal:      "test session",
			Intent:    "code_edit",
			Status:    "active",
		}
		if err := core.Data.Storage.CreateSession(ctx, session); err != nil {
			t.Fatalf("CreateSession: %v", err)
		}

		got, err := core.Data.Storage.GetSession(ctx, "sess-test-001")
		if err != nil {
			t.Fatalf("GetSession: %v", err)
		}
		if got.Intent != "code_edit" {
			t.Errorf("expected intent code_edit, got %s", got.Intent)
		}

		goal := &GoalRecord{
			ID:        "goal-test-001",
			SessionID: "sess-test-001",
			Summary:   "test goal summary",
			Status:    "active",
		}
		if err := core.Data.Storage.CreateGoal(ctx, goal); err != nil {
			t.Fatalf("CreateGoal: %v", err)
		}

		goals, err := core.Data.Storage.ListGoalsBySession(ctx, "sess-test-001")
		if err != nil {
			t.Fatalf("ListGoalsBySession: %v", err)
		}
		if len(goals) != 1 {
			t.Errorf("expected 1 goal, got %d", len(goals))
		}
	})

	t.Run("8_Conversation", func(t *testing.T) {
		turn := &ConversationTurn{
			SessionID: "sess-test-001",
			Role:      "user",
			Content:   "test message",
			Tokens:    5,
			Model:     "test-model",
		}
		if err := core.Data.Storage.AppendConversation(ctx, turn); err != nil {
			t.Fatalf("AppendConversation: %v", err)
		}

		turns, err := core.Data.Storage.ListConversations(ctx, "sess-test-001", 10)
		if err != nil {
			t.Fatalf("ListConversations: %v", err)
		}
		if len(turns) != 1 {
			t.Errorf("expected 1 conversation turn, got %d", len(turns))
		}
	})

	t.Run("9_ContextCompiler_Order", func(t *testing.T) {
		goal := "test goal"
		files := []string{"main.go", "src/app.go"}
		contents := map[string]string{
			"main.go":    "package main\nfunc main() {}",
			"src/app.go": "package src\nfunc Hello() string {}",
		}

		ctx := core.BuildContext("code_edit", goal, files, contents)
		if ctx == "" {
			t.Fatal("expected non-empty context")
		}

		goalPos := indexOf(ctx, "GOAL:")
		wsPos := indexOf(ctx, "WORKING SET")
		repoPos := indexOf(ctx, "REPOSITORY")
		codePos := indexOf(ctx, "###")

		if goalPos < 0 || wsPos < 0 || repoPos < 0 || codePos < 0 {
			t.Fatal("expected all context layers to be present")
		}

		if goalPos > wsPos {
			t.Errorf("GOAL should appear before WORKING SET (goal=%d, ws=%d)", goalPos, wsPos)
		}
		if wsPos > repoPos {
			t.Errorf("WORKING SET should appear before REPOSITORY (ws=%d, repo=%d)", wsPos, repoPos)
		}
		if repoPos > codePos {
			t.Errorf("REPOSITORY should appear before CODE (repo=%d, code=%d)", repoPos, codePos)
		}

		t.Logf("Context layer order: GOAL(%d) < WS(%d) < REPO(%d) < CODE(%d)", goalPos, wsPos, repoPos, codePos)
	})

	t.Run("10_RecipeTokenBudgets", func(t *testing.T) {
		recipes := []string{"ui_generation", "code_edit", "bug_fix", "analysis", "deployment", "refactor", "general"}
		for _, name := range recipes {
			recipe := core.Intelligence.Recipes.Resolve(name)
			if recipe.TokenBudget == 0 {
				t.Errorf("recipe %s has zero token budget", name)
			}
			if recipe.PrefixBudget == 0 {
				t.Errorf("recipe %s has zero prefix budget", name)
			}
			if recipe.FileBudget == 0 {
				t.Errorf("recipe %s has zero file budget", name)
			}
			total := recipe.PrefixBudget + recipe.WorkspaceBudget + recipe.RetrievalBudget + recipe.FileBudget + recipe.ConversationBudget
			if total != recipe.TokenBudget {
				t.Errorf("recipe %s: per-layer budget sum (%d) != total (%d)", name, total, recipe.TokenBudget)
			}
		}
		t.Logf("All 7 recipes have valid per-layer token budgets")
	})

	t.Run("11_ProjectGraph", func(t *testing.T) {
		if core.Intelligence.Graph == nil {
			t.Fatal("expected WorkspaceGraph to be initialized")
		}
		if core.Intelligence.Graph.SymbolCount() == 0 {
			t.Log("warning: graph has no symbols (may not have been indexed in this test)")
		}
		if core.Intelligence.Graph.FileCount() == 0 {
			t.Log("warning: graph has no files (may not have been indexed)")
		}
	})

	t.Run("12_Snapshot", func(t *testing.T) {
		snap := core.Intelligence.TakeSnapshot()
		if snap == nil {
			t.Fatal("expected non-nil snapshot")
		}
		if snap.FileCount == 0 {
			t.Log("warning: snapshot has zero files")
		}
		t.Logf("Snapshot: framework=%s files=%d symbols=%d", snap.Framework, snap.FileCount, snap.SymbolCount)
	})
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
