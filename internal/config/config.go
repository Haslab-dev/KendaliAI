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
	APIKey   string `json:"apiKey,omitempty" yaml:"apiKey,omitempty"`
	Endpoint string `json:"endpoint" yaml:"endpoint"`
	Model    string `json:"model" yaml:"model"`
}

type ChannelConfig struct {
	ID          string `json:"id" yaml:"id"`
	ChannelName string `json:"channelName" yaml:"channelName"`
	ChannelType string `json:"channelType" yaml:"channelType"`
	Token       string `json:"token" yaml:"token"`
}

type Config struct {
	Version         int                        `json:"version" yaml:"version"`
	Database        struct {
		Path string `json:"path" yaml:"path"`
	} `json:"database" yaml:"database"`
	DefaultProvider string                     `json:"defaultProvider" yaml:"defaultProvider"`
	ChatProviders   []ProviderConfig           `json:"chatProviders" yaml:"chatProviders"`
	Embedding       EmbeddingConfig            `json:"embedding" yaml:"embedding"`
	Channels        []ChannelConfig            `json:"channels" yaml:"channels"`
	MCPServers      map[string]MCPServerConfig `json:"mcpServers" yaml:"mcpServers"`
}

type MCPServerConfig struct {
	Command   string            `json:"command,omitempty" yaml:"command,omitempty"`
	Args      []string          `json:"args,omitempty" yaml:"args,omitempty"`
	ServerURL string            `json:"serverUrl,omitempty" yaml:"serverUrl,omitempty"`
	Headers   map[string]string `json:"headers,omitempty" yaml:"headers,omitempty"`
	Disabled  bool              `json:"disabled" yaml:"disabled"`
}

var Cfg *Config
var ConfigOverridePath string

func Init() {
	Cfg = load()
	Cfg.applyDefaults()
	log.Printf("Config loaded: version=%d, providers=%d, embedding=%s",
		Cfg.Version, len(Cfg.ChatProviders), Cfg.Embedding.Model,
	)
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
}

func (c *Config) DefaultChatProvider() *ProviderConfig {
	if len(c.ChatProviders) == 0 {
		return nil
	}
	return &c.ChatProviders[0]
}
