package acp

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/kendaliai/app/internal/config"
)

// AgentDescriptor describes one launchable ACP agent. Availability is
// resolved by PATH lookup so the UI can gray out uninstalled commands.
type AgentDescriptor struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Description     string   `json:"description,omitempty"`
	Command         string   `json:"command"`
	Args            []string `json:"args,omitempty"`
	DefaultModel    string   `json:"defaultModel,omitempty"`
	SupportedModels []string `json:"supportedModels,omitempty"`
	Available       bool     `json:"available"`
	ACP             bool     `json:"acp"` // always true here; lets the UI badge uniformly
	Version         string   `json:"version,omitempty"`

	// fromConfig marks agents explicitly declared in config.acp.agents. They
	// stay listed even when the scan cannot find the binary so the user can
	// see (and fix) a broken entry; scanned defaults are dropped instead.
	fromConfig bool
}

// findExecutableDirect checks candidate dirs and exec.LookPath without checking aliases.
func findExecutableDirect(cmdName string) (string, error) {
	if cmdName == "" {
		return "", fmt.Errorf("command name is empty")
	}

	// If explicit path, verify directly
	if strings.Contains(cmdName, "/") {
		if fi, err := os.Stat(cmdName); err == nil && !fi.IsDir() {
			return cmdName, nil
		}
		return "", fmt.Errorf("command not found at %s", cmdName)
	}

	home, _ := os.UserHomeDir()
	candidateDirs := []string{
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, ".opencode", "bin"),
		filepath.Join(home, ".commandcode", "bin"),
		filepath.Join(home, ".cmd", "bin"),
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
		filepath.Join(home, ".cargo", "bin"),
		filepath.Join(home, ".bun", "bin"),
	}

	nvmNodeDir := filepath.Join(home, ".nvm", "versions", "node")
	if entries, err := os.ReadDir(nvmNodeDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				candidateDirs = append(candidateDirs, filepath.Join(nvmNodeDir, entry.Name(), "bin"))
			}
		}
	}

	for _, dir := range candidateDirs {
		p := filepath.Join(dir, cmdName)
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			return p, nil
		}
	}

	if found, err := exec.LookPath(cmdName); err == nil {
		return found, nil
	}

	return "", fmt.Errorf("command %q not found", cmdName)
}

// ResolveExecutablePath searches system PATH and standard user CLI install paths
// (e.g. ~/.local/bin, ~/.nvm/versions/node/*/bin, ~/.commandcode/bin, /opt/homebrew/bin)
// so GUI apps and daemon processes find them reliably.
func ResolveExecutablePath(cmdName string) (string, error) {
	if p, err := findExecutableDirect(cmdName); err == nil {
		return p, nil
	}

	var altName string
	switch cmdName {
	case "cmd":
		altName = "commandcode"
	case "commandcode":
		altName = "cmd"
	case "agy":
		altName = "antigravity"
	case "antigravity":
		altName = "agy"
	case "claude-code-acp":
		altName = "claude"
	case "claude":
		altName = "claude-code-acp"
	case "codex-acp":
		altName = "codex"
	case "codex":
		altName = "codex-acp"
	case "omp":
		altName = "ohmypi"
	case "ohmypi":
		altName = "omp"
	case "pi":
		altName = "pi-agent"
	}

	if altName != "" {
		if p, err := findExecutableDirect(altName); err == nil {
			return p, nil
		}
	}

	return "", fmt.Errorf("command %q not found on PATH or standard install directories", cmdName)
}

func resolveExecutablePath(cmdName string) (string, error) {
	return ResolveExecutablePath(cmdName)
}

// DetectVersion executes cmdPath --version with a 2-second timeout and returns the first line of output.
func DetectVersion(cmdPath string) string {
	if cmdPath == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, cmdPath, "--version")
	out, err := cmd.CombinedOutput()
	if err != nil && len(out) == 0 {
		return ""
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) > 0 {
		return strings.TrimSpace(lines[0])
	}
	return ""
}

// enrichedEnv returns the environment with enriched PATH containing CLI tool directories.
func enrichedEnv(extra []string) []string {
	home, _ := os.UserHomeDir()
	extraPaths := []string{
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, ".opencode", "bin"),
		filepath.Join(home, ".commandcode", "bin"),
		filepath.Join(home, ".cmd", "bin"),
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		filepath.Join(home, ".cargo", "bin"),
		filepath.Join(home, ".bun", "bin"),
	}

	nvmNodeDir := filepath.Join(home, ".nvm", "versions", "node")
	if entries, err := os.ReadDir(nvmNodeDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				extraPaths = append(extraPaths, filepath.Join(nvmNodeDir, entry.Name(), "bin"))
			}
		}
	}

	currentPath := os.Getenv("PATH")
	newPath := strings.Join(extraPaths, ":")
	if currentPath != "" {
		newPath = newPath + ":" + currentPath
	}

	baseEnv := os.Environ()
	res := make([]string, 0, len(baseEnv)+len(extra)+2)
	hasPath := false
	for _, env := range baseEnv {
		if strings.HasPrefix(env, "PATH=") {
			res = append(res, "PATH="+newPath)
			hasPath = true
		} else {
			res = append(res, env)
		}
	}
	if !hasPath {
		res = append(res, "PATH="+newPath)
	}
	res = append(res, extra...)
	return res
}

