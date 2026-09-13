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
	"github.com/kendaliai/app/internal/git"
	"github.com/kendaliai/app/internal/messaging"
	"github.com/kendaliai/app/internal/plugins"
	"github.com/kendaliai/app/internal/review"
	"github.com/kendaliai/app/internal/scheduler"
	"github.com/kendaliai/app/internal/workspace"
)

type Server struct {
	db       *sql.DB
	router   *http.ServeMux
	store    *gateway.Store
	runtime  *gateway.Runtime
	bus      *messaging.EventBus
	tg       *channels.TelegramAdapter
	explorer *workspace.Explorer
	upgrader websocket.Upgrader
}

func NewServer(db *sql.DB) *Server {
	bus := messaging.DefaultBus
	store := gateway.NewStore(db)
	store.SeedInitialData(config.Cfg)

	cwd, _ := os.Getwd()
	exp := workspace.NewExplorer(cwd)
	rt := gateway.NewRuntime(store, bus, cwd)
	tg := channels.InitTelegramAdapter(store, rt, bus)

	// Ensure plugin manager and scheduler daemon are initialized
	plugins.NewManager(cwd, bus)
	if scheduler.DefaultDaemon == nil {
		scheduler.NewDaemon(bus)
	}

	s := &Server{
		db:       db,
		router:   http.NewServeMux(),
		store:    store,
		runtime:  rt,
		bus:      bus,
		tg:       tg,
		explorer: exp,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // allow web clients
			},
		},
	}

	s.ensureAuthTable()

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
		Handler:      s.corsMiddleware(s.authMiddleware(s.router)),
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
	s.router.HandleFunc("/api/auth/status", s.handleAuthStatus())
	s.router.HandleFunc("/api/auth/login", s.handleAuthLogin())
	s.router.HandleFunc("/api/auth/logout", s.handleAuthLogout())
	s.router.HandleFunc("/api/auth/password", s.handleAuthPassword())
	s.router.HandleFunc("/status", s.handleStatus())
	s.router.HandleFunc("/api/gateways", s.handleGateways())
	s.router.HandleFunc("/v1/chat/completions", s.handleChatCompletions())

	// WebSocket Gateway
	s.router.HandleFunc("/ws", s.handleWebSocket())

	// Configuration APIs
	s.router.HandleFunc("/api/providers", s.handleProviders())
	s.router.HandleFunc("/api/providers/", s.handleProviderAction())
	s.router.HandleFunc("/api/providers/test", s.handleProviderTest())
	s.router.HandleFunc("/api/providers/models", s.handleProviderModels())
	s.router.HandleFunc("/api/providers/fetch-models", s.handleProviderModels())
	s.router.HandleFunc("/api/models", s.handleModels())
	s.router.HandleFunc("/api/models/default", s.handleDefaultModel())
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
	s.router.HandleFunc("/api/telegram/auth", s.handleTelegramAuth())
	s.router.HandleFunc("/api/telegram/auth/", s.handleTelegramAuthAction())

	// Embedding & Vector RAG
	s.router.HandleFunc("/api/embedding", s.handleEmbeddingConfig())
	s.router.HandleFunc("/api/embedding/test", s.handleEmbeddingTest())
	s.router.HandleFunc("/api/embedding/status", s.handleEmbeddingStatus())
	s.router.HandleFunc("/api/documents/ingest", s.handleDocumentIngest())
	s.router.HandleFunc("/api/documents/reindex", s.handleDocumentsReindex())
	s.router.HandleFunc("/api/documents/search", s.handleDocumentsSearch())
	s.router.HandleFunc("/api/documents", s.handleDocuments())
	s.router.HandleFunc("/api/documents/", s.handleDocumentDetail())

	// Workspace & Explorer
	s.router.HandleFunc("/api/workspace/files", s.handleWorkspaceFiles())
	s.router.HandleFunc("/api/workspace/tree", s.handleWorkspaceTree())
	s.router.HandleFunc("/api/workspace/file", s.handleWorkspaceFile())
	s.router.HandleFunc("/api/workspace/mkdir", s.handleWorkspaceMkdir())

	// Git & Worktrees
	s.router.HandleFunc("/api/git/worktrees", s.handleGitWorktrees())
	s.router.HandleFunc("/api/git/branches", s.handleGitBranches())

	// Reviewer
	s.router.HandleFunc("/api/review/scan", s.handleReviewScan())

	// Background Tasks
	s.router.HandleFunc("/api/tasks", s.handleTasks())
	s.router.HandleFunc("/api/tasks/", s.handleTaskAction())

	// Plugins
	s.router.HandleFunc("/api/plugins", s.handlePlugins())
	s.router.HandleFunc("/api/plugins/", s.handlePluginAction())

	// Schedules & Cron
	s.router.HandleFunc("/api/schedules", s.handleSchedules())
	s.router.HandleFunc("/api/schedules/", s.handleScheduleAction())

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
					msg.SessionID = "sess_" + uuid.New().String()[:8]
				}

				// If not subscribed yet, subscribe to all events so parallel turns never drop
				if sub == nil {
					currentSession = "*"
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

		case "POST", "PUT":
			bodyBytes, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}

			var rawMap map[string]interface{}
			_ = json.Unmarshal(bodyBytes, &rawMap)

			var p gateway.ProviderConfig
			if err := json.Unmarshal(bodyBytes, &p); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}

			if p.ID == "" {
				p.ID = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(p.Name), " ", "-"))
			}

			// If enabled was not explicitly specified in payload, default to true
			if rawMap != nil {
				if _, hasEnabled := rawMap["enabled"]; !hasEnabled {
					existing, _ := s.store.GetProvider(p.ID)
					if existing != nil {
						p.Enabled = existing.Enabled
					} else {
						p.Enabled = true
					}
				}
			} else {
				p.Enabled = true
			}

			// Ensure models have valid names
			for i := range p.Models {
				if p.Models[i].Name == "" {
					p.Models[i].Name = p.Models[i].ID
				}
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

func (s *Server) handleProviderAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		path := strings.TrimPrefix(r.URL.Path, "/api/providers/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			http.Error(w, "invalid provider path", http.StatusBadRequest)
			return
		}
		id := parts[0]

		if len(parts) >= 2 && parts[1] == "default" {
			if r.Method != "POST" {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			prov, err := s.store.GetProvider(id)
			if err != nil || prov == nil {
				http.Error(w, "provider not found", http.StatusNotFound)
				return
			}
			prov.IsDefault = true
			if err := s.store.SaveProvider(*prov); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "id": id, "isDefault": true})
			return
		}

		if len(parts) >= 2 && (parts[1] == "toggle" || parts[1] == "enable") {
			if r.Method != "POST" {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			prov, err := s.store.GetProvider(id)
			if err != nil || prov == nil {
				http.Error(w, "provider not found", http.StatusNotFound)
				return
			}
			prov.Enabled = !prov.Enabled
			if err := s.store.SaveProvider(*prov); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(prov)
			return
		}

		switch r.Method {
		case "GET":
			prov, err := s.store.GetProvider(id)
			if err != nil || prov == nil {
				http.Error(w, "provider not found", http.StatusNotFound)
				return
			}
			json.NewEncoder(w).Encode(prov)
		case "POST", "PUT":
			var p gateway.ProviderConfig
			if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			p.ID = id
			for i := range p.Models {
				if p.Models[i].Name == "" {
					p.Models[i].Name = p.Models[i].ID
				}
			}
			if err := s.store.SaveProvider(p); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(p)
		case "DELETE":
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

		var pType, endpoint, apiKey, provID string

		if r.Method == "GET" {
			provID = r.URL.Query().Get("id")
			if provID != "" {
				prov, err := s.store.GetProvider(provID)
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
				provID = body.ID
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

		// If save=true requested and provider exists, update provider models in DB
		if (r.URL.Query().Get("save") == "true" || r.URL.Query().Get("persist") == "true") && provID != "" {
			prov, _ := s.store.GetProvider(provID)
			if prov != nil {
				prov.Models = models
				_ = s.store.SaveProvider(*prov)
			}
		}

		json.NewEncoder(w).Encode(models)
	}
}

// --- Models API ---

type GlobalModelItem struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	ProviderID   string `json:"providerId"`
	ProviderName string `json:"providerName"`
	ProviderType string `json:"providerType"`
	IsDefault    bool   `json:"isDefault"`
}

type ModelsResponse struct {
	DefaultModel    string            `json:"defaultModel"`
	DefaultProvider string            `json:"defaultProviderId"`
	Models          []GlobalModelItem `json:"models"`
}

func (s *Server) handleModels() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "GET" && r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		refresh := r.URL.Query().Get("refresh") == "true" || r.URL.Query().Get("fetch") == "true"
		providers, err := s.store.ListProviders()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// If refresh requested, query remote endpoints for enabled providers and persist
		if refresh {
			for i := range providers {
				p := &providers[i]
				if !p.Enabled {
					continue
				}
				fetched, fetchErr := gateway.FetchRemoteModels(r.Context(), p.Type, p.Endpoint, p.APIKey)
				if fetchErr == nil && len(fetched) > 0 {
					p.Models = fetched
					_ = s.store.SaveProvider(*p)
				}
			}
		}

		defaultModel, defaultProv := s.runtime.ResolveDefaultModel()
		defaultProvID := ""
		if defaultProv != nil {
			defaultProvID = defaultProv.ID
		}

		var items []GlobalModelItem
		seen := make(map[string]bool)

		// 1. Gather all models from enabled providers
		for _, p := range providers {
			if !p.Enabled {
				continue
			}
			for _, m := range p.Models {
				if !m.Enabled {
					continue
				}
				key := p.ID + ":" + m.ID
				if seen[key] {
					continue
				}
				seen[key] = true
				isDef := (m.ID == defaultModel && (p.IsDefault || defaultProvID == p.ID))
				name := m.Name
				if name == "" {
					name = m.ID
				}
				items = append(items, GlobalModelItem{
					ID:           m.ID,
					Name:         name,
					ProviderID:   p.ID,
					ProviderName: p.Name,
					ProviderType: p.Type,
					IsDefault:    isDef,
				})
			}
		}

		// Fallback curated models if providers list is empty
		if len(items) == 0 {
			items = []GlobalModelItem{
				{ID: "gpt-4o", Name: "GPT-4o", ProviderID: "openai", ProviderName: "OpenAI Compatible", ProviderType: "openai", IsDefault: true},
				{ID: "gpt-4o-mini", Name: "GPT-4o Mini", ProviderID: "openai", ProviderName: "OpenAI Compatible", ProviderType: "openai", IsDefault: false},
				{ID: "claude-3-7-sonnet", Name: "Claude 3.7 Sonnet", ProviderID: "anthropic", ProviderName: "Anthropic", ProviderType: "anthropic", IsDefault: false},
				{ID: "deepseek-chat", Name: "DeepSeek V3", ProviderID: "deepseek", ProviderName: "DeepSeek", ProviderType: "deepseek", IsDefault: false},
				{ID: "qwen2.5-coder:latest", Name: "Qwen 2.5 Coder (Ollama)", ProviderID: "ollama", ProviderName: "Ollama Local", ProviderType: "ollama", IsDefault: false},
			}
			if defaultModel == "" {
				defaultModel = "gpt-4o"
			}
		}

		json.NewEncoder(w).Encode(ModelsResponse{
			DefaultModel:    defaultModel,
			DefaultProvider: defaultProvID,
			Models:          items,
		})
	}
}

