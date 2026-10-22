package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// Connector represents an integrated tool connector (e.g. via Composio)
type Connector struct {
	Slug               string `json:"slug"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	Category           string `json:"category"`
	Connected          bool   `json:"connected"`
	ConnectedAccountID string `json:"connectedAccountId,omitempty"`
	AuthURL            string `json:"authUrl,omitempty"`
}

var defaultConnectors = []Connector{
	{
		Slug:        "github",
		Name:        "GitHub",
		Description: "Create issues, review pull requests, and commit code directly.",
		Category:    "Development",
	},
	{
		Slug:        "gmail",
		Name:        "Gmail",
		Description: "Search emails, read threads, and draft replies.",
		Category:    "Communication",
	},
	{
		Slug:        "googlecalendar",
		Name:        "Google Calendar",
		Description: "Inspect availability, schedule meetings, and send invites.",
		Category:    "Productivity",
	},
	{
		Slug:        "slack",
		Name:        "Slack",
		Description: "Post updates to channels, notify team members, and read messages.",
		Category:    "Communication",
	},
	{
		Slug:        "linear",
		Name:        "Linear",
		Description: "Manage backlog issues, create tickets, and update cycles.",
		Category:    "Project Management",
	},
	{
		Slug:        "notion",
		Name:        "Notion",
		Description: "Search documentation, update database rows, and create pages.",
		Category:    "Knowledge Base",
	},
	{
		Slug:        "jira",
		Name:        "Jira Software",
		Description: "Track enterprise issues, transitions, and sprint boards.",
		Category:    "Project Management",
	},
	{
		Slug:        "discord",
		Name:        "Discord",
		Description: "Send announcements, monitor discord channels, and interact with community.",
		Category:    "Communication",
	},
}

func (s *Server) initConnectorsTable() {
	if s.db == nil {
		return
	}
	query := `CREATE TABLE IF NOT EXISTS connectors (
		slug TEXT PRIMARY KEY,
		connected INTEGER NOT NULL DEFAULT 0,
		account_id TEXT NOT NULL DEFAULT '',
		updated_at INTEGER NOT NULL DEFAULT 0
	);`
	_, _ = s.db.Exec(query)
}

func (s *Server) handleConnectors() http.HandlerFunc {
	s.initConnectorsTable()
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.Method {
		case http.MethodGet:
			// Fetch connected status from DB
			connectedMap := make(map[string]struct {
				connected bool
				accountID string
			})

			if s.db != nil {
				rows, err := s.db.Query(`SELECT slug, connected, account_id FROM connectors`)
				if err == nil {
					defer rows.Close()
					for rows.Next() {
						var slug, accountID string
						var connected int
						if err := rows.Scan(&slug, &connected, &accountID); err == nil {
							connectedMap[slug] = struct {
								connected bool
								accountID string
							}{connected: connected == 1, accountID: accountID}
						}
					}
				}
			}

			result := make([]Connector, len(defaultConnectors))
			for i, conn := range defaultConnectors {
				res := conn
				if status, found := connectedMap[conn.Slug]; found {
					res.Connected = status.connected
					res.ConnectedAccountID = status.accountID
				}
				result[i] = res
			}

			_ = json.NewEncoder(w).Encode(result)

		case http.MethodPost:
			var req struct {
				Slug               string `json:"slug"`
				Connected          bool   `json:"connected"`
				ConnectedAccountID string `json:"connectedAccountId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}

			if s.db != nil {
				connVal := 0
				if req.Connected {
					connVal = 1
				}
				_, _ = s.db.Exec(`INSERT INTO connectors (slug, connected, account_id, updated_at) 
					VALUES (?, ?, ?, ?) 
					ON CONFLICT(slug) DO UPDATE SET 
						connected = excluded.connected,
						account_id = excluded.account_id,
						updated_at = excluded.updated_at`,
					req.Slug, connVal, req.ConnectedAccountID, time.Now().Unix(),
				)
			}

			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func (s *Server) handleConnectorAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) < 3 {
			http.Error(w, "invalid path", http.StatusBadRequest)
			return
		}
		slug := parts[2]
		action := ""
		if len(parts) >= 4 {
			action = parts[3]
		}

		if action == "disconnect" {
			if s.db != nil {
				_, _ = s.db.Exec(`UPDATE connectors SET connected = 0, account_id = '', updated_at = ? WHERE slug = ?`,
					time.Now().Unix(), slug)
			}
			_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
			return
		}

		// Connect / Authorize
		accountID := "acc_" + slug + "_" + time.Now().Format("060102")
		if s.db != nil {
			_, _ = s.db.Exec(`INSERT INTO connectors (slug, connected, account_id, updated_at) 
				VALUES (?, 1, ?, ?) 
				ON CONFLICT(slug) DO UPDATE SET 
					connected = 1,
					account_id = excluded.account_id,
					updated_at = excluded.updated_at`,
				slug, accountID, time.Now().Unix(),
			)
		}

		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":                 true,
			"slug":               slug,
			"connected":          true,
			"connectedAccountId": accountID,
		})
	}
}
