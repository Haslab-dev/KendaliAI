package acp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/gateway"
	"github.com/kendaliai/app/internal/messaging"
)

const (
	// SessionPrefix marks kendali sessions backed by an ACP agent process.
	SessionPrefix = "acp_"
	// permissionTimeout bounds how long a permission request stays open.
	permissionTimeout = 15 * time.Minute
)

// SessionInfo is the JSON projection of an ACP-backed session for the UI.
type SessionInfo struct {
	ID           string `json:"id"`
	AgentID      string `json:"agentId"`
	AgentName    string `json:"agentName"`
	Title        string `json:"title"`
	CWD          string `json:"cwd"`
	Model        string `json:"model,omitempty"`
	Status       string `json:"status"` // idle | running | awaiting_permission | error | closed
	AutoApprove  bool   `json:"autoApprove"`
	ACPSessionID string `json:"acpSessionId,omitempty"`
	PromptCount  int    `json:"promptCount"`
	CreatedAt    int64  `json:"createdAt"`
	UpdatedAt    int64  `json:"updatedAt"`
	Running      bool   `json:"running"`
}

// PendingPermission is one open session/request_permission.
type PendingPermission struct {
	RequestID  string             `json:"requestId"`
	SessionID  string             `json:"sessionId"`
	ToolCallID string             `json:"toolCallId"`
	Title      string             `json:"title"`
	Kind       string             `json:"kind"`
	Options    []PermissionOption `json:"options"`
	CreatedAt  int64              `json:"createdAt"`

	outcome chan PermissionOutcome
}

// liveSession couples one kendali session id to its spawned agent process
// and the in-flight turn state needed to assemble the final transcript row.
type liveSession struct {
	SessionID      string
	AgentSessionID string
	agent          AgentDescriptor
	cwd            string
	model          string
	autoApprove    bool
	status         string
	protocol       string // "acp" or "agy-stream"
	promptCount    int
	client         *Client
	cancel         context.CancelFunc
	createdAt      int64
	updatedAt      int64

	permMu  sync.Mutex
	perms   map[string]*PendingPermission
	permSeq int

	turnMu     sync.Mutex
	turnActive bool
	turnDoneCh chan struct{}
	content    strings.Builder
	thought    strings.Builder
	toolOrder  []string
	tools      map[string]*gateway.ToolCallRecord
}

func (l *liveSession) setStatus(s string) {
	l.status = s
	l.updatedAt = time.Now().Unix()
}

// Manager owns every live ACP agent process and their kendali session
// records. It satisfies the "forgeADE agents, on a server" goal: external
// ACP agents run as managed children of the gateway and stream into the
// browser through the standard event bus.
type Manager struct {
	mu       sync.RWMutex
	live     map[string]*liveSession
	store    *gateway.Store
	bus      *messaging.EventBus
	registry *registry
	workRoot string
}

func NewManager(store *gateway.Store, bus *messaging.EventBus, workRoot string, cfg *config.Config) *Manager {
	return &Manager{
		live:     make(map[string]*liveSession),
		store:    store,
		bus:      bus,
		registry: newRegistry(cfg),
		workRoot: workRoot,
	}
}

// ---- Agents ----------------------------------------------------------------

func (m *Manager) Agents() []AgentDescriptor {
	return m.registry.list()
}

func (m *Manager) IsACPAgent(id string) bool {
	if m == nil || m.registry == nil {
		return false
	}
	return m.registry.IsACPAgent(id)
}

func (m *Manager) GetAgent(id string) (AgentDescriptor, error) {
	if m == nil || m.registry == nil {
		return AgentDescriptor{}, fmt.Errorf("acp manager not initialized")
	}
	return m.registry.Get(id)
}

// ---- Session lifecycle -----------------------------------------------------

// StartSession spawns the agent process, performs the ACP handshake, and
// persists a kendali session record so the transcript survives restarts.
func (m *Manager) StartSession(agentID, cwd, model string, autoApprove bool) (*SessionInfo, error) {
	return m.startSessionInternal("", agentID, cwd, model, autoApprove)
}

// EnsureSession ensures an ACP process is running for the given sessionID.
func (m *Manager) EnsureSession(sessionID, agentID, cwd, model string) error {
	if live := m.getLive(sessionID); live != nil {
		if model != "" && model != live.model {
			live.model = model
			if live.protocol != "agy-stream" && live.client != nil {
				_ = live.client.Notify("session/set_model", map[string]string{
					"sessionId": live.AgentSessionID,
					"modelId":   model,
				})
				_ = live.client.Notify("session/set_config_option", map[string]interface{}{
					"sessionId": live.AgentSessionID,
					"configId":  "model",
					"value":     model,
				})
			}
			m.persistMeta(live)
		}
		return nil
	}
	_, err := m.startSessionInternal(sessionID, agentID, cwd, model, false)
	return err
}

