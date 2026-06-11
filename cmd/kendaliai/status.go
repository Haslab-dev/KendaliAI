package main

import (
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show system status and configuration",
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

		fmt.Println("── Gateway ──")
		pidFile := resolvePIDFile()
		if isRunning(pidFile) {
			pid, _ := readPID(pidFile)
			fmt.Printf("  Status: running (PID: %d)\n", pid)
		} else {
			fmt.Println("  Status: stopped")
		}

		database, err := db.Initialize(cfg)
		if err == nil {
			rows, err := database.Query("SELECT name, provider, status FROM gateways")
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var name, provider, status string
					if err := rows.Scan(&name, &provider, &status); err == nil {
						fmt.Printf("  DB: %s / %s -> %s\n", name, provider, status)
					}
				}
			}
			database.Close()
		}
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
			mcpStatus := "enabled"
			if mcp.Disabled {
				mcpStatus = "disabled"
			}
			fmt.Printf("  - %s (%s)\n", name, mcpStatus)
		}
	},
}

func init() {
	rootCmd.AddCommand(statusCmd)
}
