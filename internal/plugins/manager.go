package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/kendaliai/app/internal/messaging"
)

// Manager manages lifecycle, discovery, creation, and execution of agent plugins.
type Manager struct {
	mu           sync.RWMutex
	plugins      map[string]*Plugin
	workspaceDir string
	globalDir    string
	bus          *messaging.EventBus
}

var DefaultManager *Manager

func NewManager(workspaceDir string, bus *messaging.EventBus) *Manager {
	home, _ := os.UserHomeDir()
	globalDir := filepath.Join(home, ".kendaliai", "plugins")
	_ = os.MkdirAll(globalDir, 0755)

	if workspaceDir == "" {
		cwd, err := os.Getwd()
		if err == nil {
			workspaceDir = cwd
		}
	}

	m := &Manager{
		plugins:      make(map[string]*Plugin),
		workspaceDir: workspaceDir,
		globalDir:    globalDir,
		bus:          bus,
	}

	m.Discover()
	DefaultManager = m
	return m
}

// Discover scans both workspace and global plugin directories for plugin.json manifests.
func (m *Manager) Discover() {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 1. Scan global dir (~/.kendaliai/plugins)
	m.scanDirLocked(m.globalDir, SourceGlobal)

	// 2. Scan ~/workspaces/plugins dir
	home, _ := os.UserHomeDir()
	if home != "" {
		m.scanDirLocked(filepath.Join(home, "workspaces", "plugins"), SourceWorkspace)
	}

	// 3. Scan workspace dir (.kendaliai/plugins or plugins)
	if m.workspaceDir != "" && m.workspaceDir != filepath.Join(home, "workspaces") {
		m.scanDirLocked(filepath.Join(m.workspaceDir, ".kendaliai", "plugins"), SourceWorkspace)
		m.scanDirLocked(filepath.Join(m.workspaceDir, "plugins"), SourceWorkspace)
	}
}

func (m *Manager) scanDirLocked(dir string, source PluginSource) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pluginDir := filepath.Join(dir, e.Name())
		manifestPath := filepath.Join(pluginDir, "plugin.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}

		var p Plugin
		if err := json.Unmarshal(data, &p); err == nil && p.ID != "" {
			p.Source = source
			p.Path = manifestPath
			p.Dir = pluginDir
			if p.Version == "" {
				p.Version = "1.0.0"
			}
			// Auto-repair any corrupt or missing HandlerType / Script / Command from disk
			repaired := false
			for i := range p.Tools {
				ht := strings.ToLower(strings.TrimSpace(string(p.Tools[i].HandlerType)))
				cmd := strings.TrimSpace(p.Tools[i].Command)
				script := strings.TrimSpace(p.Tools[i].Script)

				if cmd == "<nil>" || cmd == "null" {
					p.Tools[i].Command = ""
					cmd = ""
					repaired = true
				}
				if script == "<nil>" || script == "null" {
					p.Tools[i].Script = ""
					script = ""
					repaired = true
				}

				if ht == "<nil>" || ht == "null" || ht == "" || ht == "bash" || ht == "shell" || ht == "sh" || ht == "cmd" {
					if cmd != "" {
						p.Tools[i].HandlerType = HandlerCommand
					} else if script != "" {
						p.Tools[i].HandlerType = HandlerScript
					} else {
						p.Tools[i].HandlerType = HandlerCommand
					}
					repaired = true
				}
			}
			if repaired && manifestPath != "" {
				if manifestBytes, err := json.MarshalIndent(&p, "", "  "); err == nil {
					_ = os.WriteFile(manifestPath, manifestBytes, 0644)
				}
			}
			m.plugins[p.ID] = &p
		}
	}
}

// List returns all discovered plugins.
func (m *Manager) List() []*Plugin {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list := make([]*Plugin, 0, len(m.plugins))
	for _, p := range m.plugins {
		cp := *p
		list = append(list, &cp)
	}
	return list
}

