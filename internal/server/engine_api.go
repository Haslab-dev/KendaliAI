package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/agentengine"
	"github.com/kendaliai/app/internal/gateway"
	"github.com/kendaliai/app/internal/messaging"
)

// engineTurnTimeout bounds a single engine turn (tool loops can run long).
const engineTurnTimeout = 15 * time.Minute

// SendEngineMessage is the REST/WS payload to run an engine turn.
type SendEngineMessage struct {
	SessionID      string   `json:"sessionId"`
	Content        string   `json:"content"`
	MentionedPaths []string `json:"mentionedPaths,omitempty"`
	Model          string   `json:"model,omitempty"` // "provider/model"; empty keeps active
	AgentID        string   `json:"agentId,omitempty"`
}

// handleEngineStatus GET /api/engine/status
func (s *Server) handleEngineStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, s.engine.Status())
	}
}

// handleEngineSessions GET list / POST create engine sessions.
func (s *Server) handleEngineSessions() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, s.engine.AgentMgr.ListSessions())
		case http.MethodPost:
			var req struct {
				Name      string `json:"name,omitempty"`
				Workspace string `json:"workspace,omitempty"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err.Error() != "EOF" {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			sess, err := s.engine.AgentMgr.CreateSession(req.Name, "", firstNonEmpty(req.Workspace, s.engine.DefaultWorkspace()))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if s.engine.Status().AutoApprove {
				_ = s.engine.AgentMgr.SetAutoApprove(sess.ID, true)
			}
			writeJSON(w, sess)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// handleEngineSessionAction GET/DELETE /api/engine/sessions/{id}
func (s *Server) handleEngineSessionAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/engine/sessions/")
		if id == "" {
			http.Error(w, "missing session id", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodGet:
			sess, ok := s.engine.AgentMgr.GetSession(id)
			if !ok {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			writeJSON(w, sess)
		case http.MethodDelete:
			s.engine.AgentMgr.DeleteSession(id)
			writeJSON(w, map[string]bool{"deleted": true})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// handleEngineMessage POST /api/engine/message — run a turn in an engine
// session (standalone or mapped from a gateway session ID). Events stream on
// the WebSocket with the gateway event names.
func (s *Server) handleEngineMessage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req SendEngineMessage
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if req.SessionID == "" || req.Content == "" {
			http.Error(w, "sessionId and content are required", http.StatusBadRequest)
			return
		}
		if err := s.engineApplyModel(req.Model); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), engineTurnTimeout)
		defer cancel()
		if err := s.engine.Send(ctx, req.SessionID, req.Content, req.MentionedPaths); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]interface{}{"accepted": true, "sessionId": req.SessionID})
	}
}

// handleEngineApproval POST /api/engine/approval {sessionId, approve, autoApproveAll}
func (s *Server) handleEngineApproval() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			SessionID      string `json:"sessionId"`
			Approve        bool   `json:"approve"`
			AutoApproveAll bool   `json:"autoApproveAll"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		rid, err := s.engine.EnsureSession(req.SessionID, "")
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		if err := s.engine.AgentMgr.RespondApproval(context.Background(), rid, req.Approve, req.AutoApproveAll); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	}
}

// handleEngineStop POST /api/engine/stop {sessionId}
func (s *Server) handleEngineStop() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			SessionID string `json:"sessionId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		rid, ok := s.engine.ResolveEngineSession(req.SessionID)
		if !ok {
			rid = req.SessionID
		}
		s.engine.AgentMgr.StopTurn(rid)
		writeJSON(w, map[string]bool{"stopped": true})
	}
}

// handleEngineProviders GET/PUT the engine's provider profiles.
func (s *Server) handleEngineProviders() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, s.engine.LLMClient.GetProviderProfiles())
		case http.MethodPut, http.MethodPost:
			var profiles []engineProfileDTO
			if err := json.NewDecoder(r.Body).Decode(&profiles); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			items := make([]agentengine.ProviderInput, 0, len(profiles))
			for _, p := range profiles {
				items = append(items, agentengine.ProviderInput{
					ID: p.ID, Name: p.Name, Type: p.Type, APIKey: p.APIKey,
					Endpoint: p.BaseURL, Models: p.AvailableModels, Enabled: p.Enabled,
				})
			}
			s.engine.SyncProviders(items)
			writeJSON(w, s.engine.LLMClient.GetProviderProfiles())
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// engineProfileDTO mirrors llm.ProviderProfile with friendly JSON keys.
type engineProfileDTO struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Type            string   `json:"type,omitempty"`
	APIKey          string   `json:"api_key"`
	BaseURL         string   `json:"base_url"`
	Enabled         bool     `json:"enabled"`
	AvailableModels []string `json:"available_models"`
}

// handleEngineModel POST /api/engine/model {model: "provider/model"}
func (s *Server) handleEngineModel() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Model string `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := s.engineApplyModel(req.Model); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, s.engine.LLMClient.GetConfig())
	}
}

