package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/channels"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/gateway"
	"github.com/kendaliai/app/internal/gateways"
	"github.com/kendaliai/app/internal/messaging"
)

type Server struct {
	db       *sql.DB
	router   *http.ServeMux
	store    *gateway.Store
	runtime  *gateway.Runtime
	bus      *messaging.EventBus
	tg       *channels.TelegramAdapter
	upgrader websocket.Upgrader
}

func NewServer(db *sql.DB) *Server {
	bus := messaging.DefaultBus
	store := gateway.NewStore(db)
	store.SeedInitialData(config.Cfg)

	cwd, _ := os.Getwd()
	rt := gateway.NewRuntime(store, bus, cwd)
	tg := channels.InitTelegramAdapter(store, rt, bus)

	s := &Server{
		db:      db,
		router:  http.NewServeMux(),
		store:   store,
		runtime: rt,
		bus:     bus,
		tg:      tg,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // allow web clients
			},
		},
	}

	// Auto-start active Telegram bots
	go func() {
		time.Sleep(500 * time.Millisecond)
		if err := tg.SyncAndStart(); err != nil {
			log.Printf("⚠️ Error auto-starting telegram bots: %v", err)
		}
	}()

	s.routes()
	return s
}

func (s *Server) Start(port string) error {
	addr := fmt.Sprintf(":%s", port)
	log.Printf("🚀 Starting KendaliAI Gateway on http://localhost%s\n", addr)

	srv := &http.Server{
		Addr:         addr,
		Handler:      s.corsMiddleware(s.router),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
	}

	return srv.ListenAndServe()
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) routes() {
	// Base diagnostics
	s.router.HandleFunc("/health", s.handleHealth())
	s.router.HandleFunc("/status", s.handleStatus())
	s.router.HandleFunc("/api/gateways", s.handleGateways())
	s.router.HandleFunc("/v1/chat/completions", s.handleChatCompletions())

	// WebSocket Gateway
	s.router.HandleFunc("/ws", s.handleWebSocket())

	// Configuration APIs
	s.router.HandleFunc("/api/providers", s.handleProviders())
	s.router.HandleFunc("/api/providers/test", s.handleProviderTest())
	s.router.HandleFunc("/api/providers/models", s.handleProviderModels())
	s.router.HandleFunc("/api/providers/fetch-models", s.handleProviderModels())
	s.router.HandleFunc("/api/agents", s.handleAgents())
	s.router.HandleFunc("/api/sessions", s.handleSessions())
	s.router.HandleFunc("/api/sessions/", s.handleSessionDetail())
	s.router.HandleFunc("/api/mcps", s.handleMCPs())
	s.router.HandleFunc("/api/skills", s.handleSkills())
	s.router.HandleFunc("/api/tools", s.handleTools())
	s.router.HandleFunc("/api/policies", s.handlePolicies())
	s.router.HandleFunc("/api/logs", s.handleLogs())
	s.router.HandleFunc("/api/telegram/bots", s.handleTelegramBots())
	s.router.HandleFunc("/api/telegram/bots/", s.handleTelegramBotAction())

	// Embedding & Vector RAG
	s.router.HandleFunc("/api/embedding", s.handleEmbeddingConfig())
	s.router.HandleFunc("/api/embedding/test", s.handleEmbeddingTest())
	s.router.HandleFunc("/api/documents/ingest", s.handleDocumentIngest())
	s.router.HandleFunc("/api/documents", s.handleDocuments())
	s.router.HandleFunc("/api/documents/", s.handleDocumentDetail())

	// Web UI Static Files
	s.router.HandleFunc("/", s.handleWebUI())
}

// --- WebSocket Gateway ---

type WSClientMessage struct {
	Type      string `json:"type"` // "subscribe", "logs.subscribe", "message.send", "ping"
	SessionID string `json:"sessionId"`
	AgentID   string `json:"agentId,omitempty"`
	Model     string `json:"model,omitempty"`
	Content   string `json:"content,omitempty"`
}