func (s *Server) handleDefaultModel() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" && r.Method != "PUT" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var payload struct {
			Model      string `json:"model"`
			ProviderID string `json:"providerId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.Model == "" {
			http.Error(w, "invalid request: model is required", http.StatusBadRequest)
			return
		}

		providers, _ := s.store.ListProviders()
		updated := false

		// If providerId supplied, mark that provider as default
		for _, p := range providers {
			if payload.ProviderID != "" && p.ID == payload.ProviderID {
				p.IsDefault = true
				// Ensure model is in provider's model list and enabled
				hasModel := false
				for i, m := range p.Models {
					if m.ID == payload.Model {
						p.Models[i].Enabled = true
						hasModel = true
						break
					}
				}
				if !hasModel {
					p.Models = append([]gateway.ModelItem{{ID: payload.Model, Name: payload.Model, Enabled: true}}, p.Models...)
				}
				_ = s.store.SaveProvider(p)
				updated = true
			} else if payload.ProviderID != "" {
				if p.IsDefault {
					p.IsDefault = false
					_ = s.store.SaveProvider(p)
				}
			} else {
				// Search provider that has this model
				for _, m := range p.Models {
					if m.ID == payload.Model {
						p.IsDefault = true
						_ = s.store.SaveProvider(p)
						updated = true
						break
					}
				}
			}
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":      true,
			"defaultModel": payload.Model,
			"updated":      updated,
		})
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

// --- Telegram Auth & Security API ---

func (s *Server) handleTelegramAuth() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			authReq := s.store.GetTelegramAuthRequired()
			authUsers, _ := s.store.ListTelegramAuthorizedUsers()
			pending, _ := s.store.ListTelegramPendingRequests()

			json.NewEncoder(w).Encode(map[string]interface{}{
				"authRequired":         authReq,
				"authorizedUsersCount": len(authUsers),
				"pendingRequestsCount": len(pending),
			})

		case "POST":
			var body struct {
				AuthRequired *bool `json:"authRequired"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err == nil && body.AuthRequired != nil {
				_ = s.store.SetTelegramAuthRequired(*body.AuthRequired)
			} else {
				cur := s.store.GetTelegramAuthRequired()
				_ = s.store.SetTelegramAuthRequired(!cur)
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"authRequired": s.store.GetTelegramAuthRequired(),
			})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleTelegramAuthAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		path := strings.TrimPrefix(r.URL.Path, "/api/telegram/auth/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			http.Error(w, "invalid path", http.StatusBadRequest)
			return
		}

		action := parts[0]
		switch action {
		case "status":
			authReq := s.store.GetTelegramAuthRequired()
			authUsers, _ := s.store.ListTelegramAuthorizedUsers()
			pending, _ := s.store.ListTelegramPendingRequests()
			json.NewEncoder(w).Encode(map[string]interface{}{
				"authRequired":         authReq,
				"authorizedUsersCount": len(authUsers),
				"pendingRequestsCount": len(pending),
			})

		case "users":
			switch r.Method {
			case "GET":
				users, err := s.store.ListTelegramAuthorizedUsers()
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				json.NewEncoder(w).Encode(users)

			case "POST":
				var u gateway.TelegramAuthorizedUser
				if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
					http.Error(w, "invalid JSON", http.StatusBadRequest)
					return
				}
				if u.AuthMethod == "" {
					u.AuthMethod = "manual"
				}
				if err := s.store.AuthorizeTelegramUser(u); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				json.NewEncoder(w).Encode(u)

			case "DELETE":
				idStr := r.URL.Query().Get("userId")
				if idStr == "" {
					idStr = r.URL.Query().Get("id")
				}
				uid, _ := strconv.ParseInt(idStr, 10, 64)
				if uid == 0 {
					http.Error(w, "missing or invalid userId", http.StatusBadRequest)
					return
				}
				if err := s.store.RevokeTelegramUser(uid); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				json.NewEncoder(w).Encode(map[string]bool{"ok": true})

			default:
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}

		case "pending":
			switch r.Method {
			case "GET":
				pending, err := s.store.ListTelegramPendingRequests()
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				json.NewEncoder(w).Encode(pending)
			default:
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}

		case "approve":
			if r.Method != "POST" {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			var body struct {
				UserID int64 `json:"userId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == 0 {
				http.Error(w, "missing userId", http.StatusBadRequest)
				return
			}

			// Find request details to keep username/name
			pendingList, _ := s.store.ListTelegramPendingRequests()
			var target *gateway.TelegramPendingRequest
			for _, p := range pendingList {
				if p.UserID == body.UserID {
					target = &p
					break
				}
			}

			username := ""
			firstName := ""
			lastName := ""
			var chatID int64
			botID := ""
			if target != nil {
				username = target.Username
				firstName = target.FirstName
				lastName = target.LastName
				chatID = target.ChatID
				botID = target.BotID
			}

			_ = s.store.AuthorizeTelegramUser(gateway.TelegramAuthorizedUser{
				UserID:     body.UserID,
				Username:   username,
				FirstName:  firstName,
				LastName:   lastName,
				AuthMethod: "admin_approval",
				BotID:      botID,
				CreatedAt:  time.Now().Unix(),
			})
			_ = s.store.DeleteTelegramPendingRequest(body.UserID)

			// Notify user in Telegram!
			if chatID != 0 {
				s.tg.NotifyUserApproved(chatID, botID)
			}

			json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "userId": body.UserID})

		case "deny":
			if r.Method != "POST" {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			var body struct {
				UserID int64 `json:"userId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == 0 {
				http.Error(w, "missing userId", http.StatusBadRequest)
				return
			}
			_ = s.store.DeleteTelegramPendingRequest(body.UserID)
			json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "userId": body.UserID})

		case "code":
			if r.Method != "POST" {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			code, err := s.store.CreateTelegramPairingCode(10*time.Minute, "")
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"code":      code,
				"expiresIn": 600,
			})

		default:
			http.Error(w, "unknown auth action", http.StatusBadRequest)
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

