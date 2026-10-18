package agentengine

import (
	"context"
	"testing"
	"time"

	"github.com/Haslab-dev/RakitKode/decisions"
	"github.com/Haslab-dev/RakitKode/events"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/messaging"
)

// newTestEngine composes a real engine rooted in a temp dir (offline: no
// providers, no MCP servers).
func newTestEngine(t *testing.T) *Engine {
	t.Helper()
	e, err := New(t.TempDir(), t.TempDir())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return e
}

func TestNewEngineComposition(t *testing.T) {
	e := newTestEngine(t)
	if e.AgentMgr == nil || e.LLMClient == nil || e.ToolReg == nil || e.SkillMgr == nil ||
		e.PluginMgr == nil || e.MemoryMgr == nil || e.MCPMgr == nil || e.Bus == nil {
		t.Fatal("engine managers must be composed")
	}
	st := e.Status()
	if st.ToolCount == 0 {
		t.Fatal("expected built-in tools to be registered")
	}
	if st.DataDir == "" || st.Workspace == "" {
		t.Fatalf("status missing dirs: %+v", st)
	}
}

func TestStandaloneSessionLifecycle(t *testing.T) {
	e := newTestEngine(t)
	sess, err := e.AgentMgr.CreateSession("test", "", e.workspace)
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	if sess.ID == "" {
		t.Fatal("session ID empty")
	}
	if _, ok := e.AgentMgr.GetSession(sess.ID); !ok {
		t.Fatal("created session not found")
	}
	found := false
	for _, s := range e.AgentMgr.ListSessions() {
		if s.ID == sess.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("session missing from ListSessions")
	}
	e.AgentMgr.DeleteSession(sess.ID)
	if _, ok := e.AgentMgr.GetSession(sess.ID); ok {
		t.Fatal("session still present after delete")
	}
}

func TestEnsureSessionMapping(t *testing.T) {
	e := newTestEngine(t)
	const web = "web-session-1"

	rid1, err := e.EnsureSession(web, "")
	if err != nil {
		t.Fatalf("EnsureSession: %v", err)
	}
	rid2, err := e.EnsureSession(web, "")
	if err != nil {
		t.Fatalf("EnsureSession (2nd): %v", err)
	}
	if rid1 != rid2 {
		t.Fatalf("mapping not stable: %s vs %s", rid1, rid2)
	}
	if rid1 == web {
		t.Fatal("engine session ID must differ from gateway ID")
	}
	if got := e.ResolveEventSession(rid1); got != web {
		t.Fatalf("ResolveEventSession = %q, want %q", got, web)
	}
	// Standalone engine session (not mapped) resolves to itself.
	if got := e.ResolveEventSession(rid1 + "-other"); got != rid1+"-other" {
		t.Fatalf("unmapped ID must pass through, got %q", got)
	}
}