func (m *Manager) startSessionInternal(customID, agentID, cwd, model string, autoApprove bool) (*SessionInfo, error) {
	agentDesc, err := m.registry.get(agentID)
	if err != nil {
		return nil, err
	}
	if !agentDesc.Available {
		return nil, fmt.Errorf("acp: agent %q is not installed (command %q not found in PATH)", agentID, agentDesc.Command)
	}
	if cwd == "" {
		cwd = m.workRoot
	}
	if fi, err := os.Stat(cwd); err != nil || !fi.IsDir() {
		return nil, fmt.Errorf("acp: workspace %q is not a directory", cwd)
	}
	if model == "" {
		model = agentDesc.DefaultModel
	}

	kendaliID := customID
	if kendaliID == "" {
		kendaliID = SessionPrefix + uuid.New().String()[:8]
	}
	protocol := "acp"
	if strings.Contains(agentDesc.ID, "agy") || strings.Contains(agentDesc.ID, "antigravity") || strings.Contains(agentDesc.Command, "agy") {
		protocol = "agy-stream"
	}

	args := append([]string{}, agentDesc.Args...)
	if protocol == "agy-stream" {
		args = []string{"--input-format", "stream-json", "--output-format", "stream-json"}
		if model != "" && model != "default" {
			args = append(args, "--model", model)
		}
		args = append(args, "--dangerously-skip-permissions")
	}

	ctx, cancel := context.WithCancel(context.Background())
	client, err := Start(ctx, agentDesc.Command, args, cwd)
	if err != nil {
		cancel()
		return nil, err
	}

	live := &liveSession{
		SessionID:   kendaliID,
		agent:       agentDesc,
		cwd:         cwd,
		model:       model,
		autoApprove: autoApprove,
		status:      "idle",
		protocol:    protocol,
		client:      client,
		cancel:      cancel,
		createdAt:   time.Now().Unix(),
		updatedAt:   time.Now().Unix(),
		perms:       make(map[string]*PendingPermission),
		tools:       make(map[string]*gateway.ToolCallRecord),
	}

	client.SetHandlers(
		func(method string, params json.RawMessage) { m.handleNotification(live, method, params) },
		func(id int64, method string, params json.RawMessage) (interface{}, error) {
			return m.handleRequest(live, id, method, params)
		},
		func(err error) {
			// Process died: mark closed and notify listeners.
			m.mu.Lock()
			delete(m.live, live.SessionID)
			m.mu.Unlock()
			live.permMu.Lock()
			for _, p := range live.perms {
				select {
				case p.outcome <- PermissionOutcome{Outcome: "cancelled"}:
				default:
				}
			}
			live.permMu.Unlock()
			if live.status != "closed" {
				live.setStatus("closed")
				m.publishStatus(live)
			}
		},
	)

	if protocol == "agy-stream" {
		initCh := make(chan struct{}, 1)
		client.SetStreamHandler(func(event string, raw []byte) {
			m.handleStreamEvent(live, event, raw, initCh)
		})
		select {
		case <-initCh:
		case <-time.After(8 * time.Second):
		}
		if live.AgentSessionID == "" {
			live.AgentSessionID = "agy-" + kendaliID
		}
	} else {
		// ACP handshake: initialize, then session/new scoped to the workspace.
		initRes := InitializeResult{}
		if err := client.Call("initialize", InitializeParams{
			ProtocolVersion:    1,
			ClientCapabilities: ClientCapabilities{FS: ClientFS{ReadTextFile: false, WriteTextFile: false}},
		}, &initRes); err != nil {
			cancel()
			return nil, fmt.Errorf("acp: initialize failed for %q: %w", agentID, err)
		}
		newRes := SessionNewResult{}
		if err := client.Call("session/new", SessionNewParams{CWD: cwd, MCPServers: []interface{}{}}, &newRes); err != nil {
			cancel()
			return nil, fmt.Errorf("acp: session/new failed for %q: %w", agentID, err)
		}
		live.AgentSessionID = newRes.SessionID

		// Optional per-agent model selection (adapters that support it accept a
		// session/set_model or session/set_config_option; unknown methods fail soft).
		if model != "" && model != agentDesc.DefaultModel {
			_ = client.Notify("session/set_model", map[string]string{ //nolint:lll // best-effort extension point
				"sessionId": live.AgentSessionID,
				"modelId":   model,
			})
			_ = client.Notify("session/set_config_option", map[string]interface{}{
				"sessionId": live.AgentSessionID,
				"configId":  "model",
				"value":     model,
			})
		}
	}

	m.mu.Lock()
	m.live[kendaliID] = live
	m.mu.Unlock()

	// Persist or update the kendali-side session record (type=agent, engine=acp).
	meta := map[string]interface{}{
		"mode":          "agent",
		"engine":        "acp",
		"acpAgent":      agentDesc.ID,
		"acpSession":    live.AgentSessionID,
		"workspace":     cwd,
		"workspaceName": workspaceName(cwd),
		"model":         model,
		"autoApprove":   autoApprove,
	}
	metaJSON, _ := json.Marshal(meta)

	var sess gateway.Session
	existing, _ := m.store.GetSession(kendaliID)
	if existing != nil {
		sess = *existing
		var existingMeta map[string]interface{}
		if sess.Metadata != "" {
			_ = json.Unmarshal([]byte(sess.Metadata), &existingMeta)
		}
		if existingMeta == nil {
			existingMeta = make(map[string]interface{})
		}
		for k, v := range meta {
			existingMeta[k] = v
		}
		if data, err := json.Marshal(existingMeta); err == nil {
			sess.Metadata = string(data)
		}
		sess.Status = "active"
	} else {
		sess = gateway.Session{
			ID:        kendaliID,
			AgentID:   "lutfi",
			Title:     "New Task",
			Type:      "agent",
			ChannelID: "web",
			UserID:    "web",
			Status:    "active",
			Metadata:  string(metaJSON),
			CreatedAt: live.createdAt,
		}
	}

	if err := m.store.SaveSession(sess); err != nil {
		cancel()
		return nil, fmt.Errorf("acp: persist session: %w", err)
	}

	if existing == nil {
		m.bus.Publish(messaging.Event{Type: messaging.EventSessionCreated, SessionID: kendaliID, AgentID: sess.AgentID, Channel: "web", Payload: sess})
	} else {
		m.bus.Publish(messaging.Event{Type: messaging.EventSessionUpdated, SessionID: kendaliID, AgentID: sess.AgentID, Channel: "web", Payload: sess})
	}
	m.publishStatus(live)

	return m.sessionInfo(live), nil
}