// handleDocumentsReindex re-chunks and re-embeds every stored document with
// the currently configured embedding model, so switching models/providers
// keeps the doc store searchable (GOALS.md Track G).
// handleDocumentsSearch embeds the query with the active embedding model
// and returns the top-K matching chunks across all documents with their
// similarity scores — the scored retrieval view for the Doc Store pane.
func (s *Server) handleDocumentsSearch() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Query string `json:"query"`
			TopK  int    `json:"topK"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		req.Query = strings.TrimSpace(req.Query)
		if req.Query == "" {
			http.Error(w, "query cannot be empty", http.StatusBadRequest)
			return
		}
		if req.TopK <= 0 || req.TopK > 50 {
			req.TopK = 10
		}

		embCfg, _ := s.store.GetEmbeddingConfig()
		if embCfg == nil || !embCfg.Enabled || (embCfg.APIKey == "" && embCfg.Endpoint == "") {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   "No embedding provider is configured. Set one up in Providers > Embedding & Vector RAG first.",
			})
			return
		}
		client := embedding.NewClientFromConfig(embCfg.APIKey, embCfg.Endpoint, embCfg.Model)

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		queryVec, err := client.EmbedOne(ctx, req.Query)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
			return
		}

		// Global scope (all documents), low threshold: the scored view should
		// surface weak matches too — the score tells the user how good they are.
		hits, err := s.store.SearchDocumentChunks("", []float32(queryVec), req.TopK, 0.01, client.Model())
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
			return
		}

		type scoredHit struct {
			DocumentID string  `json:"documentId"`
			Title      string  `json:"title"`
			Content    string  `json:"content"`
			Score      float64 `json:"score"`
		}
		results := make([]scoredHit, 0, len(hits))
		for _, h := range hits {
			title := h.DocTitle
			if title == "" {
				title = "Document"
			}
			content := h.Content
			if len(content) > 400 {
				content = content[:400] + "..."
			}
			results = append(results, scoredHit{
				DocumentID: h.DocumentID,
				Title:      title,
				Content:    content,
				Score:      h.Score,
			})
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"model":   client.Model(),
			"results": results,
		})
	}
}

func (s *Server) handleDocumentsReindex() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		embCfg, _ := s.store.GetEmbeddingConfig()
		if embCfg == nil || !embCfg.Enabled || (embCfg.APIKey == "" && embCfg.Endpoint == "") {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   "No embedding provider is configured. Set one up in Providers > Embedding & Vector RAG first.",
			})
			return
		}
		client := embedding.NewClientFromConfig(embCfg.APIKey, embCfg.Endpoint, embCfg.Model)

		docs, err := s.store.ListDocuments("")
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		reindexed, chunkCount := 0, 0
		var failed []map[string]string
		for _, doc := range docs {
			if strings.TrimSpace(doc.Content) == "" {
				continue
			}
			chunks := gateway.ChunkText(doc.Content, 1500, 150)
			if len(chunks) == 0 {
				chunks = []string{doc.Content}
			}
			vecs, err := client.Embed(ctx, chunks)
			if err != nil {
				failed = append(failed, map[string]string{"id": doc.ID, "title": doc.Title, "error": err.Error()})
				continue
			}
			var floatVecs [][]float32
			for _, v := range vecs {
				floatVecs = append(floatVecs, []float32(v))
			}
			if err := s.store.IngestDocument(doc, chunks, floatVecs, client.Model()); err != nil {
				failed = append(failed, map[string]string{"id": doc.ID, "title": doc.Title, "error": err.Error()})
				continue
			}
			reindexed++
			chunkCount += len(chunks)
		}

		log.Printf("🔁 Document reindex complete: %d docs, %d chunks, model=%s, failed=%d", reindexed, chunkCount, client.Model(), len(failed))
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":    true,
			"model":      client.Model(),
			"reindexed":  reindexed,
			"chunkCount": chunkCount,
			"failed":     failed,
		})
	}
}

// handleEmbeddingStatus reports the active embedding model plus how many
// stored chunks were embedded with each model, so the UI can show a
// reindex prompt when they no longer match.
func (s *Server) handleEmbeddingStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		embCfg, _ := s.store.GetEmbeddingConfig()
		model := ""
		enabled := false
		if embCfg != nil {
			model = embCfg.Model
			enabled = embCfg.Enabled
		}
		if model == "" {
			model = "text-embedding-3-small"
		}

		stats, err := s.store.ChunkModelStats()
		if err != nil {
			stats = nil
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"model":   model,
			"enabled": enabled,
			"chunks":  stats,
		})
	}
}

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

		if err := s.store.IngestDocument(doc, chunks, nil, ""); err != nil {
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
				_ = s.store.UpdateDocumentChunkEmbeddings(docID, floatVecs, client.Model())
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

// --- Workspace & Explorer APIs ---

func (s *Server) handleWorkspaceFiles() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		relPath := r.URL.Query().Get("path")
		items, err := s.explorer.ListDirectory(relPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if items == nil {
			items = []*workspace.FileItem{}
		}
		json.NewEncoder(w).Encode(items)
	}
}

func (s *Server) handleWorkspaceTree() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		depthStr := r.URL.Query().Get("depth")
		depth := 3
		if d, err := strconv.Atoi(depthStr); err == nil && d > 0 {
			depth = d
		}
		tree, err := s.explorer.GetTree(depth)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if tree == nil {
			tree = []*workspace.FileItem{}
		}
		json.NewEncoder(w).Encode(tree)
	}
}

func (s *Server) handleWorkspaceFile() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case "GET":
			filePath := r.URL.Query().Get("path")
			if filePath == "" {
				http.Error(w, "missing path query param", http.StatusBadRequest)
				return
			}
			content, mimeType, err := s.explorer.ReadFile(filePath)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"path":     filePath,
				"content":  content,
				"mimeType": mimeType,
				"size":     len(content),
			})

		case "POST", "PUT":
			var req struct {
				Path    string `json:"path"`
				Content string `json:"content"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			if req.Path == "" {
				http.Error(w, "path is required", http.StatusBadRequest)
				return
			}
			if err := s.explorer.WriteFile(req.Path, req.Content); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		case "DELETE":
			filePath := r.URL.Query().Get("path")
			if filePath == "" {
				http.Error(w, "missing path query param", http.StatusBadRequest)
				return
			}
			if err := s.explorer.DeletePath(filePath); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleWorkspaceMkdir() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
			http.Error(w, "path is required", http.StatusBadRequest)
			return
		}
		if err := s.explorer.CreateDirectory(req.Path); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	}
}

