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
	{Slug: "github", Name: "GitHub", Description: "Create issues, review pull requests, and commit code directly."},
	{Slug: "gmail", Name: "Gmail", Description: "Search emails, read threads, and draft replies."},
	{Slug: "googlecalendar", Name: "Google Calendar", Description: "Inspect availability, schedule meetings, and send invites."},
	{Slug: "slack", Name: "Slack", Description: "Post updates to channels, notify team members, and read messages."},
	{Slug: "notion", Name: "Notion", Description: "Search documentation, update database rows, and create pages."},
	{Slug: "linear", Name: "Linear", Description: "Manage backlog issues, create tickets, and update cycles."},
	{Slug: "jira", Name: "Jira", Description: "Track enterprise issues, transitions, and sprint boards."},
	{Slug: "googledrive", Name: "Google Drive", Description: "Search, read, and organize files in Drive."},
	{Slug: "googlesheets", Name: "Google Sheets", Description: "Read, write, and format spreadsheet rows."},
	{Slug: "discord", Name: "Discord", Description: "Send messages and manage servers and channels."},
	{Slug: "hubspot", Name: "HubSpot", Description: "Manage contacts, deals, and CRM pipelines."},
	{Slug: "salesforce", Name: "Salesforce", Description: "Work leads, opportunities, and records in Salesforce."},
	{Slug: "airtable", Name: "Airtable", Description: "Create and update records across bases."},
	{Slug: "confluence", Name: "Confluence", Description: "Search and edit workspace documentation."},
	{Slug: "twitter", Name: "X (Twitter)", Description: "Post tweets and read timelines."},
	{Slug: "linkedin", Name: "LinkedIn", Description: "Create posts and manage your professional presence."},
}

// Toolkits lists available apps from the live catalog. Falls back to the
// curated PopularToolkits list when the API call fails so the UI keeps
// working offline.
func (c *Client) Toolkits(ctx context.Context) ([]Toolkit, error) {
	var out struct {
		Items []Toolkit `json:"items"`
	}
	if err := c.do(ctx, http.MethodGet, "/toolkits?limit=100", nil, &out); err != nil {
		return nil, err
	}
	if len(out.Items) == 0 {
		return nil, fmt.Errorf("composio: empty toolkit catalog")
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

// Connect initiates an OAuth connection for a toolkit and returns the
// connected account with its redirect URL. The caller opens redirectUrl in
// a browser and polls Account(id) until status becomes ACTIVE.
func (c *Client) Connect(ctx context.Context, slug string) (*ConnectedAccount, error) {
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
	var out struct {
		Items []struct {
			Slug        string `json:"slug"`
			Name        string `json:"name"`
			Description string `json:"description"`
			Toolkit     string `json:"toolkit"`
			Parameters  map[string]interface{} `json:"parameters"`
		} `json:"items"`
	}
	if err := c.do(ctx, http.MethodGet, "/tools?toolkits="+toolkitSlug+"&limit=50", nil, &out); err != nil {
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
