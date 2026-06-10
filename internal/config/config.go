package config

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
)

type ProviderConfig struct {
	Type     string `json:"type"`
	APIKey   string `json:"apiKey,omitempty"`
	Endpoint string `json:"endpoint"`
	Model    string `json:"model"`
}

type EmbeddingConfig struct {
	APIKey   string `json:"apiKey,omitempty"`
	Endpoint string `json:"endpoint"`
	Model    string `json:"model"`
}

type ChannelConfig struct {
	ID          string `json:"id"`
	ChannelName string `json:"channelName"`
	ChannelType string `json:"channelType"`
	Token       string `json:"token"`
}

type Config struct {
	Database struct {
		Path string `json:"path"`
	} `json:"database"`
	DefaultProvider string                     `json:"defaultProvider"`
	ChatProvider    ProviderConfig             `json:"chatProvider"`
	Embedding       EmbeddingConfig            `json:"embedding"`
	Channels        []ChannelConfig            `json:"channels"`
	MCPServers      map[string]MCPServerConfig `json:"mcpServers"`
}

type MCPServerConfig struct {
	Command   string            `json:"command,omitempty"`
	Args      []string          `json:"args,omitempty"`
	ServerURL string            `json:"serverUrl,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
	Disabled  bool              `json:"disabled"`
}

var Cfg *Config

func Init() {
	Cfg = load()
	Cfg.applyDefaults()
	log.Printf("Config loaded: chat=%s (%s), embedding=%s (%s)",
		Cfg.ChatProvider.Model, Cfg.ChatProvider.Endpoint,
		Cfg.Embedding.Model, Cfg.Embedding.Endpoint,
	)
}

func load() *Config {
	configPath := resolveConfigPath()
	if configPath == "" {
		return &Config{}
	}

	file, err := os.Open(configPath)
	if err != nil {
		return &Config{}
	}
	defer file.Close()

	var cfg Config
	if err := json.NewDecoder(file).Decode(&cfg); err != nil {
		return &Config{}
	}

	return &cfg
}

func resolveConfigPath() string {
	if envPath := os.Getenv("KENDALIAI_CONFIG"); envPath != "" {
		return envPath
	}

	localPath := filepath.Join(".", "config.json")
	if _, err := os.Stat(localPath); err == nil {
		return localPath
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(homeDir, ".kendaliai", "config.json")
}

func (c *Config) applyDefaults() {
	if c.ChatProvider.Type == "" {
		c.ChatProvider.Type = "deepseek"
	}
	if c.ChatProvider.Model == "" {
		c.ChatProvider.Model = "deepseek-v4-flash"
	}
	if c.ChatProvider.Endpoint == "" {
		c.ChatProvider.Endpoint = "https://api.deepseek.com/v1"
	}

	if c.Embedding.Model == "" {
		c.Embedding.Model = "text-embedding-3-small"
	}
	if c.Embedding.Endpoint == "" {
		c.Embedding.Endpoint = "https://api.openai.com/v1"
	}
}
