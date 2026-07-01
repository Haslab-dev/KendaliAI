package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
)

type MockProvider struct{}

func (m *MockProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	return &agent.Response{Content: "Done"}, nil
}

func main() {
	fmt.Println("🚀 Starting Minimum Autonomous Kernel (MAK) CLI Restructuring Integration Test...")

	cwd, _ := os.Getwd()
	testYAML := filepath.Join(cwd, "config_test_mak.yaml")

	yamlContent := `version: 1
database:
  path: ./build/test_mak.db
defaultProvider: deepseek
chatProviders:
  - name: deepseek
    type: deepseek
    apiKey: deepseek-key
    model: deepseek-chat
`
	err := os.WriteFile(testYAML, []byte(yamlContent), 0644)
	if err != nil {
		fmt.Printf("❌ Failed to write test yaml config: %v\n", err)
		os.Exit(1)
	}
	defer os.Remove(testYAML)

	config.ConfigOverridePath = testYAML
	resolvedPath := config.ResolveConfigPath()
	if resolvedPath != testYAML {
		fmt.Printf("❌ Config Resolution error: resolved %s, expected %s\n", resolvedPath, testYAML)
		os.Exit(1)
	}
	fmt.Printf("✓ Config Auto-Discovery Priority check: Path resolved to override: %s\n", resolvedPath)

	config.Init()
	cfg := config.Cfg

	if cfg == nil || cfg.Version != 1 || cfg.Database.Path != "./build/test_mak.db" {
		fmt.Printf("❌ Config schema parsing error: version=%d, db=%s\n", cfg.Version, cfg.Database.Path)
		os.Exit(1)
	}
	fmt.Printf("✓ Config Schema Parsing check: Successfully parsed version=%d from YAML\n", cfg.Version)

	fmt.Println("🎉 Minimum Autonomous Kernel (MAK) CLI Restructuring Integration Test: PASS")
}
