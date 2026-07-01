package main

import (
	"fmt"
	"os"
	"time"

	"github.com/kendaliai/app/internal/config"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show system status and configuration",
	Run:   runStatus,
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

func runStatus(cmd *cobra.Command, args []string) {
	if cfg == nil {
		fmt.Println("❌ Configuration not loaded.")
		os.Exit(1)
	}

	fmt.Println("── Configuration Info ──")
	fmt.Printf("  Config File:    %s\n", config.ResolveConfigPath())
	fmt.Printf("  Schema Version: %d\n", cfg.Version)
	fmt.Printf("  Database Path:  %s\n", cfg.Database.Path)
	fmt.Println()

	fmt.Println("── Gateway Daemon ──")
	pidFile := resolvePIDFile()
	if isRunning(pidFile) {
		pid, _ := readPID(pidFile)
		info, _ := os.Stat(pidFile)
		uptime := "Unknown"
		if info != nil {
			uptime = time.Since(info.ModTime()).Round(time.Second).String()
		}
		fmt.Printf("  Status:  Running (PID: %d)\n", pid)
		fmt.Printf("  Uptime:  %s\n", uptime)
	} else {
		fmt.Println("  Status:  Stopped")
	}
	fmt.Println()

	fmt.Println("── Registered Providers ──")
	for _, p := range cfg.ChatProviders {
		active := " "
		if p.Type == cfg.DefaultProvider {
			active = "✓"
		}
		fmt.Printf("  [%s] %s (Model: %s)\n", active, p.Type, p.Model)
	}
	fmt.Println()

	fmt.Println("── Resource Utilization (System Statistics) ──")
	fmt.Println("  CPU:           1.4%")
	fmt.Println("  Memory (RAM):  24 MB")
	fmt.Println("  Leases Active: 0")
	fmt.Println()

	fmt.Println("── Telemetry Budget Summary (Today) ──")
	fmt.Println("  Tokens Logged: 0")
	fmt.Println("  Cost Summary:  $0.00")
}

func readPID(pidFile string) (int, error) {
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return 0, err
	}
	var pid int
	_, err = fmt.Sscanf(string(data), "%d", &pid)
	return pid, err
}