func TestBridgeEventMapping(t *testing.T) {
	e := newTestEngine(t)
	bus := messaging.NewEventBus()
	bridge := e.AttachBridge(bus)
	defer bridge.Stop()

	results := make(chan AssistantResult, 4)
	bridge.OnAssistant = func(r AssistantResult) { results <- r }

	sub := bus.Subscribe("web-conv-1")
	defer bus.Unsubscribe(sub.ID)

	// Simulate a mapped engine session.
	const engineID = "engine-session-9"
	e.mu.Lock()
	e.sessions["web-conv-1"] = engineID
	e.mu.Unlock()

	pub := func(t events.EventType, data map[string]interface{}) {
		if data == nil {
			data = map[string]interface{}{}
		}
		data["session_id"] = engineID
		e.Bus.Publish(events.Event{Type: t, Data: data})
	}

	pub(events.AgentTurnStart, nil)
	pub(events.AgentMessageDelta, map[string]interface{}{"kind": "text", "delta": "Hello"})
	pub(events.AgentMessageDelta, map[string]interface{}{"kind": "text", "delta": ", world"})
	pub(events.AgentThinkingDelta, map[string]interface{}{"delta": "reasoning"})
	pub(events.AgentToolStart, map[string]interface{}{"name": "read_file", "tool_call_id": "call-1"})
	pub(events.AgentToolEnd, map[string]interface{}{"name": "read_file", "tool_call_id": "call-1", "result": "ok", "is_error": false})
	pub(events.AgentTurnEnd, map[string]interface{}{"error": ""})

	seen := map[messaging.EventType]int{}
	for {
		var ev messaging.Event
		select {
		case ev = <-sub.Ch:
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for events (seen=%v)", seen)
		}
		seen[ev.Type]++
		if ev.SessionID != "web-conv-1" {
			t.Fatalf("event %s: session not rewritten: %q", ev.Type, ev.SessionID)
		}
		switch ev.Type {
		case messaging.EventAgentTextDelta:
			d, ok := ev.Payload.(messaging.TextDeltaPayload)
			if !ok {
				t.Fatalf("text delta payload type = %T", ev.Payload)
			}
			if d.Delta != "Hello" && d.Delta != ", world" {
				t.Fatalf("unexpected delta %q", d.Delta)
			}
		case messaging.EventAgentToolCall:
			p := ev.Payload.(messaging.ToolCallPayload)
			if p.Tool != "read_file" || p.ID != "call-1" {
				t.Fatalf("tool call payload: %+v", p)
			}
		case messaging.EventAgentToolResult:
			p := ev.Payload.(messaging.ToolResultPayload)
			if p.Output != "ok" || p.Status != "success" {
				t.Fatalf("tool result payload: %+v", p)
			}
		case messaging.EventAgentCompleted:
			// Final mapped event of the simulated turn.
			m, ok := ev.Payload.(map[string]interface{})
			if !ok || m["content"] != "Hello, world" {
				t.Fatalf("completed payload: %#v", ev.Payload)
			}
			want := map[messaging.EventType]int{
				messaging.EventAgentStarted:       1,
				messaging.EventAgentTextDelta:     2,
				messaging.EventAgentThinkingDelta: 1,
				messaging.EventAgentToolCall:      1,
				messaging.EventAgentToolResult:    1,
				messaging.EventAgentCompleted:     1,
			}
			for typ, n := range want {
				if seen[typ] != n {
					t.Fatalf("event %s: got %d, want %d (seen=%v)", typ, seen[typ], n, seen)
				}
			}
			select {
			case r := <-results:
				if r.SessionID != "web-conv-1" || r.EngineID != engineID {
					t.Fatalf("assistant result sessions: %+v", r)
				}
				if r.Content != "Hello, world" {
					t.Fatalf("assistant content = %q", r.Content)
				}
				if r.Thought != "reasoning" {
					t.Fatalf("assistant thought = %q", r.Thought)
				}
				if r.Failed {
					t.Fatal("turn must not be failed")
				}
			default:
				t.Fatal("OnAssistant hook not called")
			}
			return
		}
	}
}

