// Package composio is a thin client for the Composio REST API (v3.1).
// Composio (https://composio.dev) manages OAuth connections to 500+ SaaS
// apps (GitHub, Gmail, Slack, Notion, ...) and exposes each app's actions
// as executable tools. Credentials stay with Composio; we only ever hold
// connected-account ids.
package composio

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const (
	defaultBaseURL = "https://backend.composio.dev/api/v3.1"
	defaultTimeout = 30 * time.Second
)

// Client talks to the Composio REST API with a project API key.
type Client struct {
	apiKey string
	base   string
	http   *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		base:   defaultBaseURL,
		http:   &http.Client{Timeout: defaultTimeout},
	}
}

// APIKey returns the configured Composio API key.
func (c *Client) APIKey() string {
	if c == nil {
		return ""
	}
	return c.apiKey
}

func (c *Client) do(ctx context.Context, method, path string, body, out interface{}) error {
	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("composio: encode request: %w", err)
		}
		reader = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, reader)
	if err != nil {
		return fmt.Errorf("composio: build request: %w", err)
	}
	req.Header.Set("x-api-key", c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("composio: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return fmt.Errorf("composio: read response: %w", err)
	}
	if resp.StatusCode >= 400 {
		msg := strings.TrimSpace(string(data))
		// Error bodies are {"error": {"message": ...}} or plain strings.
		var errObj struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(data, &errObj) == nil && errObj.Error.Message != "" {
			msg = errObj.Error.Message
		}
		if resp.StatusCode == 401 && strings.HasPrefix(c.apiKey, "ck_") {
			return fmt.Errorf("composio: '%s...' is a Composio Connect (MCP) Consumer Key. The REST API requires a Project API Key (starts with ak_... from https://app.composio.dev/settings/api-keys). For ck_ keys, Kendali-AI routes tools via Composio MCP (https://connect.composio.dev/mcp). Original response: %s", c.apiKey[:min(len(c.apiKey), 8)], msg)
		}
		return fmt.Errorf("composio: %s %s failed (%d): %s", method, path, resp.StatusCode, msg)
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("composio: decode response: %w", err)
	}
	return nil
}

// Toolkit is one integrable app from the Composio catalog.
type Toolkit struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Logo        string `json:"logo"`
	Category    string `json:"category"`
}

// ConnectedAccount is one user authorization for a toolkit.
type ConnectedAccount struct {
	ID          string `json:"id"`
	ToolkitSlug string `json:"toolkitSlug"`
	Status      string `json:"status"` // INITIALIZING | INITIATED | ACTIVE | FAILED
	RedirectURL string `json:"redirectUrl,omitempty"`
}