func (s *Server) handleWebSocket() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := s.upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WS upgrade failed: %v", err)
			return
		}
		defer conn.Close()

		currentSession := ""
		var sub *messaging.Subscription

		cleanup := func() {
			if sub != nil {
				s.bus.Unsubscribe(sub.ID)
				sub = nil
			}
		}
		defer cleanup()

		// Read loop
		for {
			var msg WSClientMessage
			err := conn.ReadJSON(&msg)
			if err != nil {
				break
			}

			switch msg.Type {
			case "subscribe", "logs.subscribe":
				cleanup()
				currentSession = msg.SessionID
				if msg.Type == "logs.subscribe" || currentSession == "" {
					currentSession = "*"
				}
				sub = s.bus.Subscribe(currentSession)

				// Pipe bus events to websocket client
				go func(sSub *messaging.Subscription, sConn *websocket.Conn) {
					for ev := range sSub.Ch {
						_ = sConn.WriteJSON(ev)
					}
				}(sub, conn)

				_ = conn.WriteJSON(map[string]interface{}{
					"type":      "subscribed",
					"sessionId": currentSession,
				})

			case "message.send":
				if msg.SessionID == "" {
					msg.SessionID = currentSession
				}
				if msg.SessionID == "" {
					msg.SessionID = "sess_" + uuid.New().String()[:8]
				}

				// If not subscribed yet, subscribe
				if sub == nil || currentSession != msg.SessionID {
					cleanup()
					currentSession = msg.SessionID
					sub = s.bus.Subscribe(currentSession)
					go func(sSub *messaging.Subscription, sConn *websocket.Conn) {
						for ev := range sSub.Ch {
							_ = sConn.WriteJSON(ev)
						}
					}(sub, conn)
				}

				go func(sid, aid, txt, mdl string) {
					ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
					defer cancel()
					_, err := s.runtime.ExecuteTurnWithModel(ctx, sid, aid, txt, "web", mdl)
					if err != nil {
						log.Printf("Web turn error: %v", err)
					}
				}(msg.SessionID, msg.AgentID, msg.Content, msg.Model)

			case "ping":
				_ = conn.WriteJSON(map[string]string{"type": "pong"})
			}
		}
	}
}

// --- Providers API ---

func (s *Server) handleProviders() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			list, err := s.store.ListProviders()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(list)

		case "POST":
			var p gateway.ProviderConfig
			if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if p.ID == "" {
				p.ID = strings.ToLower(strings.ReplaceAll(p.Name, " ", "-"))
			}
			if err := s.store.SaveProvider(p); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(p)

		case "DELETE":
			id := r.URL.Query().Get("id")
			if id == "" {
				http.Error(w, "missing id", http.StatusBadRequest)
				return
			}
			if err := s.store.DeleteProvider(id); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleProviderTest() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var p gateway.ProviderConfig
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}

		model := "default"
		if len(p.Models) > 0 {
			model = p.Models[0].ID
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": fmt.Sprintf("Successfully connected to %s (%s)", p.Name, model),
		})
	}
}

func (s *Server) handleProviderModels() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var pType, endpoint, apiKey string

		if r.Method == "GET" {
			id := r.URL.Query().Get("id")
			if id != "" {
				prov, err := s.store.GetProvider(id)
				if err == nil && prov != nil {
					pType = prov.Type
					endpoint = prov.Endpoint
					apiKey = prov.APIKey
				}
			}
			if pType == "" {
				pType = r.URL.Query().Get("type")
			}
			if endpoint == "" {
				endpoint = r.URL.Query().Get("endpoint")
			}
			if apiKey == "" {
				apiKey = r.URL.Query().Get("apiKey")
			}
		} else if r.Method == "POST" {
			var body struct {
				ID       string `json:"id"`
				Type     string `json:"type"`
				Endpoint string `json:"endpoint"`
				APIKey   string `json:"apiKey"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
				if body.ID != "" && (body.Type == "" || body.Endpoint == "") {
					prov, _ := s.store.GetProvider(body.ID)
					if prov != nil {
						pType = prov.Type
						endpoint = prov.Endpoint
						apiKey = prov.APIKey
					}
				}
				if body.Type != "" {
					pType = body.Type
				}
				if body.Endpoint != "" {
					endpoint = body.Endpoint
				}
				if body.APIKey != "" {
					apiKey = body.APIKey
				}
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		models, err := gateway.FetchRemoteModels(r.Context(), pType, endpoint, apiKey)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "%s"}`, err.Error()), http.StatusBadRequest)
			return
		}

		json.NewEncoder(w).Encode(models)
	}
}

// --- Logs Streaming API ---

func (s *Server) handleLogs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		limit := 300
		if lStr := r.URL.Query().Get("limit"); lStr != "" {
			if lInt, err := strconv.Atoi(lStr); err == nil && lInt > 0 {
				limit = lInt
			}
		}
		logs := s.bus.GetHistory(limit)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"logs": logs,
		})
	}
}

// --- Agents API ---