// engineApplyModel switches the engine's active model. Accepts
// "provider/model"; a bare model name resolves against known profiles.
func (s *Server) engineApplyModel(model string) error {
	if model == "" {
		return nil
	}
	s.engine.LLMClient.SetActiveModelByID(model)
	return nil
}

// runEngineTurn executes a web-channel turn through the engine: it persists
// the user message, streams engine events via the bridge (already attached),
// and persists the assistant reply from the bridge hook.
func (s *Server) runEngineTurn(sessionID, agentID, content, channel, model string) {
	if channel == "" {
		channel = "web"
	}
	// Ensure the gateway session row exists — the legacy runtime creates it
	// inside ExecuteTurnWithModel; the engine path needs it for the UI
	// session list and the per-session message endpoints. GetSession returns
	// (nil, nil) when the row is missing.
	if existing, err := s.store.GetSession(sessionID); err != nil || existing == nil {
		title := content
		if idx := strings.IndexByte(title, '\n'); idx > 0 {
			title = title[:idx]
		}
		if len(title) > 60 {
			title = title[:60]
		}
		now := time.Now().UnixMilli()
		_ = s.store.SaveSession(gateway.Session{
			ID:        sessionID,
			AgentID:   agentID,
			Title:     title,
			Type:      "direct",
			Status:    "active",
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	userMsg := gateway.SessionMessage{
		SessionID:  sessionID,
		AgentID:    agentID,
		Channel:    channel,
		Role:       "user",
		SenderType: "user",
		Content:    content,
	}
	_ = s.store.SaveMessage(userMsg)
	s.bus.Publish(messaging.Event{
		Type:      messaging.EventMessageCreated,
		SessionID: sessionID,
		AgentID:   agentID,
		Channel:   channel,
		Payload:   userMsg,
	})

	if err := s.engineApplyModel(model); err != nil {
		log.Printf("engine: apply model %q: %v", model, err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), engineTurnTimeout)
	defer cancel()
	if err := s.engine.Send(ctx, sessionID, content, nil); err != nil {
		log.Printf("engine: send: %v", err)
		s.bus.Publish(messaging.Event{
			Type:      messaging.EventAgentFailed,
			SessionID: sessionID,
			Channel:   channel,
			Payload:   err.Error(),
		})
	}
}

// persistEngineAssistant is the bridge hook storing the finished assistant
// message into the gateway store (single conversation history for UI).
func (s *Server) persistEngineAssistant(res agentengine.AssistantResult) {
	if res.Failed || strings.TrimSpace(res.Content) == "" {
		return
	}
	msg := gateway.SessionMessage{
		SessionID:  res.SessionID,
		Channel:    "web",
		Role:       "assistant",
		SenderType: "agent",
		Content:    res.Content,
		Thought:    res.Thought,
		Model:      res.Model,
	}
	if err := s.store.SaveMessage(msg); err != nil {
		log.Printf("engine: persist assistant message: %v", err)
	}

	// The RakitKode engine does not expose token usage, so estimate the
	// session's context occupancy and report it for the composer gauge.
	if res.SessionID != "" {
		model := res.Model
		if model == "" {
			model, _ = s.runtime.ResolveDefaultModel()
		}
		used, window := gateway.ComputeSessionUsage(s.store, res.SessionID, model)
		s.bus.Publish(messaging.Event{
			Type:      messaging.EventAgentUsage,
			SessionID: res.SessionID,
			Channel:   "web",
			Payload: messaging.UsagePayload{
				SessionID:     res.SessionID,
				Model:         model,
				UsedTokens:    used,
				ContextWindow: window,
				Percent:       gateway.UsagePercent(used, window),
			},
		})
	}
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
