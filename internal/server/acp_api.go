package server

import (
	"encoding/json"
	"net/http"
	"strings"
)

// handleACPAgents lists launchable ACP agents with availability.
func (s *Server) handleACPAgents() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"agents": s.acp.Agents()})
	}
}

// handleACPSessions: GET list | POST start.
func (s *Server) handleACPSessions() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodGet:
			json.NewEncoder(w).Encode(s.acp.ListSessions())

		case http.MethodPost:
			var req struct {
				AgentID     string `json:"agentId"`
				CWD         string `json:"cwd"`
				Model       string `json:"model"`
				AutoApprove bool   `json:"autoApprove"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if req.AgentID == "" {
				http.Error(w, "agentId is required", http.StatusBadRequest)
				return
			}
			info, err := s.acp.StartSession(req.AgentID, req.CWD, req.Model, req.AutoApprove)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(info)

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// handleACPSessionAction routes /api/acp/sessions/{id}[/{action}].
//
//	GET    {id}                  → session info + transcript
//	DELETE {id}                  → close + delete
//	POST   {id}/prompt           → send a user turn
//	POST   {id}/cancel           → interrupt the turn
//	POST   {id}/permission       → resolve a permission request
//	POST   {id}/close            → kill the process (keep the record)
//	POST   {id}/auto-approve     → toggle auto-approval
func (s *Server) handleACPSessionAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		rest := strings.TrimPrefix(r.URL.Path, "/api/acp/sessions/")
		parts := strings.Split(rest, "/")
		sessionID := parts[0]
		if sessionID == "" {
			http.Error(w, "missing session id", http.StatusBadRequest)
			return
		}
		action := ""
		if len(parts) > 1 {
			action = parts[1]
		}

		// Transcript read: session info plus the persisted messages.
		if r.Method == http.MethodGet && action == "" {
			info, err := s.acp.GetSessionInfo(sessionID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			messages, _ := s.store.GetSessionMessages(sessionID)
			json.NewEncoder(w).Encode(map[string]interface{}{"session": info, "messages": messages})
			return
		}

		switch action {
		case "prompt":
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			var req struct {
				Text string `json:"text"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Text) == "" {
				http.Error(w, "text is required", http.StatusBadRequest)
				return
			}
			if err := s.acp.Prompt(sessionID, req.Text); err != nil {
				http.Error(w, err.Error(), http.StatusConflict)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		case "cancel":
			if err := s.acp.Cancel(sessionID); err != nil {
				http.Error(w, err.Error(), http.StatusConflict)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		case "permission":
			var req struct {
				RequestID string `json:"requestId"`
				OptionID  string `json:"optionId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RequestID == "" {
				http.Error(w, "requestId is required", http.StatusBadRequest)
				return
			}
			if err := s.acp.RespondPermission(sessionID, req.RequestID, req.OptionID); err != nil {
				http.Error(w, err.Error(), http.StatusConflict)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		case "close":
			if err := s.acp.CloseSession(sessionID); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		case "resume":
			info, err := s.acp.ResumeSession(sessionID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(info)

		case "auto-approve":
			var req struct {
				Enabled bool `json:"enabled"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			s.acp.SetAutoApprove(sessionID, req.Enabled)
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		case "":
			if r.Method == http.MethodDelete {
				if err := s.acp.DeleteSession(sessionID); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				json.NewEncoder(w).Encode(map[string]bool{"ok": true})
				return
			}
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)

		default:
			http.Error(w, "unknown action", http.StatusNotFound)
		}
	}
}