func (s *Server) handleAgents() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			list, err := s.store.ListAgents()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(list)

		case "POST":
			var a gateway.AgentConfig
			if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if a.ID == "" {
				a.ID = strings.ToLower(strings.ReplaceAll(a.Name, " ", "-"))
			}
			if a.Avatar == "" {
				a.Avatar = "🤖"
			}
			if err := s.store.SaveAgent(a); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(a)

		case "DELETE":
			id := r.URL.Query().Get("id")
			if id == "" {
				http.Error(w, "missing id", http.StatusBadRequest)
				return
			}
			if err := s.store.DeleteAgent(id); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// --- Sessions API ---

func (s *Server) handleSessions() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			list, err := s.store.ListSessions()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(list)

		case "POST":
			var sess gateway.Session
			if err := json.NewDecoder(r.Body).Decode(&sess); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			isNew := false
			if sess.ID != "" {
				existing, _ := s.store.GetSession(sess.ID)
				if existing != nil {
					if sess.AgentID != "" {
						existing.AgentID = sess.AgentID
					}
					if sess.Title != "" {
						existing.Title = sess.Title
					}
					if sess.ChannelID != "" {
						existing.ChannelID = sess.ChannelID
					}
					if sess.Status != "" {
						existing.Status = sess.Status
					}
					if sess.Metadata != "" {
						existing.Metadata = sess.Metadata
					}
					sess = *existing
				}
			}
			if sess.ID == "" {
				sess.ID = "sess_" + uuid.New().String()[:8]
				isNew = true
			}
			if sess.AgentID == "" {
				sess.AgentID = "personal-assistant"
			}
			if sess.Title == "" {
				sess.Title = "New Chat"
			}
			if sess.ChannelID == "" {
				sess.ChannelID = "web"
			}
			if sess.Status == "" {
				sess.Status = "active"
			}
			if err := s.store.SaveSession(sess); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			evType := messaging.EventSessionUpdated
			if isNew {
				evType = messaging.EventSessionCreated
			}
			s.bus.Publish(messaging.Event{
				ID:        uuid.New().String(),
				Type:      evType,
				SessionID: sess.ID,
				AgentID:   sess.AgentID,
				Channel:   sess.ChannelID,
				Payload:   sess,
				Timestamp: time.Now(),
			})
			json.NewEncoder(w).Encode(sess)

		case "DELETE":
			id := r.URL.Query().Get("id")
			if id == "" {
				http.Error(w, "missing id", http.StatusBadRequest)
				return
			}
			if err := s.store.DeleteSession(id); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleSessionDetail() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/sessions/"), "/")
		sessionID := parts[0]
		if sessionID == "" {
			http.Error(w, "missing session id", http.StatusBadRequest)
			return
		}

		if len(parts) > 1 && parts[1] == "clear" && r.Method == "POST" {
			_ = s.store.ClearSessionMessages(sessionID)
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})
			return
		}

		if r.Method == "GET" {
			sess, err := s.store.GetSession(sessionID)
			if err != nil || sess == nil {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			msgs, _ := s.store.GetSessionMessages(sessionID)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"session":  sess,
				"messages": msgs,
			})
			return
		}

		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// --- MCPs API ---

func (s *Server) handleMCPs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			list, err := s.store.ListMCPServers()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(list)

		case "POST":
			var m gateway.MCPServerConfig
			if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if m.ID == "" {
				m.ID = strings.ToLower(strings.ReplaceAll(m.Name, " ", "-"))
			}
			if m.Status == "" {
				m.Status = "configured"
			}
			if err := s.store.SaveMCPServer(m); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(m)

		case "DELETE":
			id := r.URL.Query().Get("id")
			if id == "" {
				http.Error(w, "missing id", http.StatusBadRequest)
				return
			}
			if err := s.store.DeleteMCPServer(id); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// --- Skills API ---

type SkillItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Content     string `json:"content,omitempty"`
}

