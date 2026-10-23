package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/gateways"
	"github.com/kendaliai/app/internal/messaging"
	"github.com/kendaliai/app/internal/reflection"
	"github.com/kendaliai/app/internal/scheduler"
	"github.com/kendaliai/app/internal/server"
	"github.com/kendaliai/app/internal/skills"
	"github.com/kendaliai/app/internal/storage"
	"github.com/spf13/cobra"
)

var daemonMode bool
var listenPort string

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the KendaliAI gateway",
	Run:   runStart,
}

func init() {
	startCmd.Flags().BoolVarP(&daemonMode, "daemon", "d", false, "Start gateway in the background as a daemon")
	startCmd.Flags().StringVar(&listenPort, "port", "8080", "HTTP port for the gateway")
	rootCmd.AddCommand(startCmd)
}

func runStart(cmd *cobra.Command, args []string) {
	cfg := config.Cfg
	pidFile := resolvePIDFile()

	// Stop and clear any existing process holding the target port or recorded in the PID file.
	if stopAndClearPort(listenPort, pidFile) {
		fmt.Printf("🔄 Existing process detected on port %s. Stopped and cleared port.\n", listenPort)
	}

	if daemonMode {

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

	// Foreground start: setup log output
	logFile := resolveLogFile()
	_ = os.MkdirAll(filepath.Dir(logFile), 0755)
	logOut, logErr := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if logErr == nil {
		// Check if stdout is a terminal (interactive) vs redirected (daemon child)
		if fileInfo, _ := os.Stdout.Stat(); fileInfo != nil && (fileInfo.Mode()&os.ModeCharDevice) != 0 {
			// Interactive terminal: write to both stdout and log file
			mw := io.MultiWriter(os.Stdout, logOut)
			log.SetOutput(mw)
		} else {
			// Daemon child: stdout already points to log file, write to file only
			log.SetOutput(logOut)
		}
	}

	log.Println("🚀 Starting KendaliAI Gateway in foreground...")
	database, err := db.Initialize(cfg)
	if err != nil {
		log.Fatalf("❌ Database connection failed: %v", err)
	}
	defer database.Close()

	if err := storage.Init(cfg); err != nil {
		log.Printf("⚠️  Storage initialization failed (non-fatal): %v", err)
	}

	skills.Init()

	reflectionCfg := reflection.ReflectionConfig{
		Enabled:  true,
		Schedule: "0 0 * * *",
		Timezone: "Asia/Jakarta",
	}
	if cfg.Reflection.Timezone != "" {
		reflectionCfg.Timezone = cfg.Reflection.Timezone
	}
	if !cfg.Reflection.Enabled {
		reflectionCfg.Enabled = false
	}
	daemon := reflection.NewDaemon(database, reflectionCfg)
	go daemon.Start(context.Background())

	schedDaemon := scheduler.NewDaemon(messaging.DefaultBus)
	go schedDaemon.Start(context.Background())

	// 1. Auto-onboard gateway/channels database configurations
	gateways.HandleOnboard(database)

	srv := server.NewServer(database)
	_ = os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
	defer os.Remove(pidFile)

	// Bind with retries: under Air live-reload a dying predecessor can still
	// hold the port for a moment after stopAndClearPort ran. If the wildcard
	// bind keeps failing, something privileged (e.g. `tailscale serve`)
	// holds the port on a specific interface where lsof can't reach it —
	// fall back to a loopback-only bind so local dev still works.
	listenAddr := ":" + listenPort
	var bindErr error
	for attempt := 0; attempt < 12; attempt++ {
		bindErr = srv.StartAddr(listenAddr)
		if bindErr == nil || !strings.Contains(bindErr.Error(), "address already in use") {
			break
		}
		if attempt == 3 && listenAddr != "127.0.0.1:"+listenPort {
			log.Printf("⚠️  Port %s is held on a specific interface by a privileged process (likely `tailscale serve` — check `tailscale serve status`). Falling back to loopback-only bind.", listenPort)
			listenAddr = "127.0.0.1:" + listenPort
		}
		log.Printf("⚠️  Port %s still busy (attempt %d/12), clearing and retrying...", listenPort, attempt+1)
		stopAndClearPort(listenPort, pidFile)
		time.Sleep(500 * time.Millisecond)
	}
	if bindErr != nil {
		log.Fatalf("❌ Server error: %v", bindErr)
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
