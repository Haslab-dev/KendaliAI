package acp

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

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

// resolveExecutablePath searches system PATH and standard user CLI install paths
// (e.g. ~/.local/bin, ~/.nvm/versions/node/*/bin, ~/.commandcode/bin, /opt/homebrew/bin)
// so GUI apps and daemon processes find them reliably.
func resolveExecutablePath(cmdName string) (string, error) {
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

// registry merges defaults with config overrides and resolves availability
// once at startup.
type registry struct {
	mu     sync.RWMutex
	agents []AgentDescriptor
}

func newRegistry(cfg *config.Config) *registry {
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

	for i := range agents {
		agents[i].Available = false
		agents[i].ACP = true
		if resolved, err := resolveExecutablePath(agents[i].Command); err == nil {
			agents[i].Available = true
			agents[i].Command = resolved
		}
	}
	return &registry{agents: agents}
}

func (r *registry) list() []AgentDescriptor {
	r.mu.Lock()
	defer r.mu.Unlock()
	// Refresh availability in case tools were installed or PATH updated
	for i := range r.agents {
		if resolved, err := resolveExecutablePath(r.agents[i].Command); err == nil {
			r.agents[i].Available = true
			r.agents[i].Command = resolved
		} else {
			r.agents[i].Available = false
		}
	}
	out := make([]AgentDescriptor, len(r.agents))
	copy(out, r.agents)
	return out
}

func (r *registry) get(id string) (AgentDescriptor, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, a := range r.agents {
		if a.ID == id {
			return a, nil
		}
	}
	return AgentDescriptor{}, fmt.Errorf("acp: unknown agent %q", id)
}