func (s *Server) handleSkills() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		homeDir, _ := os.UserHomeDir()
		baseSkillsDir := filepath.Join(homeDir, ".kendaliai", "skills", "generated")
		_ = os.MkdirAll(baseSkillsDir, 0755)

		switch r.Method {
		case "GET":
			skillID := r.URL.Query().Get("id")
			if skillID != "" {
				promptFile := filepath.Join(baseSkillsDir, skillID, "prompt.md")
				data, _ := os.ReadFile(promptFile)
				json.NewEncoder(w).Encode(SkillItem{
					ID:      skillID,
					Name:    skillID,
					Content: string(data),
				})
				return
			}

			// List skills
			entries, _ := os.ReadDir(baseSkillsDir)
			var list []SkillItem
			for _, e := range entries {
				if e.IsDir() {
					desc := fmt.Sprintf("%s skill instructions", e.Name())
					pPath := filepath.Join(baseSkillsDir, e.Name(), "prompt.md")
					if d, err := os.ReadFile(pPath); err == nil {
						lines := strings.Split(string(d), "\n")
						if len(lines) > 0 {
							desc = strings.TrimPrefix(lines[0], "# ")
						}
					}
					list = append(list, SkillItem{
						ID:          e.Name(),
						Name:        e.Name(),
						Description: desc,
					})
				}
			}

			// Also add built-in skills if list is empty
			if len(list) == 0 {
				defaultSkills := []string{"coding", "frontend-design", "git", "debugging", "financial-analysis", "statistics"}
				for _, sk := range defaultSkills {
					dir := filepath.Join(baseSkillsDir, sk)
					_ = os.MkdirAll(dir, 0755)
					_ = os.WriteFile(filepath.Join(dir, "prompt.md"), []byte(fmt.Sprintf("# %s Skill\n\nGuidelines and domain knowledge for %s.", sk, sk)), 0644)
					list = append(list, SkillItem{
						ID:          sk,
						Name:        sk,
						Description: fmt.Sprintf("Guidelines and domain knowledge for %s.", sk),
					})
				}
			}

			json.NewEncoder(w).Encode(list)

		case "POST":
			var sk SkillItem
			if err := json.NewDecoder(r.Body).Decode(&sk); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if sk.ID == "" {
				sk.ID = strings.ToLower(strings.ReplaceAll(sk.Name, " ", "-"))
			}
			dir := filepath.Join(baseSkillsDir, sk.ID)
			_ = os.MkdirAll(dir, 0755)
			if sk.Content != "" {
				_ = os.WriteFile(filepath.Join(dir, "prompt.md"), []byte(sk.Content), 0644)
			}
			json.NewEncoder(w).Encode(sk)

		case "DELETE":
			id := r.URL.Query().Get("id")
			if id == "" {
				http.Error(w, "missing id", http.StatusBadRequest)
				return
			}
			_ = os.RemoveAll(filepath.Join(baseSkillsDir, id))
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// --- Tools & Policies API ---

func (s *Server) handleTools() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		cwd, _ := os.Getwd()
		reg := agent.GetToolRegistry(nil, nil, cwd, s.db)

		type ToolDTO struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Signature   string `json:"signature"`
			Category    string `json:"category"`
		}

		var list []ToolDTO
		for _, t := range reg {
			list = append(list, ToolDTO{
				Name:        t.Name,
				Description: t.Description,
				Signature:   t.Signature,
				Category:    t.Category,
			})
		}
		json.NewEncoder(w).Encode(list)
	}
}

func (s *Server) handlePolicies() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			agentID := r.URL.Query().Get("agentId")
			policies, err := s.store.ListPolicies(agentID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(policies)

		case "POST":
			var p struct {
				AgentID  string `json:"agentId"`
				ToolName string `json:"toolName"`
				Effect   string `json:"effect"` // ALLOW, APPROVAL, DENY
			}
			if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if err := s.store.SetPolicy(p.AgentID, p.ToolName, p.Effect); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// --- Telegram Bots API ---

func (s *Server) handleTelegramBots() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			bots, err := s.store.ListTelegramBots()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			for i := range bots {
				if s.tg.IsRunning(bots[i].ID) {
					bots[i].Status = "running"
				} else {
					bots[i].Status = "stopped"
				}
			}
			json.NewEncoder(w).Encode(bots)

		case "POST":
			var b gateway.TelegramBotConfig
			if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if b.ID == "" {
				b.ID = "tg-" + strings.ToLower(strings.ReplaceAll(b.Name, " ", "-"))
			}
			if err := s.store.SaveTelegramBot(b); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			// If enabled, trigger start
			if b.Enabled && b.Token != "" {
				_ = s.tg.StartBot(b.ID)
			}
			json.NewEncoder(w).Encode(b)

		case "DELETE":
			id := r.URL.Query().Get("id")
			if id == "" {
				http.Error(w, "missing id", http.StatusBadRequest)
				return
			}
			_ = s.tg.StopBot(id)
			if err := s.store.DeleteTelegramBot(id); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleTelegramBotAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/telegram/bots/"), "/")
		if len(parts) < 2 {
			http.Error(w, "invalid URL format", http.StatusBadRequest)
			return
		}
		botID := parts[0]
		action := parts[1]

		switch action {
		case "start":
			err := s.tg.StartBot(botID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(map[string]string{"status": "running"})

		case "stop":
			_ = s.tg.StopBot(botID)
			json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})

		default:
			http.Error(w, "unknown action", http.StatusBadRequest)
		}
	}
}