// ResumeSession reconnects to an idle or closed ACP session using its saved
// remote conversation ID / session ID.
func (m *Manager) ResumeSession(sessionID string) (*SessionInfo, error) {
	if live := m.getLive(sessionID); live != nil {
		return m.sessionInfo(live), nil
	}

	sess, err := m.store.GetSession(sessionID)
	if err != nil || sess == nil {
		return nil, fmt.Errorf("acp: session %q not found", sessionID)
	}

	var meta map[string]interface{}
	if sess.Metadata != "" {
		_ = json.Unmarshal([]byte(sess.Metadata), &meta)
	}
	if meta == nil || meta["engine"] != "acp" {
		return nil, fmt.Errorf("acp: session %q is not an ACP session", sessionID)
	}

	agentID, _ := meta["acpAgent"].(string)
	acpSessionID, _ := meta["acpSession"].(string)
	cwd, _ := meta["workspace"].(string)
	model, _ := meta["model"].(string)
	autoApprove, _ := meta["autoApprove"].(bool)

	agentDesc, err := m.registry.get(agentID)
	if err != nil {
		return nil, err
	}
	if !agentDesc.Available {
		return nil, fmt.Errorf("acp: agent %q is not installed", agentID)
	}
	if cwd == "" {
		cwd = m.workRoot
	}
	if model == "" {
		model = agentDesc.DefaultModel
	}

	protocol := "acp"
	if strings.Contains(agentDesc.ID, "agy") || strings.Contains(agentDesc.ID, "antigravity") || strings.Contains(agentDesc.Command, "agy") {
		protocol = "agy-stream"
	}

	args := agentDesc.Args
	if protocol == "agy-stream" {
		args = []string{"--input-format", "stream-json", "--output-format", "stream-json"}
		if acpSessionID != "" {
			args = append(args, "--conversation", acpSessionID)
		}
		if model != "" && model != "default" {
			args = append(args, "--model", model)
		}
		args = append(args, "--dangerously-skip-permissions")
	}

	ctx, cancel := context.WithCancel(context.Background())
	client, err := Start(ctx, agentDesc.Command, args, cwd)
	if err != nil {
		cancel()
		return nil, err
	}

	live := &liveSession{
		SessionID:      sessionID,
		AgentSessionID: acpSessionID,
		agent:          agentDesc,
		cwd:            cwd,
		model:          model,
		autoApprove:    autoApprove,
		status:         "idle",
		protocol:       protocol,
		client:         client,
		cancel:         cancel,
		createdAt:      sess.CreatedAt,
		updatedAt:      time.Now().Unix(),
		perms:          make(map[string]*PendingPermission),
		tools:          make(map[string]*gateway.ToolCallRecord),
	}

	client.SetHandlers(
		func(method string, params json.RawMessage) { m.handleNotification(live, method, params) },
		func(id int64, method string, params json.RawMessage) (interface{}, error) {
			return m.handleRequest(live, id, method, params)
		},
		func(err error) {
			m.mu.Lock()
			delete(m.live, live.SessionID)
			m.mu.Unlock()
			live.permMu.Lock()
			for _, p := range live.perms {
				select {
				case p.outcome <- PermissionOutcome{Outcome: "cancelled"}:
				default:
				}
			}
			live.permMu.Unlock()
			if live.status != "closed" {
				live.setStatus("closed")
				m.publishStatus(live)
			}
		},
	)

	if protocol == "agy-stream" {
		initCh := make(chan struct{}, 1)
		client.SetStreamHandler(func(event string, raw []byte) {
			m.handleStreamEvent(live, event, raw, initCh)
		})
		select {
		case <-initCh:
		case <-time.After(8 * time.Second):
		}
		if live.AgentSessionID == "" {
			live.AgentSessionID = acpSessionID
		}
	} else {
		// Initialize
		initRes := InitializeResult{}
		if err := client.Call("initialize", InitializeParams{
			ProtocolVersion:    1,
			ClientCapabilities: ClientCapabilities{FS: ClientFS{ReadTextFile: false, WriteTextFile: false}},
		}, &initRes); err != nil {
			cancel()
			return nil, fmt.Errorf("acp: initialize failed for %q: %w", agentID, err)
		}

		// Try session/resume or session/load if previous session id exists
		resumed := false
		if acpSessionID != "" {
			var resumeRes SessionNewResult
			if err := client.Call("session/resume", map[string]interface{}{"sessionId": acpSessionID, "cwd": cwd}, &resumeRes); err == nil && resumeRes.SessionID != "" {
				live.AgentSessionID = resumeRes.SessionID
				resumed = true
			} else if err := client.Call("session/load", map[string]interface{}{"sessionId": acpSessionID, "cwd": cwd}, &resumeRes); err == nil && resumeRes.SessionID != "" {
				live.AgentSessionID = resumeRes.SessionID
				resumed = true
			}
		}

		if !resumed {
			// Fallback to session/new
			newRes := SessionNewResult{}
			if err := client.Call("session/new", SessionNewParams{CWD: cwd, MCPServers: []interface{}{}}, &newRes); err != nil {
				cancel()
				return nil, fmt.Errorf("acp: session/new fallback failed for %q: %w", agentID, err)
			}
			live.AgentSessionID = newRes.SessionID
		}

		if model != "" && model != agentDesc.DefaultModel {
			_ = client.Notify("session/set_model", map[string]string{
				"sessionId": live.AgentSessionID,
				"modelId":   model,
			})
			_ = client.Notify("session/set_config_option", map[string]interface{}{
				"sessionId": live.AgentSessionID,
				"configId":  "model",
				"value":     model,
			})
		}
	}

	m.mu.Lock()
	m.live[sessionID] = live
	m.mu.Unlock()

	// Update persisted session metadata
	meta["acpSession"] = live.AgentSessionID
	metaJSON, _ := json.Marshal(meta)
	sess.Metadata = string(metaJSON)
	sess.Status = "active"
	_ = m.store.SaveSession(*sess)

	m.publishStatus(live)
	return m.sessionInfo(live), nil
}