// PopularToolkits is the curated starter grid shown in Connections before a
// live catalog is available. Slugs match Composio toolkit slugs.
var PopularToolkits = []Toolkit{
	// Google Workspace Suite
	{Slug: "googlesuper", Name: "Google Workspace", Description: "Connect Google Docs, Sheets, Drive, Gmail, and Calendar with unified OAuth.", Category: "workspace"},
	{Slug: "googledocs", Name: "Google Docs", Description: "Create, format, and collaborate on online documents directly in Google Drive.", Category: "workspace"},
	{Slug: "googlesheets", Name: "Google Sheets", Description: "Read, write rows, calculate formulas, and manipulate online spreadsheets.", Category: "workspace"},
	{Slug: "googledrive", Name: "Google Drive", Description: "Search, organize, upload, download, and manage cloud files and folders.", Category: "workspace"},
	{Slug: "gmail", Name: "Gmail", Description: "Search email threads, inspect inbox messages, draft responses, and send emails.", Category: "workspace"},
	{Slug: "googlecalendar", Name: "Google Calendar", Description: "Inspect schedule availability, book meetings, and manage calendar events.", Category: "workspace"},

	// Product & Issue Tracking
	{Slug: "jira", Name: "Jira", Description: "Manage epics, track agile sprint backlogs, create tickets, and log bug status.", Category: "development"},
	{Slug: "github", Name: "GitHub", Description: "Create issues, review pull requests, inspect code diffs, and manage releases.", Category: "development"},
	{Slug: "gitlab", Name: "GitLab", Description: "Manage merge requests, track repository issues, and automate CI/CD pipelines.", Category: "development"},
	{Slug: "linear", Name: "Linear", Description: "High-velocity issue tracking, project roadmaps, cycles, and pull request sync.", Category: "development"},
	{Slug: "asana", Name: "Asana", Description: "Track team tasks, manage timelines, set milestone goals, and balance workloads.", Category: "productivity"},
	{Slug: "trello", Name: "Trello", Description: "Manage Kanban boards, organize cards, automate checklists, and track sprint items.", Category: "productivity"},

	// Knowledge & Docs
	{Slug: "notion", Name: "Notion", Description: "Search team wikis, update database rows, query tables, and create nested docs.", Category: "productivity"},
	{Slug: "confluence", Name: "Confluence", Description: "Browse knowledge bases, update technical documentation, and collaborate on specs.", Category: "productivity"},
	{Slug: "airtable", Name: "Airtable", Description: "Create dynamic relational bases, update structured records, and link tables.", Category: "productivity"},
	{Slug: "coda", Name: "Coda", Description: "Manage interactive team docs with programmable formulas, buttons, and tables.", Category: "productivity"},

	// Collaboration & Communication
	{Slug: "slack", Name: "Slack", Description: "Post updates to channels, read message threads, notify team members, and upload files.", Category: "communication"},
	{Slug: "discord", Name: "Discord", Description: "Send webhook notifications, moderate channels, and interact across community servers.", Category: "communication"},
	{Slug: "msteams", Name: "Microsoft Teams", Description: "Broadcast messages to team channels, manage team chats, and trigger bot alerts.", Category: "communication"},
	{Slug: "telegram", Name: "Telegram", Description: "Send real-time alerts, manage bot chats, broadcast updates, and dispatch files.", Category: "communication"},

	// Design & Developers
	{Slug: "figma", Name: "Figma", Description: "Inspect UI frames, extract design tokens, read component styles, and export assets.", Category: "design"},
	{Slug: "supabase", Name: "Supabase", Description: "Query Postgres database tables, manage storage buckets, and monitor database events.", Category: "development"},
	{Slug: "postman", Name: "Postman", Description: "Execute API collection test runs, inspect environment variables, and monitor mocks.", Category: "development"},

	// CRM & Finance
	{Slug: "hubspot", Name: "HubSpot", Description: "Manage CRM contacts, track sales deals, update company records, and monitor leads.", Category: "crm"},
	{Slug: "salesforce", Name: "Salesforce", Description: "Manage enterprise CRM leads, track sales pipelines, and update custom objects.", Category: "crm"},
	{Slug: "zendesk", Name: "Zendesk", Description: "Search support tickets, create user replies, assign agents, and monitor SLAs.", Category: "crm"},
	{Slug: "stripe", Name: "Stripe", Description: "Check customer balances, create invoices, monitor transactions, and inspect payouts.", Category: "crm"},

	// Social & Professional
	{Slug: "linkedin", Name: "LinkedIn", Description: "Share company announcements, publish updates, and engage professional networks.", Category: "social"},
	{Slug: "twitter", Name: "X (Twitter)", Description: "Post updates, read timelines, monitor search queries, and engage with followers.", Category: "social"},
}

// Toolkits lists available apps from the live catalog. Falls back to the
// curated PopularToolkits list when the API call fails so the UI keeps
// working offline.
func (c *Client) Toolkits(ctx context.Context) ([]Toolkit, error) {
	if strings.HasPrefix(c.apiKey, "ck_") {
		return PopularToolkits, nil
	}
	var out struct {
		Items []Toolkit `json:"items"`
	}
	if err := c.do(ctx, http.MethodGet, "/toolkits?limit=100", nil, &out); err != nil {
		return PopularToolkits, nil
	}
	if len(out.Items) == 0 {
		return PopularToolkits, nil
	}
	return out.Items, nil
}

