package config

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type ProviderConfig struct {
	Name     string `json:"name" yaml:"name"`
	Type     string `json:"type" yaml:"type"`
	APIKey   string `json:"apiKey,omitempty" yaml:"apiKey,omitempty"`
	Endpoint string `json:"endpoint" yaml:"endpoint"`
	Model    string `json:"model" yaml:"model"`
}

type EmbeddingConfig struct {
	APIKey     string `json:"apiKey,omitempty" yaml:"apiKey,omitempty"`
	Endpoint   string `json:"endpoint" yaml:"endpoint"`
	Model      string `json:"model" yaml:"model"`
	Dimensions int    `json:"dimensions,omitempty" yaml:"dimensions,omitempty"`
	Enabled    bool   `json:"enabled" yaml:"enabled"`
}

type ChannelConfig struct {
	ID          string `json:"id" yaml:"id"`
	ChannelName string `json:"channelName" yaml:"channelName"`
	ChannelType string `json:"channelType" yaml:"channelType"`
	Token       string `json:"token" yaml:"token"`
}

type Config struct {
	Version  int `json:"version" yaml:"version"`
	Database struct {
		Path string `json:"path" yaml:"path"`
	} `json:"database" yaml:"database"`
	DefaultProvider string                     `json:"defaultProvider" yaml:"defaultProvider"`
	ChatProviders   []ProviderConfig           `json:"chatProviders" yaml:"chatProviders"`
	Embedding       EmbeddingConfig            `json:"embedding" yaml:"embedding"`
	Channels        []ChannelConfig            `json:"channels" yaml:"channels"`
	MCPServers      map[string]MCPServerConfig `json:"mcpServers" yaml:"mcpServers"`
	Storage         StorageConfig              `json:"storage" yaml:"storage"`
	Permissions     PermissionsConfig          `json:"permissions" yaml:"permissions"`
	Reflection      ReflectionConfig           `json:"reflection" yaml:"reflection"`
	Search          SearchConfig               `json:"search,omitempty" yaml:"search,omitempty"`
	Vector          VectorConfig               `json:"vector,omitempty" yaml:"vector,omitempty"`
	// NativeTools enables the native function-calling API for providers that
	// support it (GOALS.md Gate-1). Nil defaults to true. Set false to force
	// the legacy `tool: NAME({...})` text protocol. A provider that rejects
	// native tool calls falls back to the text protocol automatically.
	NativeTools *bool `json:"nativeTools,omitempty" yaml:"nativeTools,omitempty"`
	// ComputerUse gates the macOS desktop-control tools (internal/computer).
	ComputerUse ComputerUseConfig `json:"computerUse,omitempty" yaml:"computerUse,omitempty"`
	// BrowserUse gates the browser-control tools (internal/browser).
	BrowserUse BrowserUseConfig `json:"browserUse,omitempty" yaml:"browserUse,omitempty"`
	// Engine selects the agent harness that runs turns. "builtin" (default,
	// empty) keeps the gateway runtime + cognition loop; "rakit" routes web
	// turns through the embedded RakitKode engine (internal/agentengine).
	Engine EngineConfig `json:"engine,omitempty" yaml:"engine,omitempty"`
	// ACP configures external Agent Client Protocol agents (claude-code-acp,
	// gemini --experimental-acp, ...) that the UI drives as first-class
	// tasks. Defaults live in internal/acp; entries here add or override.
	ACP ACPConfig `json:"acp,omitempty" yaml:"acp,omitempty"`
}

// ACPConfig collects custom ACP agent launch definitions.
type ACPConfig struct {
	Agents []ACPAgentConfig `json:"agents,omitempty" yaml:"agents,omitempty"`
}

// ACPAgentConfig defines (or overrides) one ACP agent launcher.
type ACPAgentConfig struct {
	ID              string   `json:"id,omitempty" yaml:"id,omitempty"`
	Name            string   `json:"name,omitempty" yaml:"name,omitempty"`
	Description     string   `json:"description,omitempty" yaml:"description,omitempty"`
	Command         string   `json:"command" yaml:"command"`
	Args            []string `json:"args,omitempty" yaml:"args,omitempty"`
	DefaultModel    string   `json:"defaultModel,omitempty" yaml:"defaultModel,omitempty"`
	SupportedModels []string `json:"supportedModels,omitempty" yaml:"supportedModels,omitempty"`
}

