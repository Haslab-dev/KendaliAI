// Package agentengine embeds the RakitKode coding-agent engine
// (github.com/Haslab-dev/RakitKode) as KendaliAI's agent harness. It composes
// the engine's managers the same way ForgeADE's desktop app does, bridges
// engine events onto the internal messaging bus with the same event shapes
// the builtin gateway runtime publishes, and mirrors assistant replies into
// the session store so existing UI surfaces keep working unchanged.
package agentengine

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/Haslab-dev/RakitKode/agent"
	"github.com/Haslab-dev/RakitKode/decisions"
	"github.com/Haslab-dev/RakitKode/events"
	"github.com/Haslab-dev/RakitKode/llm"
	"github.com/Haslab-dev/RakitKode/mcp"
	"github.com/Haslab-dev/RakitKode/memory"
	"github.com/Haslab-dev/RakitKode/plugins"
	"github.com/Haslab-dev/RakitKode/search"
	"github.com/Haslab-dev/RakitKode/skills"
	"github.com/Haslab-dev/RakitKode/store"
	"github.com/Haslab-dev/RakitKode/tools"

	"github.com/kendaliai/app/internal/botmode"
	"github.com/kendaliai/app/internal/config"
)

// Engine owns the embedded RakitKode engine: its event bus, the agent
// manager that runs turns, and the supporting managers (LLM providers, tool
// registry, skills, plugins, memory, MCP).
type Engine struct {
	Bus       *events.Bus
	AgentMgr  *agent.Manager
	LLMClient *llm.LLMClient
	ToolReg   *tools.Registry
	SkillMgr  *skills.Manager
	PluginMgr *plugins.Manager
	MemoryMgr *memory.Manager
	MCPMgr    *mcp.Manager

	dataDir   string
	workspace string

	// mu guards the kendali-session → engine-session mapping.
	mu       sync.Mutex
	sessions map[string]string

	autoApprove bool
}

// New composes the RakitKode engine under dataDir (providers_config.json,
// mcp_servers.json and skills live there; engine storage nests under
// <dataDir>/rakit). workspace is the default project folder for sessions.
func New(dataDir, workspace string) (*Engine, error) {
	if dataDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("agentengine: resolve home: %w", err)
		}
		dataDir = filepath.Join(home, ".kendaliai")
	}
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("agentengine: create data dir: %w", err)
	}

	// Engine storage (sessions, plugins, index buckets) must be rooted before
	// any engine component is constructed.
	store.SetRoot(filepath.Join(dataDir, "rakit"))

	bus := events.NewBus()
	llmClient := llm.NewLLMClient(dataDir)
	toolReg := tools.NewRegistry(search.NewSearchManager())
	skillMgr := skills.NewManager(filepath.Join(dataDir, "skills"))
	pluginMgr := plugins.NewManager(dataDir, bus)
	memoryMgr := memory.New(dataDir)
	memoryMgr.SetGlobalDir(dataDir)
	mcpMgr := mcp.NewManager(dataDir)

	// nil ShellManager: shell tools fall back to one-shot subprocesses (the
	// gateway's PTY terminal is not required for engine turns).
	agentMgr := agent.NewManagerWithOptions(agent.ManagerOptions{
		LLMClient:    llmClient,
		ToolRegistry: toolReg,
		Skills:       skillMgr,
		Plugins:      pluginMgr,
		MCP:          mcpMgr,
		Shell:        nil, // shell tools use one-shot subprocesses
		Bus:          bus,
		DataDir:      dataDir,
	})
	agentMgr.SetMemoryManager(memoryMgr)
	if workspace != "" {
		agentMgr.SetDefaultFolder(workspace)
	}

	// Decision and tool routing (Pandu-Micro offline by default; Jev cloud cascade only if EnableJev is true)
	jevEnabled := false
	jevKey := ""
	jevEndpoint := ""
	if cfg := config.Cfg; cfg != nil {
		jevEnabled = cfg.Engine.EnableJev
		jevKey = cfg.Engine.JevApiKey
		jevEndpoint = cfg.Engine.JevEndpoint
	}

	if router := agentMgr.GetJevRouter(); router != nil {
		router.SetEnabled(jevEnabled)
		if jevKey != "" {
			router.SetAPIKey(jevKey)
		}
		if jevEndpoint != "" {
			router.SetEndpoint(jevEndpoint)
		}
	}
	if adapter := agentMgr.GetDecisionAdapter(); adapter != nil {
		mode := decisions.ModeLocalOnly
		if jevEnabled {
			mode = decisions.ModeCascade
		}
		_ = adapter.Configure(decisions.DecisionConfig{
			EnableJev:           jevEnabled,
			JevAPIKey:           jevKey,
			JevEndpoint:         jevEndpoint,
			Mode:                mode,
			ConfidenceThreshold: 0.90,
			FallbackToLocal:     true,
		})
	}

	e := &Engine{
		Bus:         bus,
		AgentMgr:    agentMgr,
		LLMClient:   llmClient,
		ToolReg:     toolReg,
		SkillMgr:    skillMgr,
		PluginMgr:   pluginMgr,
		MemoryMgr:   memoryMgr,
		MCPMgr:      mcpMgr,
		dataDir:     dataDir,
		workspace:   workspace,
		sessions:    make(map[string]string),
		autoApprove: true,
	}
	return e, nil
}

