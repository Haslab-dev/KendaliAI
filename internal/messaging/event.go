package messaging

import (
	"time"
)

type EventType string

const (
	EventMessageCreated     EventType = "message.created"
	EventMessageCompleted   EventType = "message.completed"
	EventAgentStarted       EventType = "agent.started"
	EventAgentThinking      EventType = "agent.thinking"
	EventAgentThinkingDelta EventType = "agent.thinking.delta"
	EventAgentTextDelta     EventType = "agent.text.delta"
	EventAgentToolCall      EventType = "agent.tool_call"
	EventAgentToolResult    EventType = "agent.tool_result"
	EventAgentCompleted     EventType = "agent.completed"
	EventAgentFailed        EventType = "agent.failed"
	EventApprovalRequested   EventType = "approval.requested"
	EventApprovalGranted    EventType = "approval.granted"
	EventApprovalDenied     EventType = "approval.denied"
	EventSessionCreated     EventType = "session.created"
	EventSessionUpdated     EventType = "session.updated"
)

type MessageEvent struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	AgentID   string    `json:"agentId"`
	UserID    string    `json:"userId,omitempty"`
	Channel   string    `json:"channel"`   // web, telegram, api, cli
	Direction string    `json:"direction"` // inbound, outbound
	Role      string    `json:"role,omitempty"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

type ToolCallPayload struct {
	ID        string                 `json:"id"`
	Tool      string                 `json:"tool"`
	Arguments map[string]interface{} `json:"arguments"`
}

type ToolResultPayload struct {
	ID         string `json:"id"`
	Tool       string `json:"tool"`
	Output     string `json:"output"`
	Status     string `json:"status"` // success, error, denied
	DurationMs int64  `json:"durationMs"`
}

type TextDeltaPayload struct {
	Delta string `json:"delta"`
}

type ThinkingDeltaPayload struct {
	Delta string `json:"delta"`
}

type ApprovalRequestPayload struct {
	RequestID string                 `json:"requestId"`
	SessionID string                 `json:"sessionId"`
	AgentID   string                 `json:"agentId"`
	Tool      string                 `json:"tool"`
	Arguments map[string]interface{} `json:"arguments"`
}

type Event struct {
	ID        string      `json:"id"`
	Type      EventType   `json:"type"`
	SessionID string      `json:"sessionId"`
	AgentID   string      `json:"agentId,omitempty"`
	Channel   string      `json:"channel,omitempty"`
	Payload   interface{} `json:"payload,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}