// Get returns a plugin by ID.
func (m *Manager) Get(id string) (*Plugin, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	p, ok := m.plugins[id]
	if !ok {
		return nil, false
	}
	cp := *p
	return &cp, true
}

// Create creates a new plugin on disk and registers it immediately.
func (m *Manager) Create(req CreatePluginRequest) (*Plugin, error) {
	if strings.TrimSpace(req.ID) == "" {
		return nil, fmt.Errorf("plugin ID is required")
	}
	if strings.TrimSpace(req.Name) == "" {
		req.Name = req.ID
	}
	if req.Version == "" {
		req.Version = "1.0.0"
	}

	targetBase := m.globalDir
	source := SourceGlobal
	scope := strings.ToLower(strings.TrimSpace(req.Scope))
	if scope == "" {
		scope = strings.ToLower(strings.TrimSpace(req.Source))
	}
	if scope == "workspace" {
		home, _ := os.UserHomeDir()
		wsPlugins := filepath.Join(home, "workspaces", "plugins")
		_ = os.MkdirAll(wsPlugins, 0755)
		targetBase = wsPlugins
		source = SourceWorkspace
	}

	pluginDir := filepath.Join(targetBase, req.ID)
	if err := os.MkdirAll(pluginDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create plugin directory: %w", err)
	}

	// Write any bundled files/scripts
	for filename, content := range req.Files {
		filePath := filepath.Join(pluginDir, filename)
		_ = os.MkdirAll(filepath.Dir(filePath), 0755)
		if err := os.WriteFile(filePath, []byte(content), 0755); err != nil {
			return nil, fmt.Errorf("failed to write plugin file %s: %w", filename, err)
		}
	}

	now := time.Now()
	p := &Plugin{
		ID:           req.ID,
		Name:         req.Name,
		Description:  req.Description,
		Version:      req.Version,
		Author:       req.Author,
		Enabled:      true,
		Source:       source,
		Path:         filepath.Join(pluginDir, "plugin.json"),
		Dir:          pluginDir,
		SystemPrompt: req.SystemPrompt,
		Tools:        req.Tools,
		Skills:       req.Skills,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	for i := range p.Tools {
		cmd := strings.TrimSpace(p.Tools[i].Command)
		if cmd == "<nil>" || cmd == "null" {
			p.Tools[i].Command = ""
			cmd = ""
		}
		script := strings.TrimSpace(p.Tools[i].Script)
		if script == "<nil>" || script == "null" {
			p.Tools[i].Script = ""
			script = ""
		}
		ht := strings.ToLower(strings.TrimSpace(string(p.Tools[i].HandlerType)))
		if ht == "<nil>" || ht == "null" || ht == "" || ht == "bash" || ht == "shell" || ht == "sh" || ht == "cmd" {
			if script != "" && cmd == "" {
				p.Tools[i].HandlerType = HandlerScript
			} else {
				p.Tools[i].HandlerType = HandlerCommand
			}
		}
		if p.Tools[i].Parameters == nil {
			p.Tools[i].Parameters = make(map[string]interface{})
		}
	}

	manifestBytes, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(p.Path, manifestBytes, 0644); err != nil {
		return nil, fmt.Errorf("failed to save plugin.json: %w", err)
	}

	m.mu.Lock()
	m.plugins[p.ID] = p
	m.mu.Unlock()

	if m.bus != nil {
		m.bus.Publish(messaging.Event{
			Type:    "plugin.created",
			Payload: p,
		})
	}

	return p, nil
}

// Toggle enables or disables a plugin.
func (m *Manager) Toggle(id string, enabled bool) (*Plugin, error) {
	m.mu.Lock()
	p, ok := m.plugins[id]
	if !ok {
		m.mu.Unlock()
		return nil, fmt.Errorf("plugin not found: %s", id)
	}

	p.Enabled = enabled
	p.UpdatedAt = time.Now()

	manifestBytes, err := json.MarshalIndent(p, "", "  ")
	if err == nil && p.Path != "" {
		_ = os.WriteFile(p.Path, manifestBytes, 0644)
	}
	m.mu.Unlock()

	if m.bus != nil {
		m.bus.Publish(messaging.Event{
			Type:    "plugin.updated",
			Payload: p,
		})
	}

	return p, nil
}

// Delete removes a plugin and its directory.
func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	p, ok := m.plugins[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("plugin not found: %s", id)
	}

	dir := p.Dir
	delete(m.plugins, id)
	m.mu.Unlock()

	if dir != "" {
		_ = os.RemoveAll(dir)
	}

	if m.bus != nil {
		m.bus.Publish(messaging.Event{
			Type:    "plugin.deleted",
			Payload: map[string]string{"id": id},
		})
	}

	return nil
}

