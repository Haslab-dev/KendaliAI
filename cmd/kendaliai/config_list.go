package main

import (
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/config"
	"github.com/spf13/cobra"
)

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List configuration details",
}

var listConfigCmd = &cobra.Command{
	Use:   "config",
	Short: "Print current configuration details",
	Run: func(cmd *cobra.Command, args []string) {
		cfg := config.Cfg
		if cfg == nil {
			fmt.Println("❌ Config not loaded.")
			os.Exit(1)
		}

		fmt.Println("── Configuration ──")
		fmt.Printf("  Config path: %s\n", config.ResolveConfigPath())
		fmt.Printf("  Database:    %s\n", cfg.Database.Path)
		fmt.Printf("  Default:     %s\n", cfg.DefaultProvider)
		fmt.Println()

		fmt.Println("── Chat Providers ──")
		if len(cfg.ChatProviders) == 0 {
			fmt.Println("  (none)")
		}
		for _, p := range cfg.ChatProviders {
			marker := " "
			if p.Type == cfg.DefaultProvider {
				marker = "*"
			}
			fmt.Printf("  %s %s | %s | %s\n", marker, p.Type, p.Model, p.Endpoint)
		}
		fmt.Println()

		fmt.Println("── Embedding ──")
		if cfg.Embedding.Endpoint == "" {
			fmt.Println("  (not configured)")
		} else {
			fmt.Printf("  Model:    %s\n", cfg.Embedding.Model)
			fmt.Printf("  Endpoint: %s\n", cfg.Embedding.Endpoint)
		}
		fmt.Println()

		fmt.Println("── Channels ──")
		if len(cfg.Channels) == 0 {
			fmt.Println("  (none)")
		}
		for _, ch := range cfg.Channels {
			fmt.Printf("  - %s (%s) [%s]\n", ch.ChannelName, ch.ID, ch.ChannelType)
		}
		fmt.Println()

		fmt.Println("── MCP Servers ──")
		if len(cfg.MCPServers) == 0 {
			fmt.Println("  (none)")
		}
		for name, mcp := range cfg.MCPServers {
			status := "enabled"
			if mcp.Disabled {
				status = "disabled"
			}
			fmt.Printf("  - %s (%s)\n", name, status)
		}
	},
}

func init() {
	listCmd.AddCommand(listConfigCmd)
	rootCmd.AddCommand(listCmd)
}