// Prompt sends one user turn. It persists the user row, then runs the
// blocking session/prompt call in a goroutine so the API returns instantly;
// protocol updates stream to the UI as standard agent.* events.
func (m *Manager) Prompt(sessionID, text string) error {
	live := m.getLive(sessionID)
	if live == nil {
		// Automatically resume the closed/idle ACP session!
		if _, err := m.ResumeSession(sessionID); err == nil {
			live = m.getLive(sessionID)
		}
	}
	if live == nil {
		return fmt.Errorf("acp: failed to resume session %s", sessionID)
	}
	if strings.TrimSpace(text) == "" {
		return fmt.Errorf("acp: empty prompt")
	}

	userMsg := gateway.SessionMessage{
		ID:         "acp-u-" + uuid.New().String(),
		SessionID:  sessionID,
		Channel:    "acp",
		Role:       "user",
		SenderType: "user",
		SenderID:   "user",
		SenderName: "You",
		Content:    text,
		CreatedAt:  time.Now().Unix(),
	}
	if err := m.store.SaveMessage(userMsg); err != nil {
		return fmt.Errorf("acp: persist user message: %w", err)
	}
	m.bus.Publish(messaging.Event{Type: messaging.EventMessageCreated, SessionID: sessionID, Channel: "acp", Payload: userMsg})

	// Auto-title from the first prompt.
	if live.promptCount == 0 {
		if sess, _ := m.store.GetSession(sessionID); sess != nil && (sess.Title == "" || sess.Title == "New Task") {
			sess.Title = truncateTitle(text)
			_ = m.store.SaveSession(*sess)
			m.bus.Publish(messaging.Event{Type: messaging.EventSessionUpdated, SessionID: sessionID, Payload: *sess})
		}
	}

	live.setStatus("running")
	m.publishStatus(live)

	// Broadcast EventAgentStarted so frontend streaming state initializes cleanly
	m.bus.Publish(messaging.Event{
		ID:        uuid.New().String(),
		Type:      messaging.EventAgentStarted,
		SessionID: sessionID,
		AgentID:   live.agent.ID,
		Channel:   "web",
		Payload: map[string]interface{}{
			"agentId":   live.agent.ID,
			"agentName": live.agent.Name,
			"avatar":    live.agent.ID,
			"model":     live.model,
		},
		Timestamp: time.Now(),
	})

	go func() {
		live.turnMu.Lock()
		defer live.turnMu.Unlock()

		live.turnActive = true
		live.content.Reset()
		live.thought.Reset()
		live.toolOrder = nil
		live.tools = make(map[string]*gateway.ToolCallRecord)

		var res PromptResult
		var err error

		if live.protocol == "agy-stream" {
			live.turnDoneCh = make(chan struct{}, 1)
			inputMsg := map[string]interface{}{
				"event": "user",
				"message": map[string]interface{}{
					"content": text,
					"parts": []map[string]interface{}{
						{"text": text},
					},
				},
			}
			data, marshalErr := json.Marshal(inputMsg)
			if marshalErr != nil {
				err = marshalErr
			} else if writeErr := live.client.WriteRaw(data); writeErr != nil {
				err = writeErr
			} else {
				select {
				case <-live.turnDoneCh:
				case <-time.After(5 * time.Minute):
				case <-live.client.exited:
				}
			}
		} else {
			err = live.client.Call("session/prompt", PromptParams{
				SessionID: live.AgentSessionID,
				Prompt:    []ContentBlock{{Type: "text", Text: text}},
			}, &res)
		}

		final := gateway.SessionMessage{
			ID:         "acp-a-" + uuid.New().String(),
			SessionID:  sessionID,
			AgentID:    live.agent.ID,
			Channel:    "web",
			Role:       "assistant",
			SenderType: "agent",
			SenderID:   live.agent.ID,
			SenderName: live.agent.Name,
			Content:    live.content.String(),
			Thought:    live.thought.String(),
			Model:      live.model,
			CreatedAt:  time.Now().Unix(),
		}
		for _, tid := range live.toolOrder {
			if rec, ok := live.tools[tid]; ok {
				final.ToolCalls = append(final.ToolCalls, *rec)
			}
		}

		live.turnActive = false
		live.promptCount++
		if err != nil {
			live.setStatus("error")
			final.Content = strings.TrimSpace(final.Content)
			if final.Content == "" {
				final.Content = "ACP agent error: " + err.Error()
			}
			_ = m.store.SaveMessage(final)
			m.bus.Publish(messaging.Event{Type: messaging.EventMessageCreated, SessionID: sessionID, AgentID: live.agent.ID, Channel: "web", Payload: final, Timestamp: time.Now()})
			m.bus.Publish(messaging.Event{Type: messaging.EventAgentCompleted, SessionID: sessionID, AgentID: live.agent.ID, Channel: "web", Payload: final, Timestamp: time.Now()})
		} else if res.StopReason == "cancelled" {
			// Interrupted by the user; keep whatever streamed in as the row.
			if strings.TrimSpace(final.Content) != "" || len(final.ToolCalls) > 0 {
				_ = m.store.SaveMessage(final)
				m.bus.Publish(messaging.Event{Type: messaging.EventMessageCreated, SessionID: sessionID, AgentID: live.agent.ID, Channel: "web", Payload: final, Timestamp: time.Now()})
				m.bus.Publish(messaging.Event{Type: messaging.EventAgentCompleted, SessionID: sessionID, AgentID: live.agent.ID, Channel: "web", Payload: final, Timestamp: time.Now()})
			}
			live.setStatus("idle")
		} else {
			live.setStatus("idle")
			if err := m.store.SaveMessage(final); err != nil {
				fmt.Printf("acp: persist assistant message: %v\n", err)
			}
			m.bus.Publish(messaging.Event{Type: messaging.EventMessageCreated, SessionID: sessionID, AgentID: live.agent.ID, Channel: "web", Payload: final, Timestamp: time.Now()})
			m.bus.Publish(messaging.Event{Type: messaging.EventAgentCompleted, SessionID: sessionID, AgentID: live.agent.ID, Channel: "web", Payload: final, Timestamp: time.Now()})
		}
		m.publishStatus(live)
	}()

	return nil
}

