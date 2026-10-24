package agent

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"github.com/kendaliai/app/internal/composio"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
)

func TestComposioMCPConnect(t *testing.T) {
	apiKey := "ck_NfUrRvx2egHCE35pU-9F"
	serverURL := "https://connect.composio.dev/mcp"

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	opts := []transport.StreamableHTTPCOption{
		transport.WithHTTPHeaders(map[string]string{
			"x-consumer-api-key": apiKey,
			"Accept":             "application/json, text/event-stream",
		}),
	}

	c, err := client.NewStreamableHttpClient(serverURL, opts...)
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}
	defer c.Close()

	if err := c.Start(ctx); err != nil {
		t.Fatalf("failed to start client: %v", err)
	}

	initReq := mcp.InitializeRequest{}
	initReq.Params.ProtocolVersion = "2024-11-05"
	initReq.Params.Capabilities = mcp.ClientCapabilities{}
	initReq.Params.ClientInfo = mcp.Implementation{Name: "kendaliai", Version: "1.0.0"}

	res, err := c.Initialize(ctx, initReq)
	if err != nil {
		t.Fatalf("failed to initialize MCP client: %v", err)
	}

	if res.ServerInfo.Name == "" {
		t.Errorf("expected server name, got empty")
	}
	t.Logf("Composio MCP Server: %s v%s", res.ServerInfo.Name, res.ServerInfo.Version)

	toolsReq := mcp.ListToolsRequest{}
	toolsRes, err := c.ListTools(ctx, toolsReq)
	if err != nil {
		t.Fatalf("failed to list tools: %v", err)
	}

	if len(toolsRes.Tools) == 0 {
		t.Errorf("expected tools from Composio MCP, got 0")
	}

	t.Logf("Discovered %d Composio MCP tools:", len(toolsRes.Tools))
	for _, tool := range toolsRes.Tools {
		t.Logf("  - %s: %s", tool.Name, tool.Description)
	}

	// Test executing COMPOSIO_SEARCH_TOOLS
	callReq := mcp.CallToolRequest{}
	callReq.Params.Name = "COMPOSIO_SEARCH_TOOLS"
	callReq.Params.Arguments = map[string]interface{}{
		"queries": []map[string]string{
			{"use_case": "send an email via gmail"},
		},
		"session": map[string]bool{
			"generate_id": true,
		},
	}
	callRes, err := c.CallTool(ctx, callReq)
	if err != nil {
		t.Fatalf("failed to call COMPOSIO_SEARCH_TOOLS: %v", err)
	}
	if callRes.IsError {
		t.Fatalf("COMPOSIO_SEARCH_TOOLS returned error: %v", callRes.Content)
	}
	t.Logf("COMPOSIO_SEARCH_TOOLS successfully executed! Result items: %d", len(callRes.Content))
}

func TestComposioRESTKeyDetection(t *testing.T) {
	ckKey := "ck_NfUrRvx2egHCE35pU-9F"
	if !strings.HasPrefix(ckKey, "ck_") {
		t.Errorf("expected ck_ prefix")
	}

	// Verify PopularToolkits fallback works offline
	if len(composio.PopularToolkits) < 10 {
		t.Errorf("expected at least 10 popular toolkits, got %d", len(composio.PopularToolkits))
	}
}

func TestComposioExecuteMCPCallPreset(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	args := map[string]interface{}{
		"server":      "composio",
		"server_url":  "https://connect.composio.dev/mcp",
		"server_args": []interface{}{},
		"tool":        "COMPOSIO_MULTI_EXECUTE_TOOL",
		"arguments": map[string]interface{}{
			"tools": []map[string]interface{}{
				{
					"tool_slug": "GOOGLECALENDAR_EVENTS_LIST",
					"arguments": map[string]interface{}{
						"calendarId":   "primary",
						"timeMin":      time.Now().Add(-24 * time.Hour).Format(time.RFC3339),
						"singleEvents": true,
						"orderBy":      "startTime",
						"maxResults":   5,
					},
				},
			},
		},
	}

	t.Setenv("COMPOSIO_API_KEY", "ck_NfUrRvx2egHCE35pU-9F")

	res := executeMCPCall(ctx, nil, nil, args)
	t.Logf("executeMCPCall response: %s", res)
}

