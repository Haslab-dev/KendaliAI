package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/gateway"
	"github.com/kendaliai/app/internal/workspace"
)

func newTestServer(t *testing.T) (*Server, string) {
	t.Helper()
	cfg := &config.Config{}
	cfg.Database.Path = ":memory:"
	database, err := db.Initialize(cfg)
	if err != nil {
		t.Fatalf("db init: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	srv := NewServer(database)

	tmpDir := t.TempDir()
	// Point explorer to tmpDir
	srv.explorer = workspace.NewExplorer(tmpDir)

	return srv, tmpDir
}

func TestServerWorkspaceDownload(t *testing.T) {
	srv, tmpDir := newTestServer(t)

	// Create test files in tmpDir
	docxFile := filepath.Join(tmpDir, "report.docx")
	xlsxFile := filepath.Join(tmpDir, "finance.xlsx")
	htmlFile := filepath.Join(tmpDir, "animation.motion.html")

	if err := os.WriteFile(docxFile, []byte("fake docx content"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(xlsxFile, []byte("fake xlsx content"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(htmlFile, []byte("<html>preview</html>"), 0644); err != nil {
		t.Fatal(err)
	}

	handler := srv.handleWorkspaceDownload()

	t.Run("Standard docx download", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/workspace/download?path=report.docx", nil)
		rec := httptest.NewRecorder()
		handler(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Header().Get("Content-Disposition"), "attachment; filename=\"report.docx\"") {
			t.Errorf("expected Content-Disposition header with report.docx, got %q", rec.Header().Get("Content-Disposition"))
		}
		if !strings.Contains(rec.Header().Get("Content-Type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
			t.Errorf("expected docx content-type, got %q", rec.Header().Get("Content-Type"))
		}
	})

	t.Run("Download with synthetic /workspaces/ prefix", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/workspace/download?path=/workspaces/finance.xlsx", nil)
		rec := httptest.NewRecorder()
		handler(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200 for synthetic prefix, got %d: %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Header().Get("Content-Type"), "spreadsheetml") {
			t.Errorf("expected xlsx content-type, got %q", rec.Header().Get("Content-Type"))
		}
	})

	t.Run("Download with synthetic ~/workspaces/ prefix", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/workspace/download?path=~/workspaces/animation.motion.html", nil)
		rec := httptest.NewRecorder()
		handler(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200 for ~/workspaces prefix, got %d: %s", rec.Code, rec.Body.String())
		}
		if rec.Body.String() != "<html>preview</html>" {
			t.Errorf("unexpected body: %q", rec.Body.String())
		}
	})

	t.Run("Security denial for directory traversal", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/workspace/download?path=../../etc/passwd", nil)
		rec := httptest.NewRecorder()
		handler(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("expected status 403 Forbidden for path traversal, got %d", rec.Code)
		}
	})

	t.Run("Missing path returns 400", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/workspace/download", nil)
		rec := httptest.NewRecorder()
		handler(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected status 400 for missing path, got %d", rec.Code)
		}
	})

	t.Run("Non-existent file returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/workspace/download?path=does_not_exist.txt", nil)
		rec := httptest.NewRecorder()
		handler(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("expected status 404 for nonexistent file, got %d", rec.Code)
		}
	})
}

func TestServerMCPAPIs(t *testing.T) {
	srv, _ := newTestServer(t)

	// 1. Add new MCP server
	newServer := gateway.MCPServerConfig{
		ID:        "test-mcp",
		Name:      "Test MCP",
		Transport: "stdio",
		Command:   "node",
		Args:      []string{"index.js"},
		Enabled:   true,
	}
	body, _ := json.Marshal(newServer)
	req := httptest.NewRequest("POST", "/api/mcps", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleMCPs()(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("failed to create MCP server: %d (%s)", rec.Code, rec.Body.String())
	}

	// 2. List MCP servers
	req = httptest.NewRequest("GET", "/api/mcps", nil)
	rec = httptest.NewRecorder()
	srv.handleMCPs()(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("failed to list MCP servers: %d", rec.Code)
	}
	var list []gateway.MCPServerConfig
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatalf("failed to unmarshal MCP server list: %v", err)
	}
	found := false
	for _, m := range list {
		if m.ID == "test-mcp" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("created MCP server not found in list")
	}

	// 3. Test handleMCPFetchTools with firecrawl
	fcServer := gateway.MCPServerConfig{
		ID:        "firecrawl",
		Name:      "Firecrawl",
		Transport: "http",
		URL:       "https://mcp.firecrawl.dev/v2/mcp",
		Enabled:   true,
	}
	fcBody, _ := json.Marshal(fcServer)
	req = httptest.NewRequest("POST", "/api/mcps", bytes.NewReader(fcBody))
	rec = httptest.NewRecorder()
	srv.handleMCPs()(rec, req)

	fetchReqBody := []byte(`{"id": "firecrawl"}`)
	req = httptest.NewRequest("POST", "/api/mcps/fetch-tools", bytes.NewReader(fetchReqBody))
	rec = httptest.NewRecorder()
	srv.handleMCPFetchTools()(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("fetch-tools failed: %d (%s)", rec.Code, rec.Body.String())
	}
	var fetchRes struct {
		OK      bool                     `json:"ok"`
		Servers []gateway.MCPServerConfig `json:"servers"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &fetchRes); err != nil {
		t.Fatalf("failed to decode fetch-tools response: %v", err)
	}
	var firecrawlConfig *gateway.MCPServerConfig
	for _, s := range fetchRes.Servers {
		if s.ID == "firecrawl" {
			firecrawlConfig = &s
			break
		}
	}
	if firecrawlConfig == nil {
		t.Fatalf("firecrawl not found in fetch-tools response")
	}
	if len(firecrawlConfig.ToolsCached) == 0 {
		t.Errorf("expected cached tools for Firecrawl, got 0")
	}

	// 4. Delete MCP server
	req = httptest.NewRequest("DELETE", "/api/mcps?id=test-mcp", nil)
	rec = httptest.NewRecorder()
	srv.handleMCPs()(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("failed to delete MCP server: %d", rec.Code)
	}

	// 5. Test Composio key storage and auto-MCP config
	compBody := []byte(`{"apiKey": "ck_test_key_12345"}`)
	req = httptest.NewRequest("POST", "/api/composio/key", bytes.NewReader(compBody))
	rec = httptest.NewRecorder()
	srv.handleComposioKey()(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("failed to save composio key: %d (%s)", rec.Code, rec.Body.String())
	}

	// Check if composio was auto-registered in MCP servers
	mcpServer, err := srv.store.GetMCPServer("composio")
	if err != nil || mcpServer == nil {
		t.Fatalf("expected composio MCP server to be auto-registered for ck_ key, err: %v", err)
	}
	if mcpServer.URL != "https://connect.composio.dev/mcp" {
		t.Errorf("expected URL https://connect.composio.dev/mcp, got %s", mcpServer.URL)
	}
}