// Start connects enabled MCP servers and registers their discovered tools
// into the tool registry (connect-on-startup, matching ForgeADE).
func (e *Engine) Start(ctx context.Context) {
	if err := e.MCPMgr.ConnectAll(ctx); err != nil {
		log.Printf("agentengine: mcp connect all: %v", err)
	}
	for _, t := range e.MCPMgr.ListConnectedTools() {
		e.ToolReg.RegisterMCPToolWithCaller(llm.MCPTool{
			ServerName:  t.ServerName,
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.InputSchema,
		}, e.MCPMgr)
	}
	log.Printf("agentengine: engine ready (%d MCP tools registered)", len(e.ToolReg.Definitions()))
}

// Stop disconnects MCP servers.
func (e *Engine) Stop(ctx context.Context) {
	e.MCPMgr.DisconnectAll()
}

// SetAutoApprove toggles tool auto-approval for sessions created afterwards
// (headless gateway defaults to true).
func (e *Engine) SetAutoApprove(enabled bool) {
	e.mu.Lock()
	e.autoApprove = enabled
	e.mu.Unlock()
}

// ProviderInput is the neutral provider description synced from the gateway
// store into the engine's providers_config.json.
type ProviderInput struct {
	ID        string
	Name      string
	Type      string
	APIKey    string
	Endpoint  string
	Models    []string
	IsDefault bool
	Enabled   bool
}

// SyncProviders merges gateway-configured providers into the engine's
// provider profiles (matching by ID, never clobbering engine-side settings)
// and activates the default provider/model. Returns the default profile ID
// and model that are now active (empty if no default).
func (e *Engine) SyncProviders(items []ProviderInput) (string, string) {
	profiles := make([]llm.ProviderProfile, 0, len(items))
	for _, p := range items {
		if p.APIKey == "" && p.Endpoint == "" {
			continue
		}
		profiles = append(profiles, llm.ProviderProfile{
			ID:              p.ID,
			Name:            p.Name,
			APIKey:          p.APIKey,
			BaseURL:         p.Endpoint,
			Enabled:         p.Enabled,
			AvailableModels: p.Models,
			SelectedModels:  p.Models,
		})
	}
	if len(profiles) == 0 {
		return "", ""
	}
	merged, err := e.LLMClient.SyncProviderProfiles(profiles)
	if err != nil {
		log.Printf("agentengine: sync provider profiles: %v", err)
		return "", ""
	}
	log.Printf("agentengine: %d engine provider profile(s) synced", len(merged))
	for _, p := range items {
		if !p.IsDefault || len(p.Models) == 0 {
			continue
		}
		e.LLMClient.SetActiveModel(p.ID, p.Models[0])
		return p.ID, p.Models[0]
	}
	return "", ""
}

// EnsureSession returns the engine session bound to a gateway session ID,
// creating it on first use. Standalone engine sessions (their ID is already
// an engine session) pass through unchanged.
func (e *Engine) EnsureSession(sessionID, name string) (string, error) {
	if _, ok := e.AgentMgr.GetSession(sessionID); ok {
		return sessionID, nil
	}
	e.mu.Lock()
	rid, ok := e.sessions[sessionID]
	autoApprove := e.autoApprove
	e.mu.Unlock()
	if ok {
		if _, alive := e.AgentMgr.GetSession(rid); alive {
			return rid, nil
		}
	}
	var role agent.RoleFilter
	created, err := e.AgentMgr.CreateSession(name, role, e.workspace)
	if err != nil {
		return "", fmt.Errorf("agentengine: create session: %w", err)
	}
	if autoApprove {
		_ = e.AgentMgr.SetAutoApprove(created.ID, true)
	}
	e.mu.Lock()
	e.sessions[sessionID] = created.ID
	e.mu.Unlock()
	return created.ID, nil
}

