package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/gateways"
	"github.com/kendaliai/app/internal/server"
	"github.com/kendaliai/app/internal/skills"
	"github.com/kendaliai/app/internal/storage"
	"github.com/spf13/cobra"
)

var devCmd = &cobra.Command{
	Use:   "dev",
	Short: "Start KendaliAI in full-stack development mode (Backend :8080 + Vite :5173)",
	Run:   runDev,
}

func init() {
	rootCmd.AddCommand(devCmd)
}

func runDev(cmd *cobra.Command, args []string) {
	fmt.Println("🚀 Starting KendaliAI Full-Stack Development Mode...")

	pidFile := resolvePIDFile()

	// 1. Clear ports 8080 and 5173 if currently occupied
	if stopAndClearPort("8080", pidFile) {
		fmt.Println("🔄 Cleared existing process on port 8080.")
	}
	if stopAndClearPort("5173", "") {
		fmt.Println("🔄 Cleared existing process on port 5173.")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Setup signal handling for clean exit
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	cwd, _ := os.Getwd()
	uiDir := filepath.Join(cwd, "ui")

	// 2. Start Vite Dev Server in background
	pm := "bun"
	if _, err := exec.LookPath("bun"); err != nil {
		pm = "npm"
	}

	fmt.Printf("📦 Launching Vite frontend dev server with %s in %s...\n", pm, uiDir)
	var viteCmd *exec.Cmd
	if pm == "bun" {
		viteCmd = exec.CommandContext(ctx, "bun", "run", "dev")
	} else {
		viteCmd = exec.CommandContext(ctx, "npm", "run", "dev")
	}
	viteCmd.Dir = uiDir
	viteCmd.Stdout = os.Stdout
	viteCmd.Stderr = os.Stderr
	if err := viteCmd.Start(); err != nil {
		log.Printf("⚠️ Could not start Vite dev server automatically: %v (You can run 'cd ui && bun dev' manually)", err)
	}

	// 3. Start Backend with Air if available, otherwise direct in-process server
	airPath, err := exec.LookPath("air")
	if err != nil {
		home, _ := os.UserHomeDir()
		fallback := filepath.Join(home, "go", "bin", "air")
		if _, statErr := os.Stat(fallback); statErr == nil {
			airPath = fallback
		}
	}

	var airCmd *exec.Cmd
	if airPath != "" {
		fmt.Printf("🔥 Launching Go backend with Air live-reloading (%s)...\n", airPath)
		airCmd = exec.CommandContext(ctx, airPath)
		airCmd.Dir = cwd
		airCmd.Stdout = os.Stdout
		airCmd.Stderr = os.Stderr
		if err := airCmd.Start(); err != nil {
			log.Printf("⚠️ Could not start air: %v, falling back to direct server...", err)
			airCmd = nil
		}
	}

	if airCmd == nil {
		cfg := config.Cfg
		database, err := db.Initialize(cfg)
		if err != nil {
			log.Fatalf("❌ Database connection failed: %v", err)
		}
		defer database.Close()

		if err := storage.Init(cfg); err != nil {
			log.Printf("⚠️ Storage initialization: %v", err)
		}
		skills.Init()
		gateways.HandleOnboard(database)

		srv := server.NewServer(database)
		_ = os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
		defer os.Remove(pidFile)

		go func() {
			if err := srv.Start("8080"); err != nil {
				log.Printf("Backend server: %v", err)
			}
		}()
	}

	fmt.Println("\n✨ KendaliAI Dev Environment Ready!")
	fmt.Println("   • Backend Gateway:  http://localhost:8080 (Air live-reloading)")
	fmt.Println("   • Frontend WebUI:   http://localhost:5173 (Vite Hot-Reloading)")
	fmt.Println("   • Press Ctrl+C to terminate all servers cleanly.")

	// Wait for interrupt
	<-sigChan
	fmt.Println("\n🛑 Stopping Dev Environment...")
	cancel()
	if airCmd != nil && airCmd.Process != nil {
		_ = airCmd.Process.Kill()
	}
	if viteCmd != nil && viteCmd.Process != nil {
		_ = viteCmd.Process.Kill()
	}
	stopAndClearPort("8080", pidFile)
	stopAndClearPort("5173", "")
	fmt.Println("✅ Dev environment stopped. Ports 8080 and 5173 released.")
}