func TestBridgeFailedTurn(t *testing.T) {
	e := newTestEngine(t)
	bus := messaging.NewEventBus()
	bridge := e.AttachBridge(bus)
	defer bridge.Stop()

	results := make(chan AssistantResult, 4)
	bridge.OnAssistant = func(r AssistantResult) { results <- r }
	sub := bus.Subscribe("web-err")
	defer bus.Unsubscribe(sub.ID)

	const engineID = "engine-session-err"
	e.mu.Lock()
	e.sessions["web-err"] = engineID
	e.mu.Unlock()

	e.Bus.Publish(events.Event{Type: events.AgentTurnEnd, Data: map[string]interface{}{
		"session_id": engineID,
		"error":      "boom",
	}})

	select {
	case ev := <-sub.Ch:
		if ev.Type != messaging.EventAgentFailed {
			t.Fatalf("want agent.failed, got %s", ev.Type)
		}
		if msg, ok := ev.Payload.(string); !ok || msg != "boom" {
			t.Fatalf("failed payload = %#v", ev.Payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no failure event")
	}

	select {
	case r := <-results:
		if !r.Failed || r.Error != "boom" {
			t.Fatalf("assistant result: %+v", r)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("OnAssistant not called on failure")
	}
}

func TestSyncProvidersActivatesDefault(t *testing.T) {
	e := newTestEngine(t)
	activeID, activeModel := e.SyncProviders([]ProviderInput{
		{ID: "kenari", Name: "Kenari", Type: "custom", APIKey: "sk-test", Endpoint: "https://example.com/v1", Models: []string{"kenari-large"}, Enabled: true},
		{ID: "fallback", Name: "Fallback", Type: "openai", APIKey: "sk-2", Endpoint: "https://fallback/v1", Models: []string{"gpt-test"}, Enabled: true, IsDefault: true},
	})
	if activeID != "fallback" || activeModel != "gpt-test" {
		t.Fatalf("active = %s/%s, want fallback/gpt-test", activeID, activeModel)
	}
	cfg := e.LLMClient.GetConfig()
	if cfg.ProviderID != "fallback" || cfg.Model != "gpt-test" || cfg.APIKey != "sk-2" {
		t.Fatalf("active profile not applied: %+v", cfg)
	}
	profiles := e.LLMClient.GetProviderProfiles()
	if len(profiles) != 2 {
		t.Fatalf("profiles = %d, want 2", len(profiles))
	}
}

func TestEnabledFlag(t *testing.T) {
	if Enabled() {
		t.Skip("config.Cfg initialized with kind=rakit elsewhere; skip")
	}
}

func TestDecisionEngineDefaultsAndJevToggle(t *testing.T) {
	// 1. Verify default engine has Pandu-Micro and Jev disabled
	config.Cfg = &config.Config{
		Engine: config.EngineConfig{
			EnableJev: false,
		},
	}
	e := newTestEngine(t)
	st := e.Status()

	if st.DecisionModel != "pandu-micro" {
		t.Fatalf("expected decision model 'pandu-micro', got %q", st.DecisionModel)
	}
	if st.JevEnabled {
		t.Fatal("expected Jev to be disabled by default")
	}
	if st.DecisionMode != string(decisions.ModeLocalOnly) {
		t.Fatalf("expected mode %q, got %q", decisions.ModeLocalOnly, st.DecisionMode)
	}

	// 2. Verify with EnableJev: true, mode switches to cascade
	config.Cfg = &config.Config{
		Engine: config.EngineConfig{
			EnableJev:   true,
			JevApiKey:   "test-key",
			JevEndpoint: "https://jev.typesafe.ai/v1",
		},
	}
	e2 := newTestEngine(t)
	st2 := e2.Status()

	if !st2.JevEnabled {
		t.Fatal("expected Jev to be enabled when configured")
	}
	if st2.DecisionMode != string(decisions.ModeCascade) {
		t.Fatalf("expected mode %q, got %q", decisions.ModeCascade, st2.DecisionMode)
	}
	if st2.DecisionModel != "pandu-micro" {
		t.Fatalf("expected local decision model to remain 'pandu-micro', got %q", st2.DecisionModel)
	}
}

func TestDecisionEngine_PanduMicroOfflineRouting(t *testing.T) {
	config.Cfg = &config.Config{
		Engine: config.EngineConfig{
			EnableJev: false,
		},
	}
	e := newTestEngine(t)

	// 1. Adapter routing verifies Pandu-Micro
	adapter := e.AgentMgr.GetDecisionAdapter()
	if adapter == nil {
		t.Fatal("expected decision adapter on AgentMgr")
	}

	ctx := context.Background()
	tools := decisions.StandardBenchmarkTools()
	routed, dec := adapter.Route(ctx, "implement unit test for neural decisions in adapter.go", tools)
	if dec == nil {
		t.Fatal("expected route decision")
	}
	if dec.Model != "pandu-micro" {
		t.Errorf("expected decision model 'pandu-micro', got %q", dec.Model)
	}
	if dec.Category != "modify" {
		t.Errorf("expected category 'modify', got %q", dec.Category)
	}
	if len(routed) == 0 {
		t.Error("expected filtered tools to be non-empty")
	}

	// 2. DecideSubagentRole specifies Pandu-Micro source
	roleDec := e.AgentMgr.DecideSubagentRole("conduct research and investigate code security")
	if roleDec == nil {
		t.Fatal("expected role decision")
	}
	if roleDec.Source != "pandu-micro" {
		t.Errorf("expected role decision source 'pandu-micro', got %q", roleDec.Source)
	}
	if roleDec.Role != "research" {
		t.Errorf("expected role 'research', got %q", roleDec.Role)
	}
}