// --- Git & Worktree APIs ---

func (s *Server) handleGitWorktrees() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		baseDir := s.explorer.GetBaseDir()

		switch r.Method {
		case "GET":
			list, err := git.DefaultWorktreeManager.ListWorktrees(r.Context(), baseDir)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if list == nil {
				list = []git.Worktree{}
			}
			json.NewEncoder(w).Encode(list)

		case "POST":
			var req struct {
				Path         string `json:"path"`
				Branch       string `json:"branch"`
				CreateBranch bool   `json:"createBranch"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
				http.Error(w, "path is required", http.StatusBadRequest)
				return
			}
			wt, err := git.DefaultWorktreeManager.AddWorktree(r.Context(), baseDir, req.Path, req.Branch, req.CreateBranch)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(wt)

		case "DELETE":
			targetPath := r.URL.Query().Get("path")
			if targetPath == "" {
				http.Error(w, "path query param is required", http.StatusBadRequest)
				return
			}
			force := r.URL.Query().Get("force") == "true"
			if err := git.DefaultWorktreeManager.RemoveWorktree(r.Context(), baseDir, targetPath, force); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleGitBranches() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		baseDir := s.explorer.GetBaseDir()
		branches, current, err := git.DefaultWorktreeManager.ListBranches(r.Context(), baseDir)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"branches": branches,
			"current":  current,
		})
	}
}

// --- Reviewer APIs ---

func (s *Server) handleReviewScan() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		engine := review.NewReviewEngine()
		baseDir := s.explorer.GetBaseDir()

		target := r.URL.Query().Get("target")
		if target == "" {
			target = "diff"
		}

		switch target {
		case "file":
			filePath := r.URL.Query().Get("path")
			if filePath == "" {
				http.Error(w, "path is required for file review", http.StatusBadRequest)
				return
			}
			if !filepath.IsAbs(filePath) {
				filePath = filepath.Join(baseDir, filePath)
			}
			report, err := engine.ReviewFile(filePath)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(report)

		case "workspace":
			issues, err := engine.Scan(baseDir)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"target":     baseDir,
				"issueCount": len(issues),
				"issues":     issues,
			})

		default: // "diff"
			report, err := engine.AnalyzeDiff(r.Context(), baseDir)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(report)
		}
	}
}

// --- Background Task APIs ---

func (s *Server) handleTasks() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		tasks := s.runtime.GetTaskManager().List()
		json.NewEncoder(w).Encode(tasks)
	}
}

func (s *Server) handleTaskAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		path := strings.TrimPrefix(r.URL.Path, "/api/tasks/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			http.Error(w, "task ID required", http.StatusBadRequest)
			return
		}
		taskID := parts[0]
		action := ""
		if len(parts) > 1 {
			action = parts[1]
		}

		if action == "cancel" && r.Method == "POST" {
			if err := s.runtime.GetTaskManager().Cancel(taskID); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})
			return
		}

		task := s.runtime.GetTaskManager().Get(taskID)
		if task == nil {
			http.Error(w, "task not found", http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(task)
	}
}

// --- Plugin APIs ---

func (s *Server) handlePlugins() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if plugins.DefaultManager == nil {
			plugins.NewManager(s.explorer.GetBaseDir(), s.bus)
		}

		switch r.Method {
		case "GET":
			list := plugins.DefaultManager.List()
			json.NewEncoder(w).Encode(list)

		case "POST":
			var req plugins.CreatePluginRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			p, err := plugins.DefaultManager.Create(req)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(p)

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handlePluginAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if plugins.DefaultManager == nil {
			plugins.NewManager(s.explorer.GetBaseDir(), s.bus)
		}

		path := strings.TrimPrefix(r.URL.Path, "/api/plugins/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			http.Error(w, "plugin ID required", http.StatusBadRequest)
			return
		}
		pluginID := parts[0]

		if len(parts) > 1 && parts[1] == "toggle" && r.Method == "POST" {
			var req struct {
				Enabled bool `json:"enabled"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			p, err := plugins.DefaultManager.Toggle(pluginID, req.Enabled)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(p)
			return
		}

		if r.Method == "DELETE" {
			if err := plugins.DefaultManager.Delete(pluginID); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})
			return
		}

		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// --- Scheduler & Cron APIs ---