// --- Base Endpoints ---

func (s *Server) handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"version": "0.5.0",
		})
	}
}

func (s *Server) handleStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var activeCount int
		_ = s.db.QueryRow("SELECT count(*) FROM gateways WHERE status = 'running'").Scan(&activeCount)

		sessions, _ := s.store.ListSessions()
		agents, _ := s.store.ListAgents()
		bots, _ := s.store.ListTelegramBots()

		runningBots := 0
		for _, b := range bots {
			if s.tg.IsRunning(b.ID) {
				runningBots++
			}
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":         "ok",
			"activeGateways": activeCount,
			"sessions":       len(sessions),
			"agents":         len(agents),
			"telegramBots":   runningBots,
			"version":        "0.5.0",
		})
	}
}

func (s *Server) handleGateways() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		list, err := gateways.ListGateways(s.db)
		if err != nil {
			http.Error(w, "Error fetching gateways", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	}
}

func (s *Server) handleChatCompletions() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var payload struct {
			Model     string          `json:"model"`
			Messages  []agent.Message `json:"messages"`
			SessionID string          `json:"sessionId"`
			AgentID   string          `json:"agentId"`
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		lastMsg := ""
		if len(payload.Messages) > 0 {
			lastMsg = payload.Messages[len(payload.Messages)-1].Content
		}

		sid := payload.SessionID
		if sid == "" {
			sid = "sess_" + uuid.New().String()[:8]
		}
		aid := payload.AgentID
		if aid == "" {
			aid = "engineer"
		}

		respMsg, err := s.runtime.ExecuteTurnWithModel(r.Context(), sid, aid, lastMsg, "api", payload.Model)
		if err != nil {
			http.Error(w, fmt.Sprintf("Turn error: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		msgMap := map[string]interface{}{
			"role":    "assistant",
			"content": respMsg.Content,
		}
		if respMsg.Thought != "" {
			msgMap["thought"] = respMsg.Thought
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      "chatcmpl-" + fmt.Sprintf("%d", time.Now().UnixNano()),
			"object":  "chat.completion",
			"created": time.Now().Unix(),
			"model":   respMsg.Model,
			"choices": []map[string]interface{}{
				{
					"index":         0,
					"message":       msgMap,
					"finish_reason": "stop",
				},
			},
		})
	}
}

// --- Web UI Handler ---

func (s *Server) handleWebUI() http.HandlerFunc {
	cwd, _ := os.Getwd()
	distDir := filepath.Join(cwd, "ui", "dist")
	webDir := filepath.Join(cwd, "web")

	return func(w http.ResponseWriter, r *http.Request) {
		activeDir := webDir
		if fi, err := os.Stat(distDir); err == nil && fi.IsDir() {
			activeDir = distDir
		}

		// If path corresponds to a static file in activeDir, serve it
		relPath := filepath.Clean(r.URL.Path)
		filePath := filepath.Join(activeDir, relPath)
		if fi, err := os.Stat(filePath); err == nil && !fi.IsDir() {
			http.ServeFile(w, r, filePath)
			return
		}

		// Otherwise serve index.html (SPA routing)
		indexPath := filepath.Join(activeDir, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			http.ServeFile(w, r, indexPath)
			return
		}

		// Fallback minimal response if web folder not built yet
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, `<!DOCTYPE html><html><head><title>KendaliAI Gateway</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center;"><h1>KendaliAI Agent Gateway</h1><p>WebUI files initializing...</p></body></html>`)
	}
}

// --- Embedding & Vector RAG Handlers ---