// authConfig is Composio's per-project credential profile for a toolkit.
type authConfig struct {
	ID          string `json:"id"`
	ToolkitSlug string `json:"toolkit"`
	AuthScheme  string `json:"auth_scheme"`
	Status      string `json:"status"`
}

// ensureAuthConfig finds or creates the project auth config for a toolkit.
// Composio-managed OAuth apps (`use_composio_auth`) need zero user setup.
func (c *Client) ensureAuthConfig(ctx context.Context, slug string) (*authConfig, error) {
	var list struct {
		Items []authConfig `json:"items"`
	}
	if err := c.do(ctx, http.MethodGet, "/auth_configs?toolkit="+slug, nil, &list); err == nil {
		for i := range list.Items {
			if list.Items[i].ToolkitSlug == slug {
				return &list.Items[i], nil
			}
		}
	}
	created := &authConfig{}
	body := map[string]interface{}{
		"toolkit":          map[string]string{"slug": slug},
		"use_composio_auth": true,
	}
	if err := c.do(ctx, http.MethodPost, "/auth_configs", body, created); err != nil {
		return nil, err
	}
	return created, nil
}

// callMCPTool executes a tool on Composio Connect MCP (https://connect.composio.dev/mcp)
func (c *Client) callMCPTool(ctx context.Context, toolName string, args map[string]interface{}) (map[string]interface{}, error) {
	reqBody := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      fmt.Sprintf("mcp_%d", time.Now().UnixMilli()),
		"method":  "tools/call",
		"params": map[string]interface{}{
			"name":      toolName,
			"arguments": args,
		},
	}
	buf, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("encode MCP request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://connect.composio.dev/mcp", bytes.NewReader(buf))
	if err != nil {
		return nil, fmt.Errorf("build MCP request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("x-consumer-api-key", c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do MCP request: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("read MCP response: %w", err)
	}

	// Parse SSE format: look for "data: " line containing jsonrpc response
	lines := strings.Split(string(data), "\n")
	var jsonLine string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if strings.HasPrefix(l, "data:") {
			candidate := strings.TrimSpace(strings.TrimPrefix(l, "data:"))
			if strings.Contains(candidate, "jsonrpc") {
				jsonLine = candidate
				break
			}
		}
	}
	if jsonLine == "" {
		jsonLine = string(data)
	}

	var mcpRes struct {
		Result struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
			IsError bool `json:"isError"`
		} `json:"result"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal([]byte(jsonLine), &mcpRes); err != nil {
		return nil, fmt.Errorf("parse MCP response: %w (%s)", err, jsonLine)
	}
	if mcpRes.Error != nil {
		return nil, fmt.Errorf("MCP error: %s", mcpRes.Error.Message)
	}
	if len(mcpRes.Result.Content) == 0 {
		return nil, fmt.Errorf("empty MCP result content")
	}

	var innerData map[string]interface{}
	if err := json.Unmarshal([]byte(mcpRes.Result.Content[0].Text), &innerData); err != nil {
		return nil, fmt.Errorf("parse inner tool data: %w", err)
	}
	return innerData, nil
}

// Connect initiates an OAuth connection for a toolkit and returns the
// connected account with its redirect URL. The caller opens redirectUrl in
// a browser and polls Account(id) until status becomes ACTIVE.
func (c *Client) Connect(ctx context.Context, slug string) (*ConnectedAccount, error) {
	if slug == "googleworkspace" || slug == "google" {
		slug = "googlesuper"
	}
	if strings.HasPrefix(c.apiKey, "ck_") {
		inner, err := c.callMCPTool(ctx, "COMPOSIO_MANAGE_CONNECTIONS", map[string]interface{}{
			"toolkits": []map[string]string{
				{"name": slug, "action": "add"},
			},
		})
		if err != nil {
			return nil, fmt.Errorf("mcp connect for %s: %w", slug, err)
		}

		dataMap, _ := inner["data"].(map[string]interface{})
		resultsMap, _ := dataMap["results"].(map[string]interface{})
		slugResult, _ := resultsMap[slug].(map[string]interface{})
		if slugResult == nil {
			return nil, fmt.Errorf("no connection result returned for %s", slug)
		}

		redirectURL, _ := slugResult["redirect_url"].(string)
		status, _ := slugResult["status"].(string)
		if status == "" {
			status = "initiated"
		}

		accountID := slug + "_mcp"
		if accs, ok := slugResult["accounts"].([]interface{}); ok && len(accs) > 0 {
			if firstAcc, ok := accs[0].(map[string]interface{}); ok {
				if id, ok := firstAcc["id"].(string); ok && id != "" {
					accountID = id
				}
				if st, ok := firstAcc["status"].(string); ok && st != "" {
					status = st
				}
			}
		}

		return &ConnectedAccount{
			ID:          accountID,
			ToolkitSlug: slug,
			Status:      strings.ToUpper(status),
			RedirectURL: redirectURL,
		}, nil
	}

	cfg, err := c.ensureAuthConfig(ctx, slug)
	if err != nil {
		return nil, fmt.Errorf("auth config for %s: %w", slug, err)
	}

	var created struct {
		ID          string `json:"id"`
		Status      string `json:"status"`
		RedirectURL string `json:"redirect_url"`
	}
	body := map[string]interface{}{
		"auth_config": map[string]string{"id": cfg.ID},
		"connection":  map[string]interface{}{"user_id": "default"},
	}
	if err := c.do(ctx, http.MethodPost, "/connected_accounts", body, &created); err != nil {
		return nil, err
	}
	return &ConnectedAccount{
		ID:          created.ID,
		ToolkitSlug: slug,
		Status:      created.Status,
		RedirectURL: created.RedirectURL,
	}, nil
}

// Account fetches one connected account by id, normalizing the nested
// response shape Composio returns.
func (c *Client) Account(ctx context.Context, id string) (*ConnectedAccount, error) {
	if strings.HasPrefix(c.apiKey, "ck_") {
		slug := strings.SplitN(id, "_", 2)[0]
		inner, err := c.callMCPTool(ctx, "COMPOSIO_MANAGE_CONNECTIONS", map[string]interface{}{
			"toolkits": []map[string]string{
				{"name": slug, "action": "list"},
			},
		})
		if err != nil {
			return nil, err
		}
		dataMap, _ := inner["data"].(map[string]interface{})
		resultsMap, _ := dataMap["results"].(map[string]interface{})
		slugResult, _ := resultsMap[slug].(map[string]interface{})
		status := "INITIATED"
		if slugResult != nil {
			if accs, ok := slugResult["accounts"].([]interface{}); ok {
				for _, a := range accs {
					if accMap, ok := a.(map[string]interface{}); ok {
						if accMap["id"] == id || len(accs) == 1 {
							if st, ok := accMap["status"].(string); ok {
								status = strings.ToUpper(st)
							}
							break
						}
					}
				}
			}
		}
		return &ConnectedAccount{ID: id, ToolkitSlug: slug, Status: status}, nil
	}

	var raw struct {
		ID  string `json:"id"`
		Status string `json:"status"`
		ConnectionData struct {
			State struct {
				Val struct {
					Status string `json:"status"`
				} `json:"val"`
			} `json:"state"`
		} `json:"connectionData"`
		Toolkit struct {
			Slug string `json:"slug"`
		} `json:"toolkit"`
	}
	if err := c.do(ctx, http.MethodGet, "/connected_accounts/"+id, nil, &raw); err != nil {
		return nil, err
	}
	status := raw.Status
	if status == "" {
		status = raw.ConnectionData.State.Val.Status
	}
	slug := raw.Toolkit.Slug
	return &ConnectedAccount{ID: raw.ID, ToolkitSlug: slug, Status: status}, nil
}

// Accounts lists all connected accounts for the project.
func (c *Client) Accounts(ctx context.Context) ([]ConnectedAccount, error) {
	if strings.HasPrefix(c.apiKey, "ck_") {
		toolkitQueries := make([]map[string]string, 0, len(PopularToolkits))
		for _, tk := range PopularToolkits {
			toolkitQueries = append(toolkitQueries, map[string]string{
				"name": tk.Slug, "action": "list",
			})
		}
		inner, err := c.callMCPTool(ctx, "COMPOSIO_MANAGE_CONNECTIONS", map[string]interface{}{
			"toolkits": toolkitQueries,
		})
		if err != nil {
			return nil, err
		}
		dataMap, _ := inner["data"].(map[string]interface{})
		resultsMap, _ := dataMap["results"].(map[string]interface{})
		out := make([]ConnectedAccount, 0)
		for slug, val := range resultsMap {
			if resMap, ok := val.(map[string]interface{}); ok {
				if accs, ok := resMap["accounts"].([]interface{}); ok {
					for _, a := range accs {
						if accMap, ok := a.(map[string]interface{}); ok {
							accID, _ := accMap["id"].(string)
							st, _ := accMap["status"].(string)
							out = append(out, ConnectedAccount{
								ID:          accID,
								ToolkitSlug: slug,
								Status:      strings.ToUpper(st),
							})
						}
					}
				}
			}
		}
		return out, nil
	}

	var listResp json.RawMessage
	if err := c.do(ctx, http.MethodGet, "/connected_accounts", nil, &listResp); err != nil {
		return nil, err
	}
	// v3.1 returns {"items": [...]} in some shapes and a bare array in others.
	var items []struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		ConnectionData struct {
			State struct {
				Val struct {
					Status string `json:"status"`
				} `json:"val"`
			} `json:"state"`
		} `json:"connectionData"`
		Toolkit struct {
			Slug string `json:"slug"`
		} `json:"toolkit"`
	}
	if err := json.Unmarshal(listResp, &items); err != nil {
		var wrapped struct {
			Items []json.RawMessage `json:"items"`
		}
		if err2 := json.Unmarshal(listResp, &wrapped); err2 != nil {
			return nil, fmt.Errorf("composio: decode connected accounts: %w", err)
		}
		items = nil
		for _, raw := range wrapped.Items {
			var it struct {
				ID     string `json:"id"`
				Status string `json:"status"`
				ConnectionData struct {
					State struct {
						Val struct {
							Status string `json:"status"`
						} `json:"val"`
					} `json:"state"`
				} `json:"connectionData"`
				Toolkit struct {
					Slug string `json:"slug"`
				} `json:"toolkit"`
			}
			if json.Unmarshal(raw, &it) == nil {
				items = append(items, it)
			}
		}
	}
	out := make([]ConnectedAccount, 0, len(items))
	for _, it := range items {
		status := it.Status
		if status == "" {
			status = it.ConnectionData.State.Val.Status
		}
		out = append(out, ConnectedAccount{ID: it.ID, ToolkitSlug: it.Toolkit.Slug, Status: status})
	}
	return out, nil
}

// Disconnect deletes a connected account.
func (c *Client) Disconnect(ctx context.Context, accountID string) error {
	if strings.HasPrefix(c.apiKey, "ck_") {
		slug := strings.SplitN(accountID, "_", 2)[0]
		_, err := c.callMCPTool(ctx, "COMPOSIO_MANAGE_CONNECTIONS", map[string]interface{}{
			"toolkits": []map[string]string{
				{"name": slug, "action": "remove", "account_id": accountID},
			},
		})
		return err
	}
	return c.do(ctx, http.MethodDelete, "/connected_accounts/"+accountID, nil, nil)
}

// Tool describes one executable Composio action.
type Tool struct {
	Slug        string `json:"slug"`        // e.g. GITHUB_CREATE_ISSUE
	Name        string `json:"name"`        // human title
	Description string `json:"description"`
	Toolkit     string `json:"toolkit"`
	Parameters  map[string]interface{} `json:"parameters,omitempty"`
}

// Tools lists executable actions for a toolkit.
func (c *Client) Tools(ctx context.Context, toolkitSlug string) ([]Tool, error) {
	normSlug := strings.ToLower(strings.TrimSpace(toolkitSlug))
	if strings.HasPrefix(c.apiKey, "ck_") {
		// Attempt dynamic search via Composio MCP
		inner, err := c.callMCPTool(ctx, "COMPOSIO_SEARCH_TOOLS", map[string]interface{}{
			"queries": []map[string]string{
				{"use_case": fmt.Sprintf("actions and operations for %s", normSlug)},
			},
		})
		if err == nil {
			tools := parseMCPToolsResponse(inner, normSlug)
			if len(tools) > 0 {
				return tools, nil
			}
		}
		// Fallback to rich curated catalog if MCP search failed or returned empty
		if fb := fallbackToolsForToolkit(normSlug); len(fb) > 0 {
			return fb, nil
		}
	}

	var out struct {
		Items []struct {
			Slug        string                 `json:"slug"`
			Name        string                 `json:"name"`
			Description string                 `json:"description"`
			Toolkit     string                 `json:"toolkit"`
			Parameters  map[string]interface{} `json:"parameters"`
		} `json:"items"`
	}
	if err := c.do(ctx, http.MethodGet, "/tools?toolkits="+normSlug+"&limit=50", nil, &out); err != nil {
		if fb := fallbackToolsForToolkit(normSlug); len(fb) > 0 {
			return fb, nil
		}
		return nil, err
	}
	res := make([]Tool, 0, len(out.Items))
	for _, it := range out.Items {
		res = append(res, Tool{
			Slug:        it.Slug,
			Name:        it.Name,
			Description: it.Description,
			Toolkit:     it.Toolkit,
			Parameters:  it.Parameters,
		})
	}
	return res, nil
}

// Execute runs one Composio action on a connected account.
func (c *Client) Execute(ctx context.Context, toolSlug, accountID string, args map[string]interface{}) (map[string]interface{}, error) {
	if strings.HasPrefix(c.apiKey, "ck_") {
		toolItem := map[string]interface{}{
			"tool_slug": toolSlug,
			"arguments": args,
		}
		if accountID != "" {
			toolItem["account_id"] = accountID
		}
		inner, err := c.callMCPTool(ctx, "COMPOSIO_MULTI_EXECUTE_TOOL", map[string]interface{}{
			"tools": []map[string]interface{}{toolItem},
		})
		if err != nil {
			return nil, fmt.Errorf("composio mcp %s: %w", toolSlug, err)
		}

		dataMap, _ := inner["data"].(map[string]interface{})
		if dataMap == nil {
			dataMap = inner
		}

		results, _ := dataMap["results"].([]interface{})
		if len(results) == 0 {
			return nil, fmt.Errorf("composio: no execution results returned for %s", toolSlug)
		}

		firstRes, _ := results[0].(map[string]interface{})
		if firstRes == nil {
			return nil, fmt.Errorf("composio: invalid execution response for %s", toolSlug)
		}

		respMap, _ := firstRes["response"].(map[string]interface{})
		if respMap == nil {
			respMap = firstRes
		}

		// Auto-retry with Composio's suggestion if tool slug had a typo/variation
		var suggestions []interface{}
		if s, ok := respMap["suggestions"].([]interface{}); ok && len(s) > 0 {
			suggestions = s
		} else if resData, ok := respMap["data"].(map[string]interface{}); ok {
			if s, ok := resData["suggestions"].([]interface{}); ok && len(s) > 0 {
				suggestions = s
			}
		}
		if len(suggestions) > 0 {
			if firstSugg, ok := suggestions[0].(string); ok && firstSugg != "" && firstSugg != toolSlug {
				log.Printf("Composio: tool %s suggested %s, auto-retrying...", toolSlug, firstSugg)
				return c.Execute(ctx, firstSugg, accountID, args)
			}
		}

		if succ, ok := respMap["successful"].(bool); ok && !succ {
			return nil, fmt.Errorf("composio: action %s failed: %v", toolSlug, respMap["error"])
		}

		var errVal interface{}
		if e, ok := respMap["error"]; ok && e != nil {
			errVal = e
		} else if resData, ok := respMap["data"].(map[string]interface{}); ok {
			if e, ok := resData["error"]; ok && e != nil {
				errVal = e
			}
		}
		if errVal != nil {
			errStr := strings.TrimSpace(fmt.Sprintf("%v", errVal))
			if errStr != "" && errStr != "<nil>" {
				return nil, fmt.Errorf("composio action %s: %s", toolSlug, errStr)
			}
		}

		if resData, ok := respMap["data"].(map[string]interface{}); ok {
			return resData, nil
		}
		return respMap, nil
	}

	body := map[string]interface{}{
		"connected_account_id": accountID,
		"arguments":            args,
	}
	var out struct {
		Successful bool                   `json:"successful"`
		Data       map[string]interface{} `json:"data"`
		Error      interface{}            `json:"error"`
		LogID      string                 `json:"log_id"`
	}
	if err := c.do(ctx, http.MethodPost, "/tools/execute/"+toolSlug, body, &out); err != nil {
		return nil, err
	}
	if !out.Successful {
		return out.Data, fmt.Errorf("composio: tool %s failed: %v", toolSlug, out.Error)
	}
	return out.Data, nil
}

func parseMCPToolsResponse(raw map[string]interface{}, targetToolkit string) []Tool {
	var tools []Tool
	dataMap, _ := raw["data"].(map[string]interface{})
	if dataMap == nil {
		dataMap = raw
	}

	toolDict := dataMap
	if ts, ok := dataMap["tool_schemas"].(map[string]interface{}); ok {
		toolDict = ts
	}

	for k, v := range toolDict {
		if vm, ok := v.(map[string]interface{}); ok {
			slug, _ := vm["tool_slug"].(string)
			if slug == "" && strings.Contains(k, "_") {
				slug = k
			}
			if slug == "" || slug == "tool_schemas" {
				continue
			}
			desc, _ := vm["description"].(string)
			tk, _ := vm["toolkit"].(string)
			if tk == "" {
				tk = targetToolkit
			}
			params, _ := vm["input_schema"].(map[string]interface{})
			if params == nil {
				params, _ = vm["parameters"].(map[string]interface{})
			}
			tools = append(tools, Tool{
				Slug:        slug,
				Name:        slug,
				Description: desc,
				Toolkit:     tk,
				Parameters:  params,
			})
		}
	}
	return tools
}

func fallbackToolsForToolkit(slug string) []Tool {
	slug = strings.ToLower(slug)
	switch slug {
	case "googlecalendar", "calendar":
		return []Tool{
			{Slug: "GOOGLECALENDAR_EVENTS_LIST", Name: "List Events", Description: "List upcoming events from Google Calendar", Toolkit: "googlecalendar"},
			{Slug: "GOOGLECALENDAR_CREATE_EVENT", Name: "Create Event", Description: "Create a new event in Google Calendar", Toolkit: "googlecalendar"},
			{Slug: "GOOGLECALENDAR_FIND_EVENT", Name: "Find Event", Description: "Search for specific events in Google Calendar", Toolkit: "googlecalendar"},
			{Slug: "GOOGLECALENDAR_PATCH_EVENT", Name: "Update Event", Description: "Update or modify an existing Google Calendar event", Toolkit: "googlecalendar"},
			{Slug: "GOOGLECALENDAR_LIST_CALENDARS", Name: "List Calendars", Description: "Enumerate all available calendars", Toolkit: "googlecalendar"},
		}
	case "gmail":
		return []Tool{
			{Slug: "GMAIL_LIST_MESSAGES", Name: "List Messages", Description: "List email messages and threads in inbox", Toolkit: "gmail"},
			{Slug: "GMAIL_SEND_MESSAGE", Name: "Send Message", Description: "Send a new email message via Gmail", Toolkit: "gmail"},
			{Slug: "GMAIL_GET_MESSAGE", Name: "Get Message", Description: "Fetch details and content of a specific email", Toolkit: "gmail"},
			{Slug: "GMAIL_CREATE_DRAFT", Name: "Create Draft", Description: "Create an email draft in Gmail", Toolkit: "gmail"},
		}
	case "googledocs":
		return []Tool{
			{Slug: "GOOGLEDOCS_CREATE_DOCUMENT", Name: "Create Document", Description: "Create a new Google Docs document", Toolkit: "googledocs"},
			{Slug: "GOOGLEDOCS_GET_DOCUMENT", Name: "Get Document", Description: "Read content of a Google Doc", Toolkit: "googledocs"},
			{Slug: "GOOGLEDOCS_UPDATE_DOCUMENT", Name: "Update Document", Description: "Insert or update text in a Google Doc", Toolkit: "googledocs"},
		}
	case "googlesheets":
		return []Tool{
			{Slug: "GOOGLESHEETS_CREATE_SPREADSHEET", Name: "Create Spreadsheet", Description: "Create a new Google Sheets spreadsheet", Toolkit: "googlesheets"},
			{Slug: "GOOGLESHEETS_ADD_ROWS", Name: "Add Rows", Description: "Append rows of data to a spreadsheet", Toolkit: "googlesheets"},
			{Slug: "GOOGLESHEETS_GET_SPREADSHEET", Name: "Get Spreadsheet", Description: "Read spreadsheet data", Toolkit: "googlesheets"},
		}
	case "gslides":
		return []Tool{
			{Slug: "GSLIDES_CREATE_PRESENTATION", Name: "Create Presentation", Description: "Create a new Google Slides presentation", Toolkit: "gslides"},
			{Slug: "GSLIDES_CREATE_SLIDE", Name: "Create Slide", Description: "Add a slide to a Google Slides presentation", Toolkit: "gslides"},
		}
	case "github":
		return []Tool{
			{Slug: "GITHUB_CREATE_ISSUE", Name: "Create Issue", Description: "Create a new issue in a GitHub repository", Toolkit: "github"},
			{Slug: "GITHUB_LIST_REPOS", Name: "List Repos", Description: "List repositories for the authenticated user", Toolkit: "github"},
			{Slug: "GITHUB_GET_REPOSITORY", Name: "Get Repository", Description: "Get details of a GitHub repository", Toolkit: "github"},
			{Slug: "GITHUB_CREATE_PULL_REQUEST", Name: "Create PR", Description: "Create a pull request in a GitHub repository", Toolkit: "github"},
			{Slug: "GITHUB_LIST_ISSUES", Name: "List Issues", Description: "List issues in a repository", Toolkit: "github"},
		}
	case "jira":
		return []Tool{
			{Slug: "JIRA_CREATE_ISSUE", Name: "Create Issue", Description: "Create an issue or ticket in Jira", Toolkit: "jira"},
			{Slug: "JIRA_SEARCH_ISSUES_JQL", Name: "Search Issues", Description: "Search Jira issues using JQL queries", Toolkit: "jira"},
			{Slug: "JIRA_GET_ISSUE", Name: "Get Issue", Description: "Get details of a Jira issue", Toolkit: "jira"},
		}
	case "notion":
		return []Tool{
			{Slug: "NOTION_SEARCH", Name: "Search", Description: "Search pages and databases in Notion", Toolkit: "notion"},
			{Slug: "NOTION_CREATE_PAGE", Name: "Create Page", Description: "Create a new page in Notion", Toolkit: "notion"},
			{Slug: "NOTION_QUERY_DATABASE", Name: "Query Database", Description: "Query rows in a Notion database", Toolkit: "notion"},
		}
	case "slack":
		return []Tool{
			{Slug: "SLACK_CHAT_POST_MESSAGE", Name: "Post Message", Description: "Post a message to a Slack channel", Toolkit: "slack"},
			{Slug: "SLACK_CONVERSATIONS_LIST", Name: "List Channels", Description: "List channels in the Slack workspace", Toolkit: "slack"},
		}
	default:
		return nil
	}
}