// ResolveEngineSession maps a gateway session ID to its engine session ID
// (ok=false when the gateway ID is unmapped). Engine sessions map to
// themselves.
func (e *Engine) ResolveEngineSession(sessionID string) (string, bool) {
	if _, ok := e.AgentMgr.GetSession(sessionID); ok {
		return sessionID, true
	}
	rid, ok := e.engineSessionFor(sessionID)
	return rid, ok
}

// engineSessionFor resolves the engine session that owns a gateway session
// ID ("" when the gateway ID is not mapped).
func (e *Engine) engineSessionFor(sessionID string) (string, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	rid, ok := e.sessions[sessionID]
	return rid, ok
}

// ApplyMode configures the engine session persona to match the requested mode.
func (e *Engine) ApplyMode(sessionID string, mode botmode.Mode) error {
	rid, err := e.EnsureSession(sessionID, "Kendali "+sessionID)
	if err != nil {
		return err
	}
	sess, ok := e.AgentMgr.GetSession(rid)
	if !ok {
		return fmt.Errorf("agentengine: session %s not found", rid)
	}
	persona := botmode.PersonaPrompt(mode)
	_, err = e.AgentMgr.UpdateSession(rid, sess.Name, sess.RoleFilter, persona, sess.CustomRules)
	return err
}

// Send runs a turn: resolves (or lazily creates) the engine session for the
// given gateway session ID and submits the user content. The turn runs in
// the engine's background goroutine; progress arrives as bus events.
func (e *Engine) Send(ctx context.Context, sessionID, content string, mentionedPaths []string) error {
	if content == "" {
		return fmt.Errorf("agentengine: empty message")
	}
	if bMode, remaining, isModeCmd := botmode.ParseSlashCommand(content); isModeCmd {
		_ = e.ApplyMode(sessionID, bMode)
		if remaining == "" {
			return nil
		}
		content = remaining
	}
	rid, err := e.EnsureSession(sessionID, "Kendali "+sessionID)
	if err != nil {
		return err
	}
	return e.AgentMgr.SendMessage(ctx, rid, content, mentionedPaths)
}

// ResolveEventSession maps an engine session ID (from bus events) back to
// the gateway session ID it belongs to. Engine sessions created standalone
// map to themselves.
func (e *Engine) ResolveEventSession(engineSessionID string) string {
	e.mu.Lock()
	defer e.mu.Unlock()
	for kendaliID, rid := range e.sessions {
		if rid == engineSessionID {
			return kendaliID
		}
	}
	return engineSessionID
}

// Status is the health/snapshot payload for the status endpoint.
type Status struct {
	Sessions      int         `json:"sessions"`
	ToolCount     int         `json:"toolCount"`
	ActiveModel   llm.Profile `json:"activeModel"`
	DecisionModel string      `json:"decisionModel,omitempty"`
	DecisionMode  string      `json:"decisionMode,omitempty"`
	JevEnabled    bool        `json:"jevEnabled"`
	MCPServers    int         `json:"mcpServers"`
	DataDir       string      `json:"dataDir"`
	Workspace     string      `json:"workspace,omitempty"`
	AutoApprove   bool        `json:"autoApprove"`
}

// Status snapshots the engine.
func (e *Engine) Status() Status {
	e.mu.Lock()
	autoApprove := e.autoApprove
	e.mu.Unlock()

	decModel := decisions.SmallModelVersion
	decMode := string(decisions.ModeLocalOnly)
	jevEnabled := false
	if adapter := e.AgentMgr.GetDecisionAdapter(); adapter != nil {
		st := adapter.GetStatus()
		decModel = st.ModelVersion
		decMode = string(st.Mode)
		jevEnabled = st.JevEnabled
	}

	return Status{
		Sessions:      len(e.AgentMgr.ListSessions()),
		ToolCount:     len(e.ToolReg.Definitions()),
		ActiveModel:   e.LLMClient.GetConfig(),
		DecisionModel: decModel,
		DecisionMode:  decMode,
		JevEnabled:    jevEnabled,
		MCPServers:    len(e.MCPMgr.ListServers()),
		DataDir:       e.dataDir,
		Workspace:     e.workspace,
		AutoApprove:   autoApprove,
	}
}

// DataDir returns the engine's config directory.
func (e *Engine) DataDir() string { return e.dataDir }

// DefaultWorkspace returns the workspace sessions are rooted at.
func (e *Engine) DefaultWorkspace() string { return e.workspace }

// Enabled reports whether the RakitKode engine is selected in config.
func Enabled() bool {
	return config.Cfg != nil && config.Cfg.Engine.Kind == "rakit"
}