// defaultAgents are the well-known ACP adapters. Commands follow each
// project's published adapter entrypoint; every entry is overridable or
// extendable through config.acp.agents.
func defaultAgents() []AgentDescriptor {
	return []AgentDescriptor{
		{
			ID:           "agy",
			Name:         "Google Antigravity",
			Description:  "Google Antigravity autonomous coding agent CLI via stream-json",
			Command:      "agy",
			Args:         []string{"--input-format", "stream-json", "--output-format", "stream-json", "--dangerously-skip-permissions"},
			DefaultModel: "gemini-3.8-flash-high",
			SupportedModels: []string{
				"gemini-3.8-flash-high",
				"gemini-3.8-flash-medium",
				"gemini-3.8-flash-low",
				"claude-sonnet-4-6",
				"claude-opus-4-6-thinking",
				"gpt-oss-120b-medium",
				"gemini-2.5-pro",
				"gemini-2.5-flash",
			},
		},
		{
			ID:           "commandcode",
			Name:         "Command Code",
			Description:  "Command Code CLI via Agent Client Protocol (ACP)",
			Command:      "commandcode",
			Args:         []string{"acp"},
			DefaultModel: "claude-sonnet-5-5",
			SupportedModels: []string{
				"claude-sonnet-5-5",
				"claude-sonnet-5",
				"claude-opus-5-5",
				"claude-fable-5-1",
				"claude-haiku-5-5",
				"gpt-6-astra",
				"gpt-6.1-sol",
				"gpt-6-sol",
				"gpt-6-luna",
				"gpt-5.6-sol",
				"gpt-5.5",
				"deepseek/deepseek-v4.1-flash",
				"deepseek/deepseek-v4-flash",
				"deepseek/deepseek-v4-pro",
				"google/gemini-4-argon",
				"google/gemini-3.8-flash",
				"google/gemini-3.7-flash",
				"moonshotai/Kimi-K3",
				"Qwen/Qwen3.8-Flash",
				"Qwen/Qwen3.7-Max",
				"xai/grok-4.5",
				"xai/grok-4.6",
				"mistral/mistral-large-4",
			},
		},
		{
			ID:           "claude-code",
			Name:         "Claude Code",
			Description:  "Anthropic Claude Code via the claude-code-acp adapter",
			Command:      "claude-code-acp",
			DefaultModel: "sonnet",
			SupportedModels: []string{
				"sonnet",
				"opus",
				"haiku",
				"claude-sonnet-4-5",
				"claude-opus-5-5",
				"claude-fable-5-1[1m]",
				"glm-5.3-flash",
			},
		},
		{
			ID:           "gemini",
			Name:         "Gemini CLI",
			Description:  "Google Gemini CLI in experimental ACP mode",
			Command:      "gemini",
			Args:         []string{"--experimental-acp"},
			DefaultModel: "gemini-2.5-pro",
			SupportedModels: []string{
				"gemini-2.5-pro",
				"gemini-2.5-flash",
			},
		},
		{
			ID:           "codex",
			Name:         "Codex",
			Description:  "OpenAI Codex via the codex-acp adapter",
			Command:      "codex-acp",
			DefaultModel: "deepseek-v4-1-flash",
			SupportedModels: []string{
				"deepseek-v4-1-flash",
				"gpt-6.1-sol",
				"gpt-6-luna",
				"gpt-5.6-terra",
				"gpt-5.6-luna",
				"gpt-5.5",
				"gpt-5-codex",
			},
		},
		{
			ID:           "opencode",
			Name:         "OpenCode",
			Description:  "OpenCode CLI via ACP",
			Command:      "opencode",
			Args:         []string{"acp"},
			DefaultModel: "Kenari/glm-5-3-flash",
			SupportedModels: []string{
				"Kenari/glm-5-3-flash",
				"Kenari/deepseek-v4-1-flash",
				"Kenari/claude-haiku-5-5",
				"Kenari/gpt-6-luna",
				"deepseek/deepseek-v4-pro",
				"opencode/claude-sonnet-5-5",
				"opencode/deepseek-v4.1-flash",
				"opencode/gpt-6-astra",
			},
		},
		{
			ID:           "omp",
			Name:         "Oh My Pi (OMP)",
			Description:  "Oh My Pi autonomous coding agent CLI via ACP",
			Command:      "omp",
			Args:         []string{},
			DefaultModel: "claude-sonnet-4-5",
			SupportedModels: []string{
				"claude-sonnet-4-5",
				"claude-opus-4-6-thinking",
				"gpt-5.6-luna",
				"deepseek-v4-flash",
				"gemini-2.5-pro",
			},
		},
		{
			ID:           "pi",
			Name:         "Pi Coding Agent",
			Description:  "Pi AI coding assistant via RPC/JSON protocol",
			Command:      "pi",
			Args:         []string{"--mode", "rpc"},
			DefaultModel: "google/gemini-2.5-flash",
			SupportedModels: []string{
				"google/gemini-2.5-flash",
				"google/gemini-2.5-pro",
				"deepseek-v4-1-flash",
				"claude-sonnet-5-5",
			},
		},
	}
}