// EngineConfig configures the embedded RakitKode engine harness.
type EngineConfig struct {
	// Kind selects the engine: "" or "builtin" (legacy stacks) | "rakit".
	Kind string `json:"kind,omitempty" yaml:"kind,omitempty"`
	// Workspace is the default project folder engine sessions operate on
	// (defaults to the server's working directory).
	Workspace string `json:"workspace,omitempty" yaml:"workspace,omitempty"`
	// AutoApprove auto-approves engine tool calls (headless default true).
	AutoApprove *bool `json:"autoApprove,omitempty" yaml:"autoApprove,omitempty"`
	// SyncProviders disables syncing gateway-configured providers into the
	// engine's provider profiles when false (default true).
	SyncProviders *bool `json:"syncProviders,omitempty" yaml:"syncProviders,omitempty"`
	// EnableJev enables the Typesafe AI Jev intelligent tool and role router.
	// When false (default), the engine uses Pandu-Micro in-process offline neural decisions.
	EnableJev bool `json:"enableJev,omitempty" yaml:"enableJev,omitempty"`
	// JevApiKey enables the engine's remote tool-routing classifier
	// (Typesafe AI Jev). Empty keeps local keyword-heuristic routing only.
	JevApiKey string `json:"jevApiKey,omitempty" yaml:"jevApiKey,omitempty"`
	// JevEndpoint overrides the routing service URL (defaults to the
	// Typesafe AI cloud endpoint).
	JevEndpoint string `json:"jevEndpoint,omitempty" yaml:"jevEndpoint,omitempty"`
}

// EngineEnableJev reports whether Jev remote routing is enabled (default false: uses Pandu-Micro).
func (c *Config) EngineEnableJev() bool {
	return c != nil && c.Engine.EnableJev
}

// EngineAutoApprove reports whether engine tool calls should auto-approve
// (default true when unset).
func (c *Config) EngineAutoApprove() bool {
	return c == nil || c.Engine.AutoApprove == nil || *c.Engine.AutoApprove
}

// EngineSyncProviders reports whether gateway providers should sync into the
// engine profile list (default true when unset).
func (c *Config) EngineSyncProviders() bool {
	return c == nil || c.Engine.SyncProviders == nil || *c.Engine.SyncProviders
}

// NativeToolsEnabled reports whether native function calling should be
// attempted (default true when unset).
func (c *Config) NativeToolsEnabled() bool {
	return c == nil || c.NativeTools == nil || *c.NativeTools
}

type SearchConfig struct {
	Provider string `json:"provider" yaml:"provider"`
	Index    string `json:"index,omitempty" yaml:"index,omitempty"`
}

type VectorConfig struct {
	Provider string `json:"provider" yaml:"provider"`
}

type ReflectionConfig struct {
	Enabled  bool   `json:"enabled" yaml:"enabled"`
	Schedule string `json:"schedule" yaml:"schedule"`
	Timezone string `json:"timezone" yaml:"timezone"`
}

type R2Config struct {
	Endpoint  string `json:"endpoint" yaml:"endpoint"`
	AccessKey string `json:"accessKey" yaml:"accessKey"`
	SecretKey string `json:"secretKey" yaml:"secretKey"`
	PublicURL string `json:"publicUrl,omitempty" yaml:"publicUrl,omitempty"`
	Region    string `json:"region" yaml:"region"`
	Bucket    string `json:"bucket" yaml:"bucket"`
}

type StorageConfig struct {
	Provider  string   `json:"provider" yaml:"provider"`
	LocalPath string   `json:"localPath,omitempty" yaml:"localPath,omitempty"`
	R2        R2Config `json:"r2,omitempty" yaml:"r2,omitempty"`
}

type PermissionRule struct {
	Path        string   `json:"path" yaml:"path"`
	Permissions []string `json:"permissions" yaml:"permissions"`
}

type PermissionsConfig struct {
	Allow []PermissionRule `json:"allow" yaml:"allow"`
	Deny  []string         `json:"deny" yaml:"deny"`
}

