package main

import (
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/config"
	"github.com/spf13/cobra"
)

var minimalFlag bool
var telegramFlag bool
var fullFlag bool

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage and validate configurations",
}

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Generate commented boilerplate config.yaml",
	Run:   runConfigInit,
}

var validateCmd = &cobra.Command{
	Use:   "validate",
	Short: "Validate syntax and schema constraints of config file",
	Run:   runConfigValidate,
}

var showCmd = &cobra.Command{
	Use:   "show",
	Short: "Print the currently active configuration",
	Run:   runConfigShow,
}

func init() {
	initCmd.Flags().BoolVar(&minimalFlag, "minimal", false, "Generate minimal config layout")
	initCmd.Flags().BoolVar(&telegramFlag, "telegram", false, "Generate telegram-configured layout")
	initCmd.Flags().BoolVar(&fullFlag, "full", false, "Generate complete configuration layout")

	configCmd.AddCommand(initCmd)
	configCmd.AddCommand(validateCmd)
	configCmd.AddCommand(showCmd)
	rootCmd.AddCommand(configCmd)
}

func runConfigInit(cmd *cobra.Command, args []string) {
	boilerplate := `version: 1

database:
  path: ./build/kendaliai.db

defaultProvider: openai-compatible

chatProviders:
  - name: openai-compatible
    type: openai
    apiKey: ${OPENAI_API_KEY}
    endpoint: https://api.openai.com/v1
    model: gpt-4o
  - name: deepseek
    type: deepseek
    apiKey: ${DEEPSEEK_API_KEY}
    model: deepseek-chat

embedding:
  apiKey: ${OPENAI_API_KEY}
  endpoint: https://api.openai.com/v1
  model: text-embedding-3-small

channels:
  - id: telegram-main
    channelName: telegram
    channelType: telegram
    token: ${TELEGRAM_TOKEN}
`

	targetPath := "./config.yaml"
	err := os.WriteFile(targetPath, []byte(boilerplate), 0644)
	if err != nil {
		fmt.Printf("❌ Failed to write config template: %v\n", err)
		return
	}
	fmt.Printf("✅ Generated boilerplate configuration file at: %s\n", targetPath)
}

func runConfigValidate(cmd *cobra.Command, args []string) {
	resolvedPath := config.ResolveConfigPath()
	if resolvedPath == "" {
		fmt.Println("❌ No configuration file resolved.")
		os.Exit(1)
	}

	fmt.Printf("🔍 Validating configuration file: %s...\n\n", resolvedPath)

	errorsCount := 0
	warningsCount := 0

	if cfg.Version != 1 {
		fmt.Printf("❌ Schema Version mismatch: expected 1, got %d\n", cfg.Version)
		errorsCount++
	} else {
		fmt.Println("✓ Schema version matches v1.")
	}

	if cfg.Database.Path == "" {
		fmt.Println("⚠️ Warning: database path is empty; using default in-memory db.")
		warningsCount++
	} else {
		fmt.Printf("✓ Database path set to: %s\n", cfg.Database.Path)
	}

	if len(cfg.ChatProviders) == 0 {
		fmt.Println("❌ No chat providers registered.")
		errorsCount++
	} else {
		fmt.Printf("✓ Registered Chat Providers count: %d\n", len(cfg.ChatProviders))
	}

	fmt.Println()
	if errorsCount > 0 {
		fmt.Printf("❌ Validation Failed. %d errors, %d warnings found.\n", errorsCount, warningsCount)
		os.Exit(1)
	} else {
		fmt.Printf("✓ Configuration matches standard specification. %d errors, %d warnings.\n", errorsCount, warningsCount)
	}
}

func runConfigShow(cmd *cobra.Command, args []string) {
	configPath := config.ResolveConfigPath()
	if configPath == "" {
		fmt.Println("❌ No active configuration resolved.")
		return
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		fmt.Printf("❌ Failed to read config file: %v\n", err)
		return
	}

	fmt.Printf("── Active Config File: %s ──\n\n", configPath)
	fmt.Println(string(data))
}
