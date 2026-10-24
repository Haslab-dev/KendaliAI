package composio

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPopularToolkitsFallback(t *testing.T) {
	if len(PopularToolkits) < 10 {
		t.Fatalf("expected at least 10 popular toolkits, got %d", len(PopularToolkits))
	}
	foundGitHub := false
	foundGmail := false
	for _, tk := range PopularToolkits {
		if tk.Slug == "github" {
			foundGitHub = true
		}
		if tk.Slug == "gmail" {
			foundGmail = true
		}
	}
	if !foundGitHub || !foundGmail {
		t.Errorf("popular toolkits missing github or gmail")
	}
}

func TestComposioClientMockEndpoints(t *testing.T) {
	mux := http.NewServeMux()

	// Mock toolkits
	mux.HandleFunc("/toolkits", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "ak_test_123" {
			http.Error(w, `{"error":{"message":"unauthorized"}}`, http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"items":[{"slug":"github","name":"GitHub","description":"GitHub integration"}]}`))
	})

	// Mock connected accounts
	mux.HandleFunc("/connected_accounts", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"id":"acc_1","toolkit":{"slug":"github"},"status":"ACTIVE"}]`))
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewClient("ak_test_123")
	client.base = srv.URL

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	toolkits, err := client.Toolkits(ctx)
	if err != nil {
		t.Fatalf("Toolkits failed: %v", err)
	}
	if len(toolkits) != 1 || toolkits[0].Slug != "github" {
		t.Errorf("unexpected toolkits: %+v", toolkits)
	}

	accounts, err := client.Accounts(ctx)
	if err != nil {
		t.Fatalf("Accounts failed: %v", err)
	}
	if len(accounts) != 1 || accounts[0].ID != "acc_1" || accounts[0].Status != "ACTIVE" {
		t.Errorf("unexpected accounts: %+v", accounts)
	}
}

func TestComposioCKKeyFriendlyError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/toolkits", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"message":"Invalid API key"}}`, http.StatusUnauthorized)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client := NewClient("ck_test_key_12345")
	client.base = srv.URL

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := client.do(ctx, http.MethodGet, "/toolkits", nil, nil)
	if err == nil {
		t.Fatalf("expected error for 401, got nil")
	}
	if !strings.Contains(err.Error(), "Composio Connect (MCP) Consumer Key") {
		t.Errorf("expected friendly explanation about ck_ key, got %v", err)
	}
}

func TestComposioCKConnectViaMCP(t *testing.T) {
	client := NewClient("ck_NfUrRvx2egHCE35pU-9F")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	acc, err := client.Connect(ctx, "googlecalendar")
	if err != nil {
		t.Fatalf("Connect via MCP failed: %v", err)
	}
	if acc == nil {
		t.Fatal("expected non-nil ConnectedAccount")
	}
	if !strings.Contains(acc.RedirectURL, "connect.composio.dev/link") {
		t.Errorf("expected redirect URL containing connect.composio.dev/link, got %s", acc.RedirectURL)
	}
	if acc.ToolkitSlug != "googlecalendar" {
		t.Errorf("expected toolkitSlug googlecalendar, got %s", acc.ToolkitSlug)
	}
	t.Logf("Successfully initiated connection for googlecalendar: ID=%s, RedirectURL=%s", acc.ID, acc.RedirectURL)
}

func TestComposioCKExecuteViaMCP(t *testing.T) {
	client := NewClient("ck_NfUrRvx2egHCE35pU-9F")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	res, err := client.Execute(ctx, "GOOGLECALENDAR_EVENTS_LIST", "", map[string]interface{}{
		"calendarId": "primary",
		"maxResults": 3,
	})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	t.Logf("Execute returned: %+v", res)
}

func TestComposioCKExecuteWithSuggestionRetry(t *testing.T) {
	client := NewClient("ck_NfUrRvx2egHCE35pU-9F")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// Deliberately pass the slug without "THE" that Fatima called
	res, err := client.Execute(ctx, "GITHUB_LIST_REPOSITORIES_FOR_AUTHENTICATED_USER", "", map[string]interface{}{
		"per_page": 5,
		"sort":     "updated",
	})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	t.Logf("Execute with suggestion auto-retry succeeded: repos=%d", len(res["repositories"].([]interface{})))

	// Test user info
	uRes, err := client.Execute(ctx, "GITHUB_GET_THE_AUTHENTICATED_USER", "", map[string]interface{}{})
	if err != nil {
		t.Logf("user info failed: %v", err)
	} else {
		t.Logf("user info: login=%v, name=%v", uRes["login"], uRes["name"])
	}

	// Test Gmail
	gRes, err := client.Execute(ctx, "GMAIL_FETCH_EMAILS", "", map[string]interface{}{
		"max_results": 2,
	})
	t.Logf("gmail fetch: res=%+v, err=%v", gRes != nil, err)
	if err != nil && strings.Contains(err.Error(), "No active connection") {
		acc, cErr := client.Connect(ctx, "gmail")
		t.Logf("gmail connect on-demand: acc=%+v, err=%v", acc, cErr)
	}
}

func TestComposioCKToolsViaMCP(t *testing.T) {
	client := NewClient("ck_NfUrRvx2egHCE35pU-9F")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	testToolkits := []string{"github", "gmail", "slack", "jira", "notion"}
	for _, tk := range testToolkits {
		tools, err := client.Tools(ctx, tk)
		if err != nil {
			t.Errorf("Tools failed for %s: %v", tk, err)
			continue
		}
		var slugs []string
		for _, s := range tools {
			slugs = append(slugs, s.Slug)
			if s.Slug == "GMAIL_FETCH_EMAILS" || s.Slug == "GMAIL_SEND_EMAIL" || s.Slug == "SLACK_SEND_MESSAGE" {
				t.Logf("Tool %s params: %+v", s.Slug, s.Parameters)
			}
		}
		t.Logf("Toolkit %-10s actions (%d): %s", tk, len(tools), strings.Join(slugs, ", "))
	}
}

func TestComposioCKAccountsViaMCP(t *testing.T) {
	client := NewClient("ck_NfUrRvx2egHCE35pU-9F")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	accounts, err := client.Accounts(ctx)
	if err != nil {
		t.Fatalf("Accounts failed: %v", err)
	}
	t.Logf("Accounts returned %d accounts:", len(accounts))
	for _, acc := range accounts {
		t.Logf(" - [%s] toolkit=%s, id=%s", acc.Status, acc.ToolkitSlug, acc.ID)
	}
}