// Cancel interrupts the in-flight turn.
func (m *Manager) Cancel(sessionID string) error {
	live := m.getLive(sessionID)
	if live == nil {
		return fmt.Errorf("acp: session %s is not running", sessionID)
	}
	return live.client.Notify("session/cancel", CancelParams{SessionID: live.AgentSessionID})
}

// RespondPermission resolves an open permission request.
func (m *Manager) RespondPermission(sessionID, requestID, optionID string) error {
	live := m.getLive(sessionID)
	if live == nil {
		return fmt.Errorf("acp: session %s is not running", sessionID)
	}
	live.permMu.Lock()
	perm, ok := live.perms[requestID]
	live.permMu.Unlock()
	if !ok {
		return fmt.Errorf("acp: permission request %s not found", requestID)
	}
	perm.outcome <- PermissionOutcome{Outcome: "selected", OptionID: optionID}
	return nil
}

// CloseSession kills the process (the transcript record stays).
func (m *Manager) CloseSession(sessionID string) error {
	live := m.getLive(sessionID)
	if live == nil {
		return nil // already closed
	}
	live.setStatus("closed")
	m.mu.Lock()
	delete(m.live, sessionID)
	m.mu.Unlock()
	live.cancel()
	m.publishStatus(live)
	return nil
}

// DeleteSession closes and removes the persisted record entirely.
func (m *Manager) DeleteSession(sessionID string) error {
	_ = m.CloseSession(sessionID)
	return m.store.DeleteSession(sessionID)
}

// SetAutoApprove flips the auto-approve flag on a live session.
func (m *Manager) SetAutoApprove(sessionID string, auto bool) {
	if live := m.getLive(sessionID); live != nil {
		live.autoApprove = auto
		m.persistMeta(live)
		m.publishStatus(live)
	}
}

// ListSessions merges live state with persisted records (post-restart, the
// persisted rows remain browsable with status "closed").
func (m *Manager) ListSessions() []SessionInfo {
	m.mu.RLock()
	liveMap := make(map[string]*liveSession, len(m.live))
	for k, v := range m.live {
		liveMap[k] = v
	}
	m.mu.RUnlock()

	out := make([]SessionInfo, 0, len(liveMap))
	for _, live := range liveMap {
		out = append(out, *m.sessionInfo(live))
	}

	sessions, err := m.store.ListSessions()
	if err != nil {
		return out
	}
	for _, sess := range sessions {
		if _, isLive := liveMap[sess.ID]; isLive {
			continue
		}
		var meta map[string]interface{}
		if sess.Metadata == "" || json.Unmarshal([]byte(sess.Metadata), &meta) != nil {
			continue
		}
		if meta["engine"] != "acp" {
			continue
		}
		agentID, _ := meta["acpAgent"].(string)
		ws, _ := meta["workspace"].(string)
		model, _ := meta["model"].(string)
		agentName := agentID
		if desc, err := m.registry.get(agentID); err == nil {
			agentName = desc.Name
		}
		out = append(out, SessionInfo{
			ID: sess.ID, AgentID: agentID, AgentName: agentName,
			Title: sess.Title, CWD: ws, Model: model,
			Status:    "closed",
			CreatedAt: sess.CreatedAt, UpdatedAt: sess.UpdatedAt,
		})
	}
	return out
}

// GetSessionInfo returns one session's info (live or persisted).
func (m *Manager) GetSessionInfo(sessionID string) (*SessionInfo, error) {
	if live := m.getLive(sessionID); live != nil {
		info := m.sessionInfo(live)
		return info, nil
	}
	for _, info := range m.ListSessions() {
		if info.ID == sessionID {
			return &info, nil
		}
	}
	return nil, fmt.Errorf("acp: session %s not found", sessionID)
}

// ---- Internals ---------------------------------------------------------------

