package plugins

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExecuteTool_NilHandlerTypeFallback(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "plugins_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	m := NewManager(tmpDir, nil)

	// Create a plugin with a tool that has handler_type explicitly set to "<nil>"
	p, err := m.Create(CreatePluginRequest{
		ID:          "test-monitor",
		Name:        "Test Monitor",
		Description: "A monitor test plugin",
		Tools: []PluginToolDef{
			{
				Name:        "get_stats",
				Description: "Gets test stats",
				HandlerType: HandlerType("<nil>"),
				Command:     "echo 'cpu: 10%'",
			},
		},
	})
	if err != nil {
		t.Fatalf("failed to create plugin: %v", err)
	}

	res, err := m.ExecuteTool(context.Background(), p.ID, "get_stats", nil)
	if err != nil {
		t.Fatalf("ExecuteTool failed: %v", err)
	}
	if strings.TrimSpace(res.Stdout) != "cpu: 10%" {
		t.Errorf("expected 'cpu: 10%%', got %q", res.Stdout)
	}
}

func TestDiscover_AutoRepairCorruptHandlerType(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "plugins_repair_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	pluginDir := filepath.Join(tmpDir, "corrupt-plugin")
	_ = os.MkdirAll(pluginDir, 0755)

	// Corrupt manifest on disk with "handler_type": "\u003cnil\u003e" and "script": "\u003cnil\u003e"
	rawManifest := `{
  "id": "corrupt-plugin",
  "name": "Corrupt Plugin",
  "enabled": true,
  "tools": [
    {
      "name": "echo_tool",
      "handler_type": "\u003cnil\u003e",
      "command": "echo 'repaired'",
      "script": "\u003cnil\u003e"
    }
  ]
}`
	_ = os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(rawManifest), 0644)

	m := &Manager{
		plugins:   make(map[string]*Plugin),
		globalDir: tmpDir,
	}
	m.Discover()

	p, ok := m.Get("corrupt-plugin")
	if !ok {
		t.Fatalf("plugin not discovered")
	}
	if p.Tools[0].HandlerType != HandlerCommand {
		t.Errorf("expected HandlerCommand, got %q", p.Tools[0].HandlerType)
	}

	res, err := m.ExecuteTool(context.Background(), "corrupt-plugin", "echo_tool", nil)
	if err != nil {
		t.Fatalf("ExecuteTool failed on repaired plugin: %v", err)
	}
	if strings.TrimSpace(res.Stdout) != "repaired" {
		t.Errorf("expected 'repaired', got %q", res.Stdout)
	}
}
