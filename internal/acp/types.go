// Package acp implements a client for the Agent Client Protocol (ACP):
// JSON-RPC 2.0 over stdio to external coding agents (claude-code-acp, gemini
// --experimental-acp, codex-acp, ...). The manager spawns agents as child
// processes, drives the initialize / session/new / session/prompt lifecycle,
// and translates protocol updates onto the shared messaging.EventBus using
// the same event names the gateway runtime emits — so the web UI streams ACP
// turns through the exact same pipe as native turns.
package acp

import "encoding/json"

// ---- JSON-RPC 2.0 wire types ----------------------------------------------

type rpcRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      *int64      `json:"id,omitempty"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

type rpcError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

func (e *rpcError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      *int64          `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcNotification struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// ---- ACP protocol types (agent client protocol v1) ------------------------

// InitializeParams is sent once after spawn.
type InitializeParams struct {
	ProtocolVersion    int                `json:"protocolVersion"`
	ClientCapabilities ClientCapabilities `json:"clientCapabilities"`
}

// ClientCapabilities advertises what this client provides. Kendali declares
// no client-side filesystem: agents use their own tools.
type ClientCapabilities struct {
	FS ClientFS `json:"fs"`
}

type ClientFS struct {
	ReadTextFile  bool `json:"readTextFile"`
	WriteTextFile bool `json:"writeTextFile"`
}

type InitializeResult struct {
	ProtocolVersion   int             `json:"protocolVersion"`
	AgentCapabilities json.RawMessage `json:"agentCapabilities,omitempty"`
	AuthMethods       []AuthMethod    `json:"authMethods,omitempty"`
}

type AuthMethod struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// SessionNewParams starts a provider session inside the agent process.
type SessionNewParams struct {
	CWD        string        `json:"cwd"`
	MCPServers []interface{} `json:"mcpServers"`
}

type SessionNewResult struct {
	SessionID string `json:"sessionId"`
}

// ContentBlock is the ACP content union; kendali only consumes text blocks.
type ContentBlock struct {
	Type string `json:"type"` // "text" | "image" | "audio" | "resource_link" | "resource"
	Text string `json:"text,omitempty"`
}

// PromptParams sends one user turn.
type PromptParams struct {
	SessionID string         `json:"sessionId"`
	Prompt    []ContentBlock `json:"prompt"`
}

type PromptResult struct {
	StopReason string `json:"stopReason"`
}

// sessionUpdateWire decodes the `session/update` notification payload. The
// ACP union reuses the `content` field: a single object for message/thought
// chunks, an array of blocks for tool_call payloads — so it stays raw here
// and the manager interprets it per update kind.
type sessionUpdateWire struct {
	SessionUpdate string          `json:"sessionUpdate"`
	Content       json.RawMessage `json:"content"`
	ToolCallID    string          `json:"toolCallId"`
	Title         string          `json:"title"`
	Kind          string          `json:"kind"`
	Status        string          `json:"status"`
	RawInput      json.RawMessage `json:"rawInput"`
	RawOutput     json.RawMessage `json:"rawOutput"`
}

type SessionUpdateParams struct {
	SessionID string            `json:"sessionId"`
	Update    sessionUpdateWire `json:"update"`
}

// RequestPermissionParams arrives as a server→client request mid-turn.
type RequestPermissionParams struct {
	SessionID string             `json:"sessionId"`
	ToolCall  ToolCallInfo       `json:"toolCall"`
	Options   []PermissionOption `json:"options"`
}

type ToolCallInfo struct {
	ToolCallID string `json:"toolCallId"`
	Title      string `json:"title,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Status     string `json:"status,omitempty"`
}

type PermissionOption struct {
	OptionID string `json:"optionId"`
	Name     string `json:"name"`
	Kind     string `json:"kind"` // allow_once | allow_always | reject_once | reject_always
}

type PermissionOutcome struct {
	Outcome  string `json:"outcome"` // "selected" | "cancelled"
	OptionID string `json:"optionId,omitempty"`
}

type RequestPermissionResult struct {
	Outcome PermissionOutcome `json:"outcome"`
}

// CancelParams is sent as a notification to interrupt the current turn.
type CancelParams struct {
	SessionID string `json:"sessionId"`
}
