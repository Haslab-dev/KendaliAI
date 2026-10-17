package gateway

import (
	"context"
	"strings"
	"testing"

	"github.com/kendaliai/app/internal/messaging"
)

func TestSubagentToolDefinitions(t *testing.T) {
	bus := messaging.NewEventBus()
	rt := &Runtime{
		taskMgr: NewTaskManager(bus),
		bus:     bus,
	}

	spawnTool := rt.SpawnSubagentTool("parent-sess-1")
	if spawnTool.Name != "spawn_subagent" {
		t.Fatalf("expected tool name spawn_subagent, got %s", spawnTool.Name)
	}
	if spawnTool.Category != "orchestration" {
		t.Fatalf("expected category orchestration, got %s", spawnTool.Category)
	}

	deepTool := rt.DeepSearchTool("parent-sess-1")
	if deepTool.Name != "deep_search" {
		t.Fatalf("expected tool name deep_search, got %s", deepTool.Name)
	}
	if deepTool.Category != "research" {
		t.Fatalf("expected category research, got %s", deepTool.Category)
	}
}

func TestSpawnSubagentValidation(t *testing.T) {
	bus := messaging.NewEventBus()
	rt := &Runtime{
		taskMgr: NewTaskManager(bus),
		bus:     bus,
	}
	spawnTool := rt.SpawnSubagentTool("parent-sess-1")

	// 1. Empty task argument
	res := spawnTool.Execute(context.Background(), map[string]interface{}{})
	if !strings.Contains(res, "requires a non-empty 'task'") {
		t.Fatalf("expected non-empty task error, got: %s", res)
	}

	// 2. Recursive invocation inside subtask session
	childSpawnTool := rt.SpawnSubagentTool(SubagentSessionPrefix + "abc12345")
	res = childSpawnTool.Execute(context.Background(), map[string]interface{}{"task": "do deep work"})
	if !strings.Contains(res, "cannot be called from within a sub-agent session") {
		t.Fatalf("expected recursion error, got: %s", res)
	}
}

func TestDeepSearchValidation(t *testing.T) {
	bus := messaging.NewEventBus()
	rt := &Runtime{
		taskMgr: NewTaskManager(bus),
		bus:     bus,
	}
	deepTool := rt.DeepSearchTool("parent-sess-1")

	// 1. Empty query argument
	res := deepTool.Execute(context.Background(), map[string]interface{}{})
	if !strings.Contains(res, "requires a non-empty 'query'") {
		t.Fatalf("expected non-empty query error, got: %s", res)
	}

	// 2. Recursive invocation
	childDeepTool := rt.DeepSearchTool(SubagentSessionPrefix + "abc12345")
	res = childDeepTool.Execute(context.Background(), map[string]interface{}{"query": "research something"})
	if !strings.Contains(res, "cannot be called from within a sub-agent session") {
		t.Fatalf("expected recursion error, got: %s", res)
	}
}

func TestTrivialReportContent(t *testing.T) {
	// 1. Empty or short content is trivial
	if !trivialReportContent("") {
		t.Fatal("empty string should be trivial")
	}
	if !trivialReportContent("Done.") {
		t.Fatal("short string should be trivial")
	}

	// 2. Tool loop stub
	stub := "Completed executing tool actions. The agent has finished running the bash command and reading files."
	if !trivialReportContent(stub) {
		t.Fatal("tool loop stub should be trivial")
	}

	// 3. Real substantial deliverable is NOT trivial
	realReport := `## Architecture Research Deliverable
We analyzed the memory management of the harness engine across goroutines.
The investigation reveals three core findings:
1. Mutex contention is negligible under concurrent tool dispatch.
2. The context cancellation properly cascades to all spawned child goroutines.
3. Memory consumption stays capped under 128 MB throughout continuous turns.`
	if trivialReportContent(realReport) {
		t.Fatal("substantial report should NOT be trivial")
	}
}

func TestTaskManagerLifecycle(t *testing.T) {
	bus := messaging.NewEventBus()
	mgr := NewTaskManager(bus)
	canceled := false
	cancel := func() { canceled = true }

	task := mgr.Register("subtask_123", "coder", "🛰 Coding Subtask", cancel)
	if task.ID == "" || task.Status != "running" {
		t.Fatalf("invalid registered task: %+v", task)
	}

	// Cancel task via manager
	if err := mgr.Cancel(task.ID); err != nil {
		t.Fatalf("failed to cancel task: %v", err)
	}
	if !canceled {
		t.Fatal("expected cancel callback to be invoked")
	}

	// Complete task
	task2 := mgr.Register("subtask_456", "researcher", "🛰 Research Subtask", nil)
	mgr.Complete(task2.ID, "Final deliverable report")
	list := mgr.List()
	if len(list) < 2 {
		t.Fatalf("expected at least 2 tasks in list, got: %+v", list)
	}
}