type MCPServerConfig struct {
	Type      string            `json:"type,omitempty" yaml:"type,omitempty"`
	Command   string            `json:"command,omitempty" yaml:"command,omitempty"`
	Args      []string          `json:"args,omitempty" yaml:"args,omitempty"`
	ServerURL string            `json:"serverUrl,omitempty" yaml:"serverUrl,omitempty"`
	URL       string            `json:"url,omitempty" yaml:"url,omitempty"`
	Headers   map[string]string `json:"headers,omitempty" yaml:"headers,omitempty"`
	Disabled  bool              `json:"disabled" yaml:"disabled"`
}

var Cfg *Config
var ConfigOverridePath string

func Init() {
	Cfg = load()
	Cfg.applyDefaults()
}

func load() *Config {
	configPath := ResolveConfigPath()
	if configPath == "" {
		return &Config{Version: 1}
	}

	file, err := os.Open(configPath)
	if err != nil {
		return &Config{Version: 1}
	}
	defer file.Close()

	var cfg Config
	if strings.HasSuffix(configPath, ".yaml") || strings.HasSuffix(configPath, ".yml") {
		if err := yaml.NewDecoder(file).Decode(&cfg); err != nil {
			log.Printf("Warning: failed to decode yaml config: %v", err)
			return &Config{Version: 1}
		}
	} else {
		if err := json.NewDecoder(file).Decode(&cfg); err != nil {
			log.Printf("Warning: failed to decode json config: %v", err)
			return &Config{Version: 1}
		}
	}

	return &cfg
}

func ResolveConfigPath() string {
	if ConfigOverridePath != "" {
		return ConfigOverridePath
	}
	if envPath := os.Getenv("KENDALIAI_CONFIG"); envPath != "" {
		return envPath
	}

	homeDir, _ := os.UserHomeDir()

	searchPaths := []string{
		"./config.yaml",
		"./kendaliai.yaml",
		"./config.json",
	}
	if homeDir != "" {
		searchPaths = append(searchPaths, filepath.Join(homeDir, ".kendaliai", "config.yaml"))
		searchPaths = append(searchPaths, filepath.Join(homeDir, ".kendaliai", "config.json"))
	}
	searchPaths = append(searchPaths, "/etc/kendaliai/config.yaml")

	for _, path := range searchPaths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	return ""
}

func (c *Config) Save(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	var data []byte
	var err error
	if strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml") {
		data, err = yaml.Marshal(c)
	} else {
		data, err = json.MarshalIndent(c, "", "  ")
	}

	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}

func (c *Config) applyDefaults() {
	if c.Version == 0 {
		c.Version = 1
	}
	if c.Storage.Provider == "" {
		c.Storage.Provider = "local"
	}
	if c.Storage.LocalPath == "" {
		c.Storage.LocalPath = "./storage"
	}
	for i := range c.ChatProviders {
		if c.ChatProviders[i].Type == "" {
			c.ChatProviders[i].Type = "deepseek"
		}
		if c.ChatProviders[i].Model == "" {
			c.ChatProviders[i].Model = "deepseek-v4-flash"
		}
		if c.ChatProviders[i].Endpoint == "" {
			c.ChatProviders[i].Endpoint = "https://api.deepseek.com/v1"
		}
	}

	if c.Embedding.Model == "" {
		c.Embedding.Model = "text-embedding-3-small"
	}
	if c.Embedding.Endpoint == "" {
		c.Embedding.Endpoint = "https://api.openai.com/v1"
	}
	if c.Embedding.Dimensions <= 0 {
		c.Embedding.Dimensions = 1536
	}
	if !c.Embedding.Enabled {
		c.Embedding.Enabled = true
	}

	if c.MCPServers == nil {
		c.MCPServers = make(map[string]MCPServerConfig)
	}
	for k, srv := range c.MCPServers {
		if srv.ServerURL == "" && srv.URL != "" {
			srv.ServerURL = srv.URL
			c.MCPServers[k] = srv
		}
	}
}

func (c *Config) DefaultChatProvider() *ProviderConfig {
	if len(c.ChatProviders) == 0 {
		return nil
	}
	return &c.ChatProviders[0]
}