func (s *Server) handleEmbeddingConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			cfg, err := s.store.GetEmbeddingConfig()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(cfg)

		case "POST":
			var cfg gateway.EmbeddingConfig
			if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
				http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
				return
			}
			if err := s.store.SaveEmbeddingConfig(cfg); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(cfg)

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleEmbeddingTest() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")

		var req struct {
			Endpoint string `json:"endpoint"`
			APIKey   string `json:"apiKey"`
			Model    string `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}

		client := embedding.NewClientFromConfig(req.APIKey, req.Endpoint, req.Model)
		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()

		dims, err := client.TestConnection(ctx)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":    true,
			"dimensions": dims,
			"message":    fmt.Sprintf("Connection successful! Embedding model '%s' returned %d dimensions.", req.Model, dims),
		})
	}
}

type IngestDocumentPayload struct {
	SessionID string `json:"sessionId"`
	Title     string `json:"title"`
	Source    string `json:"source"`
	Content   string `json:"content"`
}

func (s *Server) handleDocumentIngest() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")

		var req IngestDocumentPayload
		contentType := r.Header.Get("Content-Type")

		if strings.HasPrefix(contentType, "multipart/form-data") {
			if err := r.ParseMultipartForm(32 << 20); err != nil {
				http.Error(w, "failed to parse multipart form: "+err.Error(), http.StatusBadRequest)
				return
			}
			req.SessionID = r.FormValue("sessionId")
			req.Title = r.FormValue("title")
			req.Source = r.FormValue("source")
			if req.Source == "" {
				req.Source = "upload"
			}

			file, header, err := r.FormFile("file")
			if err == nil && file != nil {
				defer file.Close()
				if req.Title == "" {
					req.Title = header.Filename
				}
				buf, _ := io.ReadAll(file)
				// Extract clean text from PDF or text file
				extracted, extErr := gateway.ExtractTextContent(header.Filename, buf)
				if extErr != nil {
					log.Printf("⚠️ Document text extraction note: %v", extErr)
					extracted = strings.ToValidUTF8(string(buf), "")
				}
				req.Content = extracted
			}
		} else {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
				return
			}
		}

		req.Content = strings.TrimSpace(req.Content)
		if req.Content == "" {
			http.Error(w, "document content cannot be empty or unreadable", http.StatusBadRequest)
			return
		}
		if req.Title == "" {
			req.Title = "Document (" + time.Now().Format("Jan 02 15:04") + ")"
		}

		// 1. Chunk document
		chunks := gateway.ChunkText(req.Content, 1500, 150)
		if len(chunks) == 0 {
			chunks = []string{req.Content}
		}

		// 2. Save to database immediately (fast, non-blocking)
		doc := gateway.Document{
			ID:         uuid.New().String(),
			SessionID:  req.SessionID,
			Title:      req.Title,
			Source:     req.Source,
			Content:    req.Content,
			CharCount:  len(req.Content),
			ChunkCount: len(chunks),
		}

		if err := s.store.IngestDocument(doc, chunks, nil); err != nil {
			http.Error(w, "failed to save document: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// 3. Asynchronously compute vector embeddings in background without freezing UI
		go func(docID string, docChunks []string) {
			embCfg, _ := s.store.GetEmbeddingConfig()
			if embCfg != nil && embCfg.Enabled && (embCfg.APIKey != "" || embCfg.Endpoint != "") {
				client := embedding.NewClientFromConfig(embCfg.APIKey, embCfg.Endpoint, embCfg.Model)
				ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
				defer cancel()

				embVecs, err := client.Embed(ctx, docChunks)
				if err != nil {
					log.Printf("⚠️ Background vector embedding note: %v", err)
					return
				}
				var floatVecs [][]float32
				for _, v := range embVecs {
					floatVecs = append(floatVecs, []float32(v))
				}
				_ = s.store.UpdateDocumentChunkEmbeddings(docID, floatVecs)
			}
		}(doc.ID, chunks)

		// 4. Return instant response
		s.bus.Publish(messaging.Event{
			Type:      "document.ingested",
			SessionID: req.SessionID,
			Payload: map[string]interface{}{
				"documentId": doc.ID,
				"title":      doc.Title,
				"chunkCount": len(chunks),
			},
		})

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":    true,
			"documentId": doc.ID,
			"title":      doc.Title,
			"charCount":  doc.CharCount,
			"chunkCount": len(chunks),
		})
	}
}

func (s *Server) handleDocuments() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			sessionID := r.URL.Query().Get("sessionId")
			docs, err := s.store.ListDocuments(sessionID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(docs)

		case "DELETE":
			id := r.URL.Query().Get("id")
			if id == "" {
				http.Error(w, "missing id query param", http.StatusBadRequest)
				return
			}
			if err := s.store.DeleteDocument(id); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleDocumentDetail() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/documents/")
		if id == "" {
			http.Error(w, "missing document id", http.StatusBadRequest)
			return
		}
		if r.Method == "DELETE" {
			if err := s.store.DeleteDocument(id); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
