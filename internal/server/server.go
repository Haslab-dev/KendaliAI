package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/gateways"
	"github.com/kendaliai/app/internal/providers"
)

type Server struct {
	db     *sql.DB
	config *config.Config
	router *http.ServeMux
}

func NewServer(db *sql.DB, cfg *config.Config) *Server {
	s := &Server{
		db:     db,
		config: cfg,
		router: http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) Start(port string) error {
	addr := fmt.Sprintf(":%s", port)
	log.Printf("🚀 Starting KendaliAI Server on %s\n", addr)

	srv := &http.Server{
		Addr:         addr,
		Handler:      s.corsMiddleware(s.router),
		ReadTimeout:  10 * time.Second,
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
	s.router.HandleFunc("/health", s.handleHealth())
	s.router.HandleFunc("/status", s.handleStatus())
	s.router.HandleFunc("/api/gateways", s.handleGateways())
	s.router.HandleFunc("/v1/chat/completions", s.handleChatCompletions())
}

func (s *Server) handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"version": "0.2.0",
		})
	}
}

func (s *Server) handleStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Fetch active gateways from db
		var activeCount int
		err := s.db.QueryRow("SELECT count(*) FROM gateways WHERE status = 'running'").Scan(&activeCount)

		status := "ok"
		if err != nil {
			status = "error"
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":         status,
			"activeGateways": activeCount,
			"version":        "0.2.0",
		})
	}
}

func (s *Server) handleGateways() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

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
			Model    string          `json:"model"`
			Messages []agent.Message `json:"messages"`
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		modelRequested := payload.Model
		var aiResponse *agent.Response

		var p agent.Provider
		if len(modelRequested) >= 3 && modelRequested[:3] == "zai" {
			apiKey := os.Getenv("ZAI_API_KEY")
			if apiKey == "" {
				http.Error(w, "ZAI_API_KEY not found in environment", http.StatusUnauthorized)
				return
			}
			p = providers.NewZAIProvider(apiKey, modelRequested)
		} else {
			apiKey := os.Getenv("DEEPSEEK_API_KEY")
			if apiKey == "" {
				http.Error(w, "DEEPSEEK_API_KEY not found in environment", http.StatusUnauthorized)
				return
			}
			p = providers.NewDeepSeekProvider(apiKey, modelRequested)
		}

		lastMsg := ""
		if len(payload.Messages) > 0 {
			lastMsg = payload.Messages[len(payload.Messages)-1].Content
		}

		loop := agent.NewCognitionLoop(p, 25, s.config)
		finalResp, err := loop.Run(r.Context(), lastMsg)
		if err != nil {
			http.Error(w, fmt.Sprintf("AI error: %v", err), http.StatusInternalServerError)
			return
		}

		aiResponse = &agent.Response{Content: finalResp}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      "chatcmpl-" + fmt.Sprintf("%d", time.Now().UnixNano()),
			"object":  "chat.completion",
			"created": time.Now().Unix(),
			"model":   modelRequested,
			"choices": []map[string]interface{}{
				{
					"index": 0,
					"message": map[string]string{
						"role":    "assistant",
						"content": aiResponse.Content,
					},
					"finish_reason": "stop",
				},
			},
		})
	}
}