// ExecuteTool runs a tool defined in an enabled plugin.
func (m *Manager) ExecuteTool(ctx context.Context, pluginID, toolName string, args map[string]interface{}) (*PluginToolResult, error) {
	m.mu.RLock()
	p, ok := m.plugins[pluginID]
	if !ok || !p.Enabled {
		m.mu.RUnlock()
		return nil, fmt.Errorf("plugin %s not found or not enabled", pluginID)
	}

	var targetTool *PluginToolDef
	for i := range p.Tools {
		if p.Tools[i].Name == toolName {
			targetTool = &p.Tools[i]
			break
		}
	}
	m.mu.RUnlock()

	if targetTool == nil {
		return nil, fmt.Errorf("tool %s not found in plugin %s", toolName, pluginID)
	}

	timeout := 60 * time.Second
	if targetTool.TimeoutSeconds > 0 {
		timeout = time.Duration(targetTool.TimeoutSeconds) * time.Second
	}

	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cleanCmd := strings.TrimSpace(targetTool.Command)
	if cleanCmd == "<nil>" || cleanCmd == "null" {
		cleanCmd = ""
	}
	cleanScript := strings.TrimSpace(targetTool.Script)
	if cleanScript == "<nil>" || cleanScript == "null" {
		cleanScript = ""
	}
	hType := strings.ToLower(strings.TrimSpace(string(targetTool.HandlerType)))
	if hType == "<nil>" || hType == "null" {
		hType = ""
	}

	switch {
	case cleanCmd != "" || hType == string(HandlerCommand) || hType == "bash" || hType == "shell" || hType == "sh" || hType == "cmd":
		cmdStr := cleanCmd
		if cmdStr == "" {
			cmdStr = cleanScript
		}
		for k, v := range args {
			cmdStr = strings.ReplaceAll(cmdStr, fmt.Sprintf("{{%s}}", k), fmt.Sprint(v))
			cmdStr = strings.ReplaceAll(cmdStr, fmt.Sprintf("${%s}", k), fmt.Sprint(v))
		}
		cmd := exec.CommandContext(runCtx, "sh", "-c", cmdStr)
		cmd.Dir = p.Dir
		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
		err := cmd.Run()
		exitCode := 0
		if cmd.ProcessState != nil {
			exitCode = cmd.ProcessState.ExitCode()
		}
		return &PluginToolResult{
			Stdout:   stdout.String(),
			Stderr:   stderr.String(),
			ExitCode: exitCode,
			Success:  err == nil,
			Error:    fmt.Sprint(err),
		}, nil

	case cleanScript != "" || hType == string(HandlerScript) || hType == "script" || hType == "file":
		scriptPath := filepath.Join(p.Dir, cleanScript)
		argsJSON, _ := json.Marshal(args)
		cmd := exec.CommandContext(runCtx, scriptPath, string(argsJSON))
		cmd.Dir = p.Dir
		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
		err := cmd.Run()
		exitCode := 0
		if cmd.ProcessState != nil {
			exitCode = cmd.ProcessState.ExitCode()
		}
		return &PluginToolResult{
			Stdout:   stdout.String(),
			Stderr:   stderr.String(),
			ExitCode: exitCode,
			Success:  err == nil,
			Error:    fmt.Sprint(err),
		}, nil

	default:
		return nil, fmt.Errorf("unsupported handler type: %s", targetTool.HandlerType)
	}
}
