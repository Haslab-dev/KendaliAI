package agentengine

import (
	"strings"
	"sync"

	"github.com/Haslab-dev/RakitKode/events"

	"github.com/kendaliai/app/internal/messaging"
)

// AssistantResult is the final outcome of one engine turn, delivered to the
// OnAssistant hook so the host process can persist it (gateway session
// store, Telegram delivery, ...).
type AssistantResult struct {
	SessionID string // gateway session ID
	EngineID  string // underlying engine session ID
	Content   string // accumulated assistant text
	Thought   string // accumulated reasoning text
	Model     string
	Failed    bool
	Error     string
}

// Bridge forwards RakitKode engine bus events onto the gateway messaging bus,
// rewriting event types/payloads to the shapes the builtin gateway runtime
// publishes (agent.started, agent.text.delta, agent.tool_call, ...), so
// existing WebSocket and Telegram consumers work unchanged.
type Bridge struct {
	engine *Engine
	bus    *messaging.EventBus
	unsubs []func()

	// per-engine-session turn accumulation for the assistant result
	accMu    sync.Mutex
	accText  map[string]*strings.Builder
	accThink map[string]*strings.Builder

	// OnAssistant fires once per finished turn (success or failure).
	OnAssistant func(AssistantResult)
}

// AttachBridge subscribes the engine bus to the gateway bus. Call once after
// New; events flow until Stop is called.
func (e *Engine) AttachBridge(bus *messaging.EventBus) *Bridge {
	b := &Bridge{
		engine:   e,
		bus:      bus,
		accText:  make(map[string]*strings.Builder),
		accThink: make(map[string]*strings.Builder),
	}

	type sub struct {
		ev events.EventType
		fn func(events.Event)
	}
	subs := []sub{
		{events.AgentTurnStart, b.onTurnStart},
		{events.AgentMessageDelta, b.onMessageDelta},
		{events.AgentThinkingDelta, b.onThinkingDelta},
		{events.AgentToolStart, b.onToolStart},
		{events.AgentToolEnd, b.onToolEnd},
		{events.AgentAsk, b.onAsk},
		{events.AgentTurnEnd, b.onTurnEnd},
	}
	for _, s := range subs {
		s := s
		b.unsubs = append(b.unsubs, e.Bus.Subscribe(s.ev, s.fn))
	}
	return b
}

// Stop unsubscribes all bridge handlers.
func (b *Bridge) Stop() {
	for _, u := range b.unsubs {
		u()
	}
	b.unsubs = nil
}

func (b *Bridge) resolve(ev events.Event) (string, messaging.EventType) {
	engineID, _ := ev.Data["session_id"].(string)
	return b.engine.ResolveEventSession(engineID), messaging.EventType(ev.Type)
}

func (b *Bridge) publish(sessionID string, t messaging.EventType, payload interface{}) {
	b.bus.Publish(messaging.Event{
		Type:      t,
		SessionID: sessionID,
		Channel:   "web",
		Payload:   payload,
	})
}

// accumulator returns (creating on demand) the text/thinking builders for an
// engine session. Turn start is not guaranteed to be observed (e.g. events
// published before the bridge attached, or engine paths that skip it), so
// accumulation must tolerate missing init.
func (b *Bridge) accumulator(k string) (text, think *strings.Builder) {
	b.accMu.Lock()
	defer b.accMu.Unlock()
	if b.accText[k] == nil {
		b.accText[k] = &strings.Builder{}
	}
	if b.accThink[k] == nil {
		b.accThink[k] = &strings.Builder{}
	}
	return b.accText[k], b.accThink[k]
}

func (b *Bridge) onTurnStart(ev events.Event) {
	sid, _ := b.resolve(ev)
	b.accumulator(keyOf(ev))
	b.publish(sid, messaging.EventAgentStarted, map[string]interface{}{
		"engine": "rakit",
		"model":  b.engine.LLMClient.GetConfig().Model,
	})
}