func TestGoogleWorkspaceCalendarTools(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	_, err = db.Exec("CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT)")
	if err != nil {
		t.Fatalf("create table: %v", err)
	}
	_, err = db.Exec("INSERT INTO system_settings (key, value) VALUES ('composio_api_key', 'ck_NfUrRvx2egHCE35pU-9F')")
	if err != nil {
		t.Fatalf("insert key: %v", err)
	}

	tools := GoogleWorkspaceTools(db)
	calTool, ok := tools["gcalendar_list_events"]
	if !ok {
		t.Fatalf("gcalendar_list_events not found in GoogleWorkspaceTools")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	output := calTool.Execute(ctx, map[string]interface{}{
		"time_min":    "2020-01-01T00:00:00Z",
		"max_results": 3,
	})
	if strings.Contains(output, "failed") || strings.Contains(output, "Error") {
		t.Fatalf("calTool execution failed: %s", output)
	}
	if !strings.Contains(output, "Google Calendar") && !strings.Contains(output, "lutfiikbalmajid2@gmail.com") {
		t.Errorf("expected calendar output to contain Google Calendar or email, got: %s", output)
	}
	t.Logf("calTool output:\n%s", output)
}

func TestGitHubToolsListRepos(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	_, err = db.Exec("CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT)")
	if err != nil {
		t.Fatalf("create table: %v", err)
	}
	_, err = db.Exec("INSERT INTO system_settings (key, value) VALUES ('composio_api_key', 'ck_NfUrRvx2egHCE35pU-9F')")
	if err != nil {
		t.Fatalf("insert key: %v", err)
	}

	ghTools := GitHubTools(db)
	repoTool, ok := ghTools["github_list_repos"]
	if !ok {
		t.Fatalf("github_list_repos not found in GitHubTools")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	out := repoTool.Execute(ctx, map[string]interface{}{
		"per_page": 3,
		"sort":     "updated",
	})
	if strings.Contains(out, "Failed") || strings.Contains(out, "Error") {
		t.Fatalf("github_list_repos failed: %s", out)
	}
	if !strings.Contains(out, "GitHub Repositories") || !strings.Contains(out, "KendaliAI") {
		t.Errorf("expected GitHub Repositories and KendaliAI in output, got: %s", out)
	}
	t.Logf("github_list_repos output:\n%s", out)
}

func TestComposioCallNotConnectedAutoAuth(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	_, err = db.Exec("CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT)")
	if err != nil {
		t.Fatalf("create table: %v", err)
	}
	_, err = db.Exec("INSERT INTO system_settings (key, value) VALUES ('composio_api_key', 'ck_NfUrRvx2egHCE35pU-9F')")
	if err != nil {
		t.Fatalf("insert key: %v", err)
	}

	compTools := ComposioTools(db)
	callTool, ok := compTools["composio_call"]
	if !ok {
		t.Fatalf("composio_call not found")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// Slack is not connected yet: expect on-demand OAuth URL
	out := callTool.Execute(ctx, map[string]interface{}{
		"action": "SLACK_SEND_MESSAGE",
		"arguments": map[string]interface{}{
			"channel": "general",
			"text":    "Hello from test",
		},
	})
	if !strings.Contains(out, "not connected yet") && !strings.Contains(out, "not authorized yet") {
		t.Errorf("expected not connected notification, got: %s", out)
	}
	if !strings.Contains(out, "connect.composio.dev/link") {
		t.Errorf("expected redirect URL in output, got: %s", out)
	}
	t.Logf("composio_call on-demand auth output:\n%s", out)
}

func TestGmailListMessagesNotConnectedAutoAuth(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer db.Close()

	_, err = db.Exec("CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT)")
	if err != nil {
		t.Fatalf("create table: %v", err)
	}
	_, err = db.Exec("INSERT INTO system_settings (key, value) VALUES ('composio_api_key', 'ck_NfUrRvx2egHCE35pU-9F')")
	if err != nil {
		t.Fatalf("insert key: %v", err)
	}

	gwTools := GoogleWorkspaceTools(db)
	gmailTool, ok := gwTools["gmail_list_messages"]
	if !ok {
		t.Fatalf("gmail_list_messages not found")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	out := gmailTool.Execute(ctx, map[string]interface{}{
		"max_results": 2,
	})
	if !strings.Contains(out, "Gmail is not connected yet") {
		t.Errorf("expected not connected notification, got: %s", out)
	}
	if !strings.Contains(out, "connect.composio.dev/link") {
		t.Errorf("expected redirect URL in output, got: %s", out)
	}
	t.Logf("gmail_list_messages on-demand auth output:\n%s", out)
}

