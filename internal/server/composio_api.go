package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/composio"
)

const composioKeySetting = "composio_api_key"

func (s *Server) composioClient() *composio.Client {
	key := s.store.GetSetting(composioKeySetting)
	if key == "" {
		return nil
	}
	return composio.NewClient(key)
}

// handleComposioKey manages the project API key: GET presence, POST save,
// DELETE remove.
func (s *Server) handleComposioKey() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodGet:
			json.NewEncoder(w).Encode(map[string]bool{"configured": s.composioClient() != nil})
		case http.MethodPost:
			var req struct {
				APIKey string `json:"apiKey"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.APIKey) == "" {
				http.Error(w, "apiKey is required", http.StatusBadRequest)
				return
			}
			if err := s.store.SetSetting(composioKeySetting, strings.TrimSpace(req.APIKey)); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})
		case http.MethodDelete:
			_ = s.store.SetSetting(composioKeySetting, "")
			json.NewEncoder(w).Encode(map[string]bool{"ok": true})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// toolkitView matches the frontend ComposioToolkit contract.
type toolkitView struct {
	Slug              string `json:"slug"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	LogoURL           string `json:"logoUrl,omitempty"`
	Connected         bool   `json:"connected"`
	ConnectedAccountID string `json:"connectedAccountId,omitempty"`
	Status            string `json:"status,omitempty"`
	RedirectURL       string `json:"redirectUrl,omitempty"`
}

// handleConnectors serves GET /api/connectors (catalog + live connection
// state) and POST /api/connectors/{slug}/connect|disconnect.
func (s *Server) handleConnectors() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		rest := strings.TrimPrefix(r.URL.Path, "/api/connectors")
		if rest == "" || rest == "/" {
			s.listConnectors(w, r)
			return
		}
		parts := strings.Split(strings.Trim(rest, "/"), "/")
		if len(parts) == 1 && parts[0] == "status" {
			// handled below by len==2 case with slug=status id
		}
		if len(parts) == 2 {
			slug, action := parts[0], parts[1]
			if slug == "status" {
				s.connectorStatus(w, r, action)
				return
			}
			switch action {
			case "connect":
				s.connectorConnect(w, r, slug)
			case "disconnect":
				s.connectorDisconnect(w, r, slug)
			default:
				http.Error(w, "unknown action", http.StatusNotFound)
			}
			return
		}
		http.Error(w, "not found", http.StatusNotFound)
	}
}

func (s *Server) listConnectors(w http.ResponseWriter, r *http.Request) {
	client := s.composioClient()

	// Start from the curated catalog so the grid works before/without an
	// API key, then merge live catalog + connection state when available.
	catalog := make([]composio.Toolkit, len(composio.PopularToolkits))
	copy(catalog, composio.PopularToolkits)

	connected := map[string]composio.ConnectedAccount{}
	if client != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		if accounts, err := client.Accounts(ctx); err == nil {
			for _, acc := range accounts {
				if acc.Status == "ACTIVE" || acc.Status == "INITIATED" || acc.Status == "INITIALIZING" {
					connected[acc.ToolkitSlug] = acc
				}
			}
		} else {
			log.Printf("[composio] list accounts failed: %v", err)
		}
		if live, err := client.Toolkits(ctx); err == nil {
			bySlug := map[string]composio.Toolkit{}
			for _, t := range live {
				bySlug[strings.ToLower(t.Slug)] = t
			}
			merged := make([]composio.Toolkit, 0, len(catalog))
			for _, t := range catalog {
				if lt, ok := bySlug[t.Slug]; ok {
					if lt.Description != "" {
						t.Description = lt.Description
					}
					if lt.Logo != "" {
						t.Logo = lt.Logo
					}
				}
				merged = append(merged, t)
				delete(bySlug, t.Slug)
			}
			for slug, t := range bySlug { // extra live apps beyond the popular grid
				if connected[slug].Status != "" {
					merged = append(merged, t)
				}
			}
			catalog = merged
		}
	}

	out := make([]toolkitView, 0, len(catalog))
	for _, t := range catalog {
		view := toolkitView{Slug: t.Slug, Name: t.Name, Description: t.Description, LogoURL: t.Logo}
		if acc, ok := connected[t.Slug]; ok {
			view.Connected = acc.Status == "ACTIVE"
			view.ConnectedAccountID = acc.ID
			view.Status = acc.Status
		}
		out = append(out, view)
	}
	json.NewEncoder(w).Encode(out)
}

func (s *Server) connectorConnect(w http.ResponseWriter, r *http.Request, slug string) {
	client := s.composioClient()
	if client == nil {
		http.Error(w, "Composio API key not configured. Set it in Connections → Composio API Key.", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	acc, err := client.Connect(ctx, slug)
	if err != nil {
		log.Printf("[composio] connect %s failed: %v", slug, err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	json.NewEncoder(w).Encode(toolkitView{
		Slug:              slug,
		Name:              slug,
		Connected:         acc.Status == "ACTIVE",
		ConnectedAccountID: acc.ID,
		Status:            acc.Status,
		RedirectURL:       acc.RedirectURL,
	})
}

func (s *Server) connectorDisconnect(w http.ResponseWriter, r *http.Request, slug string) {
	client := s.composioClient()
	if client == nil {
		http.Error(w, "Composio API key not configured", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	accounts, err := client.Accounts(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	removed := 0
	for _, acc := range accounts {
		if acc.ToolkitSlug == slug && acc.Status != "FAILED" {
			if err := client.Disconnect(ctx, acc.ID); err == nil {
				removed++
			}
		}
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"connected": false, "removed": removed})
}

// connectorStatus polls one connected account during the OAuth round-trip.
func (s *Server) connectorStatus(w http.ResponseWriter, r *http.Request, accountID string) {
	client := s.composioClient()
	if client == nil {
		http.Error(w, "Composio API key not configured", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	acc, err := client.Account(ctx, accountID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	json.NewEncoder(w).Encode(toolkitView{
		Slug:              acc.ToolkitSlug,
		Connected:         acc.Status == "ACTIVE",
		ConnectedAccountID: acc.ID,
		Status:            acc.Status,
	})
}

// handleComposioTools lists executable actions for a toolkit, used by both
// the UI (action browser) and the agent-tool prompt builder.
func (s *Server) handleComposioTools() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		client := s.composioClient()
		if client == nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"tools": []composio.Tool{}})
			return
		}
		slug := r.URL.Query().Get("toolkit")
		if slug == "" {
			http.Error(w, "toolkit query param is required", http.StatusBadRequest)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		tools, err := client.Tools(ctx, slug)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"tools": tools})
	}
}