func (b *Bridge) onMessageDelta(ev events.Event) {
	sid, _ := b.resolve(ev)
	kind, _ := ev.Data["kind"].(string)
	delta, _ := ev.Data["delta"].(string)
	text, think := b.accumulator(keyOf(ev))
	if kind == "thinking" {
		// Reasoning deltas may ride on message_delta for some models.
		think.WriteString(delta)
		b.publish(sid, messaging.EventAgentThinkingDelta, messaging.ThinkingDeltaPayload{Delta: delta})
		return
	}
	text.WriteString(delta)
	b.publish(sid, messaging.EventAgentTextDelta, messaging.TextDeltaPayload{Delta: delta})
}

func (b *Bridge) onThinkingDelta(ev events.Event) {
	sid, _ := b.resolve(ev)
	delta, _ := ev.Data["delta"].(string)
	_, think := b.accumulator(keyOf(ev))
	think.WriteString(delta)
	b.publish(sid, messaging.EventAgentThinkingDelta, messaging.ThinkingDeltaPayload{Delta: delta})
}

func (b *Bridge) onToolStart(ev events.Event) {
	sid, _ := b.resolve(ev)
	name, _ := ev.Data["name"].(string)
	callID, _ := ev.Data["tool_call_id"].(string)
	args, _ := ev.Data["args"].(map[string]interface{})
	b.publish(sid, messaging.EventAgentToolCall, messaging.ToolCallPayload{
		ID:        callID,
		Tool:      name,
		Arguments: args,
	})
}

func (b *Bridge) onToolEnd(ev events.Event) {
	sid, _ := b.resolve(ev)
	name, _ := ev.Data["name"].(string)
	callID, _ := ev.Data["tool_call_id"].(string)
	result, _ := ev.Data["result"].(string)
	isErr, _ := ev.Data["is_error"].(bool)
	status := "success"
	if isErr {
		status = "error"
	}
	b.publish(sid, messaging.EventAgentToolResult, messaging.ToolResultPayload{
		ID:     callID,
		Tool:   name,
		Output: result,
		Status: status,
	})
}

func (b *Bridge) onAsk(ev events.Event) {
	sid, _ := b.resolve(ev)
	name, _ := ev.Data["name"].(string)
	callID, _ := ev.Data["tool_call_id"].(string)
	args, _ := ev.Data["args"].(map[string]interface{})
	b.publish(sid, messaging.EventApprovalRequested, messaging.ApprovalRequestPayload{
		RequestID: callID,
		SessionID: sid,
		Tool:      name,
		Arguments: args,
	})
}

func (b *Bridge) onTurnEnd(ev events.Event) {
	k := keyOf(ev)
	sid, _ := b.resolve(ev)
	errMsg, _ := ev.Data["error"].(string)

	b.accMu.Lock()
	textSB := b.accText[k]
	thinkSB := b.accThink[k]
	delete(b.accText, k)
	delete(b.accThink, k)
	b.accMu.Unlock()

	content := ""
	if textSB != nil {
		content = textSB.String()
	}
	thought := ""
	if thinkSB != nil {
		thought = thinkSB.String()
	}

	engineID := b.engine.engineSessionForChecked(sid)
	if hook := b.OnAssistant; hook != nil {
		hook(AssistantResult{
			SessionID: sid,
			EngineID:  engineID,
			Content:   content,
			Thought:   thought,
			Model:     b.engine.LLMClient.GetConfig().Model,
			Failed:    errMsg != "",
			Error:     errMsg,
		})
	}

	if errMsg != "" {
		b.publish(sid, messaging.EventAgentFailed, errMsg)
		return
	}
	b.publish(sid, messaging.EventAgentCompleted, map[string]interface{}{
		"sessionId": sid,
		"content":   content,
		"thought":   thought,
		"model":     b.engine.LLMClient.GetConfig().Model,
		"engine":    "rakit",
	})
}

// engineSessionForChecked is engineSessionFor tolerating unmapped IDs
// (standalone engine sessions map to themselves).
func (e *Engine) engineSessionForChecked(sessionID string) string {
	if rid, ok := e.engineSessionFor(sessionID); ok {
		return rid
	}
	return sessionID
}

// keyOf derives the accumulation key from the event's engine session ID
// (the raw one, before gateway rewriting).
func keyOf(ev events.Event) string {
	if s, ok := ev.Data["session_id"].(string); ok {
		return s
	}
	return ""
}
