package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/composio"
)

func matchToolkit(actionToolkit, accountToolkit string) bool {
	at := strings.ToLower(actionToolkit)
	act := strings.ToLower(accountToolkit)
	if at == act {
		return true
	}
	if isGoogleToolkit(at) && isGoogleToolkit(act) {
		return true
	}
	return false
}

// ComposioTools exposes Composio-managed app integrations (OAuth connections
// to GitHub, Gmail, Slack, ...) as agent tools. The Composio project API key
// lives in system_settings (set from the Connections UI).
func ComposioTools(db *sql.DB) map[string]ToolDef {
	tools := map[string]ToolDef{
		"composio_connections": {
			Name:        "composio_connections",
			Description: "Lists app connections managed by Composio and available connected apps (GitHub, Gmail, Slack, ...). Call this first to see which services the user has authorized.",
			Signature:   `{"connect_slug": "string (optional: initiate OAuth for this app slug, returns a redirect URL the user must open)"}`,
			Category:    "Integration",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured. Ask the user to add their Composio API key in the Connections page."
				}
				ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
				defer cancel()

				// Optional: initiate a new OAuth connection.
				if slug, _ := args["connect_slug"].(string); strings.TrimSpace(slug) != "" {
					slug = strings.TrimSpace(slug)
					acc, err := client.Connect(ctx, slug)
					if err != nil {
						return fmt.Sprintf("Failed to start connection for %s: %v", slug, err)
					}
					return fmt.Sprintf("Authorization required for %s.\nPlease ask the user to open this authorization URL to connect their account:\n%s\n\nStatus: %s (Account ID: %s)\nOnce authorized, retry the requested operation.", slug, acc.RedirectURL, acc.Status, acc.ID)
				}

				accounts, err := client.Accounts(ctx)
				if err != nil {
					return fmt.Sprintf("Failed to list Composio connections: %v", err)
				}
				active := make([]string, 0)
				pending := make([]string, 0)
				for _, acc := range accounts {
					switch acc.Status {
					case "ACTIVE":
						active = append(active, acc.ToolkitSlug)
					case "INITIATED", "INITIALIZING":
						pending = append(pending, acc.ToolkitSlug)
					}
				}
				sort.Strings(active)
				sort.Strings(pending)

				var b strings.Builder
				if len(active) > 0 {
					b.WriteString(fmt.Sprintf("Connected & Active Apps: %s\n", strings.Join(active, ", ")))
				} else {
					b.WriteString("No apps connected yet.\n")
				}
				if len(pending) > 0 {
					b.WriteString(fmt.Sprintf("Pending Authorization: %s\n", strings.Join(pending, ", ")))
				}
				b.WriteString("\nAvailable Integrations (usable via composio_connections with connect_slug): Google Calendar, Gmail, Google Workspace, GitHub, Jira, Notion, Slack, Linear, Asana, Trello, GitLab, Discord, HubSpot, Stripe.")
				return b.String()
			},
		},
		"composio_actions": {
			Name:        "composio_actions",
			Description: "Lists the actions (API operations) and parameter schemas available for a connected app, e.g. toolkit 'github' returns GITHUB_CREATE_ISSUE, GITHUB_LIST_REPOS, ... Use before composio_call to find the right action slug and its parameters.",
			Signature:   `{"toolkit": "string"}`,
			Category:    "Integration",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured. Ask the user to add their Composio API key in the Connections page."
				}
				slug, _ := args["toolkit"].(string)
				slug = strings.ToLower(strings.TrimSpace(slug))
				if slug == "" {
					return "Parameter 'toolkit' is required (e.g. 'github')."
				}
				ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
				defer cancel()
				toolsList, err := client.Tools(ctx, slug)
				if err != nil {
					return fmt.Sprintf("Failed to list actions for %s: %v", slug, err)
				}
				var b strings.Builder
				fmt.Fprintf(&b, "Actions for %s (%d):\n", slug, len(toolsList))
				for _, t := range toolsList {
					paramList := ""
					if props, ok := t.Parameters["properties"].(map[string]interface{}); ok && len(props) > 0 {
						var pNames []string
						for pName := range props {
							pNames = append(pNames, pName)
						}
						sort.Strings(pNames)
						if len(pNames) > 8 {
							pNames = append(pNames[:8], "...")
						}
						paramList = fmt.Sprintf(" (params: %s)", strings.Join(pNames, ", "))
					}
					fmt.Fprintf(&b, "- %s: %s%s\n", t.Slug, t.Description, paramList)
				}
				return b.String()
			},
		},
		"composio_call": {
			Name:        "composio_call",
			Description: "Executes a Composio action on a connected app, e.g. action GITHUB_CREATE_ISSUE with arguments {\"owner\":..., \"repo\":..., \"title\":...}. Use composio_actions first to discover action slugs and parameter names.",
			Signature:   `{"action": "string (tool slug, e.g. GITHUB_CREATE_ISSUE)", "arguments": "object", "account": "string (optional connected account id; defaults to the active account for that app)"}`,
			Category:    "Integration",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				client := composioClientFromDB(db)
				if client == nil {
					return "Composio is not configured. Ask the user to add their Composio API key in the Connections page."
				}
				action, _ := args["action"].(string)
				action = strings.TrimSpace(action)
				if action == "" {
					return "Parameter 'action' is required (e.g. GITHUB_CREATE_ISSUE)."
				}
				callArgs, _ := args["arguments"].(map[string]interface{})

				ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
				defer cancel()

				accountID, _ := args["account"].(string)
				if accountID == "" {
					// Resolve the toolkit from the action slug: tool slugs
					// follow TOOLKIT_ACTION (e.g. GITHUB_CREATE_ISSUE → github).
					toolkit := strings.ToLower(strings.SplitN(action, "_", 2)[0])
					accounts, err := client.Accounts(ctx)
					if err == nil {
						for _, acc := range accounts {
							if matchToolkit(toolkit, acc.ToolkitSlug) && acc.Status == "ACTIVE" {
								accountID = acc.ID
								break
							}
						}
					}
					if accountID == "" && !strings.HasPrefix(client.APIKey(), "ck_") {
						// Auto-initiate OAuth connection so user gets a direct link
						acc, err := client.Connect(ctx, toolkit)
						if err == nil && acc != nil && acc.RedirectURL != "" {
							return fmt.Sprintf("App %q is not authorized yet.\nPlease ask the user to open this authorization URL to connect their account:\n%s\nOnce authorized, you can re-run this action.", toolkit, acc.RedirectURL)
						}
						return fmt.Sprintf("No ACTIVE connection found for app %q. Connect it first (Connections page or composio_connections with connect_slug).", toolkit)
					}
				}

				data, err := client.Execute(ctx, action, accountID, callArgs)
				if err != nil {
					if strings.Contains(err.Error(), "No active connection") || strings.Contains(err.Error(), "establish a connection") {
						toolkit := strings.ToLower(strings.SplitN(action, "_", 2)[0])
						acc, cErr := client.Connect(ctx, toolkit)
						if cErr == nil && acc != nil && acc.RedirectURL != "" {
							return fmt.Sprintf("App %q is not connected yet.\nPlease open this link to authorize your %s account:\n%s\n\nOnce authorized, retry this action.", toolkit, strings.Title(toolkit), acc.RedirectURL)
						}
					}
					return fmt.Sprintf("Composio action %s failed: %v", action, err)
				}
				out, _ := json.MarshalIndent(data, "", "  ")
				if len(out) > 8000 {
					out = append(out[:8000], []byte("\n... (truncated)")...)
				}
				return string(out)
			},
		},
	}
	return tools
}

// composioClientFromDB builds a Composio client from the project API key
// stored in system_settings; nil when not configured.
func composioClientFromDB(db *sql.DB) *composio.Client {
	if db == nil {
		return nil
	}
	var key string
	if err := db.QueryRow("SELECT value FROM system_settings WHERE key = 'composio_api_key'").Scan(&key); err != nil || strings.TrimSpace(key) == "" {
		return nil
	}
	return composio.NewClient(strings.TrimSpace(key))
}