func (m *Manager) getLive(sessionID string) *liveSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.live[sessionID]
}

func (m *Manager) sessionInfo(live *liveSession) *SessionInfo {
	m.mu.RLock()
	_, stillLive := m.live[live.SessionID]
	m.mu.RUnlock()
	status := live.status
	if !stillLive {
		status = "closed"
	}
	return &SessionInfo{
		ID:           live.SessionID,
		AgentID:      live.agent.ID,
		AgentName:    live.agent.Name,
		CWD:          live.cwd,
		Model:        live.model,
		Status:       status,
		AutoApprove:  live.autoApprove,
		ACPSessionID: live.AgentSessionID,
		PromptCount:  live.promptCount,
		CreatedAt:    live.createdAt,
		UpdatedAt:    live.updatedAt,
		Running:      status == "running" || status == "awaiting_permission",
	}
}

func (m *Manager) publishStatus(live *liveSession) {
	m.bus.Publish(messaging.Event{
		Type:      messaging.EventACPStatus,
		SessionID: live.SessionID,
		AgentID:   live.agent.ID,
		Channel:   "acp",
		Payload:   *m.sessionInfo(live),
	})
}

// SetSessionModel updates the active model for a session, notifying the live ACP agent if connected.
func (m *Manager) SetSessionModel(sessionID, model string) error {
	if model == "" {
		return nil
	}
	if live := m.getLive(sessionID); live != nil {
		live.model = model
		if live.protocol != "agy-stream" && live.client != nil {
			_ = live.client.Notify("session/set_model", map[string]string{
				"sessionId": live.AgentSessionID,
				"modelId":   model,
			})
			_ = live.client.Notify("session/set_config_option", map[string]interface{}{
				"sessionId": live.AgentSessionID,
				"configId":  "model",
				"value":     model,
			})
		}
		m.persistMeta(live)
		return nil
	}

	// If not live, update persisted session metadata
	sess, err := m.store.GetSession(sessionID)
	if err != nil || sess == nil {
		return nil
	}
	var meta map[string]interface{}
	if sess.Metadata != "" {
		_ = json.Unmarshal([]byte(sess.Metadata), &meta)
	}
	if meta == nil {
		meta = make(map[string]interface{})
	}
	meta["model"] = model
	if data, err := json.Marshal(meta); err == nil {
		sess.Metadata = string(data)
		_ = m.store.SaveSession(*sess)
	}
	return nil
}

// persistMeta writes mutable live fields back into the persisted metadata.
func (m *Manager) persistMeta(live *liveSession) {
	sess, err := m.store.GetSession(live.SessionID)
	if err != nil || sess == nil {
		return
	}
	var meta map[string]interface{}
	if sess.Metadata != "" {
		_ = json.Unmarshal([]byte(sess.Metadata), &meta)
	}
	if meta == nil {
		meta = make(map[string]interface{})
	}
	meta["autoApprove"] = live.autoApprove
	meta["model"] = live.model
	if data, err := json.Marshal(meta); err == nil {
		sess.Metadata = string(data)
		_ = m.store.SaveSession(*sess)
	}
}

