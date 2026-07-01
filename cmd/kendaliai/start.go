package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/server"
	"github.com/spf13/cobra"
)

var daemonMode bool
var configPath string

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the KendaliAI gateway",
	Run:   runStart,
}

func init() {
	startCmd.Flags().BoolVarP(&daemonMode, "daemon", "d", false, "Start gateway in the background as a daemon")
	startCmd.Flags().StringVarP(&configPath, "config", "c", "", "Path to configuration file")
	rootCmd.AddCommand(startCmd)
}

func runStart(cmd *cobra.Command, args []string) {
	if configPath != "" {
		config.ConfigOverridePath = configPath
	}
	config.Init()
	cfg := config.Cfg

	pidFile := resolvePIDFile()

	if daemonMode {
		if isRunning(pidFile) {
			fmt.Println("❌ KendaliAI Gateway is already running.")
			os.Exit(1)
		}

		exe, err := os.Executable()
		if err != nil {
			exe, _ = filepath.Abs(os.Args[0])
		}

		var argsList []string
		argsList = append(argsList, "start")
		if configPath != "" {
			argsList = append(argsList, "--config", configPath)
		}

		c := exec.Command(exe, argsList...)
		c.SysProcAttr = &syscall.SysProcAttr{
			Setsid: true,
		}

		logFile := resolveLogFile()
		_ = os.MkdirAll(filepath.Dir(logFile), 0755)
		out, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err == nil {
			c.Stdout = out
			c.Stderr = out
		}

		if err := c.Start(); err != nil {
			fmt.Printf("❌ Failed to start gateway daemon: %v\n", err)
			os.Exit(1)
		}

		_ = os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", c.Process.Pid)), 0644)
		fmt.Printf("✅ KendaliAI Gateway started in background (PID: %d)\n", c.Process.Pid)
		return
	}

	fmt.Println("🚀 Starting KendaliAI Gateway in foreground...")
	database, err := db.Initialize(cfg)
	if err != nil {
		log.Fatalf("❌ Database connection failed: %v", err)
	}
	defer database.Close()

	srv := server.NewServer(cfg, database)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	_ = os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
	defer os.Remove(pidFile)

	if err := srv.Start(ctx); err != nil {
		log.Fatalf("❌ Server error: %v", err)
	}

	select {}
}

func resolvePIDFile() string {
	homeDir, _ := os.UserHomeDir()
	return filepath.Join(homeDir, ".kendaliai", "kendaliai.pid")
}

func resolveLogFile() string {
	homeDir, _ := os.UserHomeDir()
	return filepath.Join(homeDir, ".kendaliai", "kendaliai.log")
}

func isRunning(pidFile string) bool {
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return false
	}
	var pid int
	_, err = fmt.Sscanf(string(data), "%d", &pid)
	if err != nil {
		return false
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = process.Signal(syscall.Signal(0))
	return err == nil
}