// Registry merges scan results with config overrides and resolves availability.
type Registry struct {
	mu     sync.RWMutex
	agents []AgentDescriptor
}

type registry = Registry

// NewRegistry scans the machine for launchable ACP agents and keeps only
// what is actually installed. Well-known adapters (defaultAgents) act as the
// scan target list; config.acp.agents entries extend or override the scan and
// are always kept so a misconfigured command stays visible to the user.
func NewRegistry(cfg *config.Config) *Registry {
	agents := defaultAgents()
	known := map[string]bool{}
	for i := range agents {
		known[agents[i].ID] = true
	}

	if cfg != nil {
		for _, custom := range cfg.ACP.Agents {
			if custom.Command == "" {
				continue
			}
			id := custom.ID
			if id == "" {
				id = custom.Command
			}
			desc := AgentDescriptor{
				ID:              id,
				Name:            custom.Name,
				Description:     custom.Description,
				Command:         custom.Command,
				Args:            custom.Args,
				DefaultModel:    custom.DefaultModel,
				SupportedModels: custom.SupportedModels,
				fromConfig:      true,
			}
			if desc.Name == "" {
				desc.Name = id
			}
			if known[id] {
				// Override the built-in entry in place.
				for i := range agents {
					if agents[i].ID == id {
						agents[i] = desc
					}
				}
			} else {
				agents = append(agents, desc)
				known[id] = true
			}
		}
	}

	// Availability scan: drop defaults whose command cannot be found so the
	// UI only ever shows agents that can actually be launched here.
	scanned := make([]AgentDescriptor, 0, len(agents))
	for i := range agents {
		agents[i].ACP = true
		if resolved, err := ResolveExecutablePath(agents[i].Command); err == nil {
			agents[i].Available = true
			agents[i].Command = resolved
			scanned = append(scanned, agents[i])
		} else if agents[i].fromConfig {
			agents[i].Available = false
			scanned = append(scanned, agents[i])
		}
	}
	reg := &Registry{agents: scanned}
	RefreshCatalogCacheAsync()
	return reg
}

func newRegistry(cfg *config.Config) *Registry {
	return NewRegistry(cfg)
}

// NormalizeAgentID normalizes user/UI strings, aliases, and agent-* identifiers
// to canonical ACP agent IDs.
func NormalizeAgentID(id string) string {
	clean := strings.ToLower(strings.TrimSpace(id))
	clean = strings.TrimPrefix(clean, "agent-")
	switch clean {
	case "antigravity", "agy", "google-antigravity", "google_antigravity":
		return "agy"
	case "cmd", "commandcode", "command-code", "command_code":
		return "commandcode"
	case "claude", "claude-code", "claudecode", "claude_code":
		return "claude-code"
	case "gemini", "gemini-cli", "geminicli":
		return "gemini"
	case "codex", "openai-codex", "openai_codex":
		return "codex"
	case "opencode", "open-code", "open_code":
		return "opencode"
	case "omp", "ohmypi", "oh-my-pi", "oh_my_pi":
		return "omp"
	case "pi", "pi-agent", "pi-coding-agent":
		return "pi"
	default:
		return clean
	}
}

func (r *Registry) List() []AgentDescriptor {
	r.mu.Lock()
	defer r.mu.Unlock()
	// Re-scan availability (tools may be installed or uninstalled while
	// running) and keep the roster scan-first: only installed agents are
	// listed, except explicitly configured ones which stay visible.
	out := make([]AgentDescriptor, 0, len(r.agents))
	for i := range r.agents {
		if resolved, err := ResolveExecutablePath(r.agents[i].Command); err == nil {
			r.agents[i].Available = true
			r.agents[i].Command = resolved
			out = append(out, r.agents[i])
		} else {
			r.agents[i].Available = false
			if r.agents[i].fromConfig {
				out = append(out, r.agents[i])
			}
		}
	}
	return EnrichAgentDescriptors(out)
}

func (r *Registry) list() []AgentDescriptor {
	return r.List()
}

func (r *Registry) IsACPAgent(id string) bool {
	norm := NormalizeAgentID(id)
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, a := range r.agents {
		if a.ID == id || a.ID == norm || NormalizeAgentID(a.ID) == norm || strings.EqualFold(a.Name, id) {
			return true
		}
	}
	return false
}

func (r *Registry) Get(id string) (AgentDescriptor, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	norm := NormalizeAgentID(id)
	for _, a := range r.agents {
		if a.ID == id || a.ID == norm || NormalizeAgentID(a.ID) == norm || strings.EqualFold(a.Name, id) {
			enriched := EnrichAgentDescriptors([]AgentDescriptor{a})
			return enriched[0], nil
		}
	}
	return AgentDescriptor{}, fmt.Errorf("acp: unknown agent %q", id)
}

func (r *Registry) get(id string) (AgentDescriptor, error) {
	return r.Get(id)
}