func (m *Manager) handleStreamEvent(live *liveSession, event string, raw []byte, initCh chan struct{}) {
	switch event {
	case "init":
		var initPayload struct {
			ConversationID string `json:"conversation_id"`
			SessionID      string `json:"session_id"`
		}
		_ = json.Unmarshal(raw, &initPayload)
		cid := initPayload.ConversationID
		if cid == "" {
			cid = initPayload.SessionID
		}
		if cid != "" {
			live.AgentSessionID = cid
			// Persist real conversation ID to session metadata
			if sess, _ := m.store.GetSession(live.SessionID); sess != nil && sess.Metadata != "" {
				var meta map[string]interface{}
				if json.Unmarshal([]byte(sess.Metadata), &meta) == nil {
					meta["acpSession"] = cid
					if data, err := json.Marshal(meta); err == nil {
						sess.Metadata = string(data)
						_ = m.store.SaveSession(*sess)
					}
				}
			}
		}
		if initCh != nil {
			select {
			case initCh <- struct{}{}:
			default:
			}
		}

	case "step_update":
		var payload struct {
			StepUpdate struct {
				StepIndex       int                    `json:"step_index"`
				State           string                 `json:"state"`
				StepType        string                 `json:"step_type"`
				ToolName        string                 `json:"tool_name"`
				TextDelta       string                 `json:"text_delta"`
				DurationSeconds float64                `json:"duration_seconds"`
				ToolInfo        map[string]interface{} `json:"tool_info"`
			} `json:"step_update"`
		}
		if err := json.Unmarshal(raw, &payload); err == nil {
			su := payload.StepUpdate
			if su.TextDelta != "" {
				live.content.WriteString(su.TextDelta)
				m.bus.Publish(messaging.Event{
					Type:      messaging.EventAgentTextDelta,
					SessionID: live.SessionID,
					AgentID:   live.agent.ID,
					Channel:   "web",
					Payload:   messaging.TextDeltaPayload{Delta: su.TextDelta},
				})
			}
			if su.StepType == "tool" {
				toolID := fmt.Sprintf("agy-tool-%d", su.StepIndex)
				toolName := su.ToolName
				if toolName == "" && su.ToolInfo != nil {
					if n, ok := su.ToolInfo["name"].(string); ok {
						toolName = n
					}
				}
				if toolName == "" {
					toolName = "tool"
				}
				var params map[string]interface{}
				if su.ToolInfo != nil {
					if p, ok := su.ToolInfo["parameters"].(map[string]interface{}); ok {
						params = p
					}
				}
				if su.State == "ACTIVE" {
					rec := &gateway.ToolCallRecord{
						ID:        toolID,
						Tool:      toolName,
						Status:    "running",
						Arguments: params,
					}
					live.tools[toolID] = rec
					live.toolOrder = append(live.toolOrder, toolID)
					m.bus.Publish(messaging.Event{
						Type:      messaging.EventAgentToolCall,
						SessionID: live.SessionID,
						AgentID:   live.agent.ID,
						Channel:   "web",
						Payload:   messaging.ToolCallPayload{ID: toolID, Tool: toolName, Arguments: params},
					})
				} else if su.State == "DONE" || su.State == "ERROR" {
					var resultStr string
					if su.ToolInfo != nil {
						if out, ok := su.ToolInfo["output"].(string); ok && out != "" {
							resultStr = out
						} else if res, ok := su.ToolInfo["result"]; ok {
							if resStr, ok := res.(string); ok {
								resultStr = resStr
							} else {
								resB, _ := json.Marshal(res)
								resultStr = string(resB)
							}
						}
					}
					st := "completed"
					if su.State == "ERROR" {
						st = "failed"
					}
					rec, exists := live.tools[toolID]
					if !exists {
						rec = &gateway.ToolCallRecord{
							ID:        toolID,
							Tool:      toolName,
							Arguments: params,
						}
						live.tools[toolID] = rec
						live.toolOrder = append(live.toolOrder, toolID)
					}
					rec.Status = st
					rec.Output = resultStr
					if len(rec.Arguments) == 0 && len(params) > 0 {
						rec.Arguments = params
					}
					if rec.Tool == "" || rec.Tool == "tool" {
						rec.Tool = toolName
					}

					m.bus.Publish(messaging.Event{
						Type:      messaging.EventAgentToolResult,
						SessionID: live.SessionID,
						AgentID:   live.agent.ID,
						Channel:   "web",
						Payload: messaging.ToolResultPayload{
							ID:         toolID,
							Tool:       rec.Tool,
							Output:     resultStr,
							Status:     st,
							DurationMs: int64(su.DurationSeconds * 1000),
						},
					})
				}
			}
			if (su.State == "DONE" && su.StepType == "turn") || su.State == "TURN_COMPLETE" {
				if live.turnDoneCh != nil {
					select {
					case live.turnDoneCh <- struct{}{}:
					default:
					}
				}
			}
		}

	case "result":
		if live.turnDoneCh != nil {
			select {
			case live.turnDoneCh <- struct{}{}:
			default:
			}
		}
	}
}

func (m *Manager) handleNotification(live *liveSession, method string, params json.RawMessage) {
	if method != "session/update" {
		return
	}
	var up SessionUpdateParams
	if json.Unmarshal(params, &up) != nil {
		return
	}
	u := up.Update

	switch u.SessionUpdate {
	case "agent_message_chunk":
		var block ContentBlock
		if json.Unmarshal(u.Content, &block) == nil && block.Text != "" {
			live.content.WriteString(block.Text)
			m.bus.Publish(messaging.Event{
				Type: messaging.EventAgentTextDelta, SessionID: live.SessionID,
				AgentID: live.agent.ID, Channel: "web",
				Payload: messaging.TextDeltaPayload{Delta: block.Text},
			})
		}
	case "agent_thought_chunk":
		var block ContentBlock
		if json.Unmarshal(u.Content, &block) == nil && block.Text != "" {
			live.thought.WriteString(block.Text)
			m.bus.Publish(messaging.Event{
				Type: messaging.EventAgentThinkingDelta, SessionID: live.SessionID,
				AgentID: live.agent.ID, Channel: "web",
				Payload: messaging.ThinkingDeltaPayload{Delta: block.Text},
			})
		}
	case "tool_call":
		rec := &gateway.ToolCallRecord{
			ID:     u.ToolCallID,
			Tool:   toolLabel(u.Kind, u.Title),
			Status: "running",
		}
		if len(u.RawInput) > 0 {
			var args map[string]interface{}
			if json.Unmarshal(u.RawInput, &args) == nil {
				rec.Arguments = args
			}
		}
		live.tools[u.ToolCallID] = rec
		live.toolOrder = append(live.toolOrder, u.ToolCallID)
		m.bus.Publish(messaging.Event{
			Type: messaging.EventAgentToolCall, SessionID: live.SessionID,
			AgentID: live.agent.ID, Channel: "web",
			Payload: messaging.ToolCallPayload{ID: rec.ID, Tool: rec.Tool, Arguments: rec.Arguments},
		})
	case "tool_call_update":
		if rec, ok := live.tools[u.ToolCallID]; ok {
			if u.Title != "" {
				rec.Tool = toolLabel(u.Kind, u.Title)
			}
			switch u.Status {
			case "completed", "failed":
				rec.Status = mapStatus(u.Status)
				rec.Output = extractToolOutput(u.RawOutput, u.Content)
				m.bus.Publish(messaging.Event{
					Type: messaging.EventAgentToolResult, SessionID: live.SessionID,
					AgentID: live.agent.ID, Channel: "web",
					Payload: messaging.ToolResultPayload{ID: rec.ID, Tool: rec.Tool, Output: rec.Output, Status: rec.Status},
				})
			default:
				if rec.Status == "" {
					rec.Status = "running"
				}
			}
		} else if u.Status == "completed" || u.Status == "failed" {
			// Update for a tool we never saw opened — surface it anyway.
			rec := &gateway.ToolCallRecord{
				ID:     u.ToolCallID,
				Tool:   toolLabel(u.Kind, u.Title),
				Status: mapStatus(u.Status),
				Output: extractToolOutput(u.RawOutput, u.Content),
			}
			live.tools[u.ToolCallID] = rec
			live.toolOrder = append(live.toolOrder, u.ToolCallID)
			m.bus.Publish(messaging.Event{
				Type: messaging.EventAgentToolCall, SessionID: live.SessionID,
				AgentID: live.agent.ID, Channel: "web",
				Payload: messaging.ToolCallPayload{ID: rec.ID, Tool: rec.Tool, Arguments: rec.Arguments},
			})
			m.bus.Publish(messaging.Event{
				Type: messaging.EventAgentToolResult, SessionID: live.SessionID,
				AgentID: live.agent.ID, Channel: "web",
				Payload: messaging.ToolResultPayload{ID: rec.ID, Tool: rec.Tool, Output: rec.Output, Status: rec.Status},
			})
		}
	default:
		// plan / available_commands_update / current_mode_update: ignored.
	}
}