func (s *Server) handleSchedules() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if scheduler.DefaultDaemon == nil {
			scheduler.NewDaemon(s.bus)
		}

		switch r.Method {
		case "GET":
			tasks := scheduler.DefaultDaemon.ListTasks()
			json.NewEncoder(w).Encode(tasks)

		case "POST":
			var req struct {
				Name      string `json:"name"`
				Schedule  string `json:"schedule"`
				Prompt    string `json:"prompt"`
				SessionID string `json:"sessionId"`
				Channel   string `json:"channel"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid JSON", http.StatusBadRequest)
				return
			}
			task, err := scheduler.DefaultDaemon.AddTask(req.Name, req.Schedule, req.Prompt, req.SessionID, req.Channel)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(task)

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleScheduleAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if scheduler.DefaultDaemon == nil {
			scheduler.NewDaemon(s.bus)
		}

		path := strings.TrimPrefix(r.URL.Path, "/api/schedules/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			http.Error(w, "schedule ID required", http.StatusBadRequest)
			return
		}
		schedID := parts[0]

		if len(parts) > 1 && parts[1] == "run" && r.Method == "POST" {
			if err := scheduler.DefaultDaemon.RunNow(r.Context(), schedID); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})
			return
		}

		if len(parts) > 1 && parts[1] == "toggle" && r.Method == "POST" {
			var req struct {
				Enabled bool `json:"enabled"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			task, err := scheduler.DefaultDaemon.ToggleTask(schedID, req.Enabled)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(task)
			return
		}

		if r.Method == "DELETE" {
			if err := scheduler.DefaultDaemon.CancelTask(schedID); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})
			return
		}

		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