// handleRequest answers server→client requests. Only permission requests are
// supported; fs/* are declined (clientCapabilities declared no fs).
func (m *Manager) handleRequest(live *liveSession, id int64, method string, params json.RawMessage) (interface{}, error) {
	switch method {
	case "session/request_permission":
		var rp RequestPermissionParams
		if err := json.Unmarshal(params, &rp); err != nil {
			return nil, err
		}
		return m.handlePermission(live, rp)
	default:
		return nil, fmt.Errorf("acp: unsupported client method %q", method)
	}
}

func (m *Manager) handlePermission(live *liveSession, rp RequestPermissionParams) (interface{}, error) {
	// Auto-approve mode: pick the first allow option immediately.
	if live.autoApprove {
		for _, opt := range rp.Options {
			if strings.HasPrefix(opt.Kind, "allow") {
				return RequestPermissionResult{Outcome: PermissionOutcome{Outcome: "selected", OptionID: opt.OptionID}}, nil
			}
		}
	}

	live.permMu.Lock()
	live.permSeq++
	reqID := fmt.Sprintf("perm_%s_%d", live.SessionID, live.permSeq)
	perm := &PendingPermission{
		RequestID:  reqID,
		SessionID:  live.SessionID,
		ToolCallID: rp.ToolCall.ToolCallID,
		Title:      rp.ToolCall.Title,
		Kind:       rp.ToolCall.Kind,
		Options:    rp.Options,
		CreatedAt:  time.Now().Unix(),
		outcome:    make(chan PermissionOutcome, 1),
	}
	live.perms[reqID] = perm
	live.permMu.Unlock()

	live.setStatus("awaiting_permission")
	m.publishStatus(live)
	m.bus.Publish(messaging.Event{
		Type:      messaging.EventACPPermission,
		SessionID: live.SessionID,
		AgentID:   live.agent.ID,
		Channel:   "acp",
		Payload:   perm,
	})

	var outcome PermissionOutcome
	select {
	case outcome = <-perm.outcome:
	case <-time.After(permissionTimeout):
		outcome = PermissionOutcome{Outcome: "cancelled"}
	}

	live.permMu.Lock()
	delete(live.perms, reqID)
	live.permMu.Unlock()
	if live.status == "awaiting_permission" {
		live.setStatus("running")
	}
	m.publishStatus(live)

	return RequestPermissionResult{Outcome: outcome}, nil
}

// ---- helpers ---------------------------------------------------------------

func toolLabel(kind, title string) string {
	name := title
	if idx := strings.IndexAny(name, " \t\n:"); idx > 0 {
		name = name[:idx]
	}
	if name == "" {
		name = kind
	}
	if name == "" {
		name = "tool"
	}
	return name
}

func mapStatus(s string) string {
	if s == "failed" {
		return "error"
	}
	return "success"
}

// extractToolOutput best-effort flattens ACP tool output into display text:
// rawOutput {output|stdout|content} fields plus text/diff content blocks.
func extractToolOutput(rawOutput, content json.RawMessage) string {
	var b strings.Builder
	if len(rawOutput) > 0 {
		var obj map[string]interface{}
		if json.Unmarshal(rawOutput, &obj) == nil {
			for _, key := range []string{"output", "content", "stdout", "text"} {
				if v, ok := obj[key].(string); ok && v != "" {
					b.WriteString(v)
					break
				}
			}
		} else {
			var s string
			if json.Unmarshal(rawOutput, &s) == nil {
				b.WriteString(s)
			}
		}
	}
	if len(content) > 0 {
		var blocks []ContentBlock
		if json.Unmarshal(content, &blocks) == nil {
			for _, blk := range blocks {
				if blk.Text != "" {
					if b.Len() > 0 {
						b.WriteString("\n")
					}
					b.WriteString(blk.Text)
				}
			}
		}
	}
	out := b.String()
	const maxOut = 20000
	if len(out) > maxOut {
		return out[:maxOut] + "\n… (truncated)"
	}
	return out
}

func truncateTitle(text string) string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) > 48 {
		return string(runes[:48]) + "…"
	}
	if len(runes) == 0 {
		return "New Task"
	}
	return string(runes)
}

func workspaceName(path string) string {
	path = strings.TrimRight(path, "/")
	if idx := strings.LastIndex(path, "/"); idx >= 0 {
		return path[idx+1:]
	}
	return path
}
