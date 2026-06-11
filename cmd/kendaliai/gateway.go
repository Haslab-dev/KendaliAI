package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/kendaliai/app/internal/channels"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/server"
	"github.com/spf13/cobra"
)

var port string

var gatewayCmd = &cobra.Command{
	Use:   "gateway",
	Short: "Start the gateway server (foreground)",
	Run:   runGateway,
}

var gatewayRunCmd = &cobra.Command{
	Use:   "run",
	Short: "Start the gateway server in the background",
	Run: func(cmd *cobra.Command, args []string) {
		pidFile := resolvePIDFile()
		if isRunning(pidFile) {
			fmt.Println("❌ Gateway is already running.")
			fmt.Printf("   PID file: %s\n", pidFile)
			os.Exit(1)
		}

		exe, err := os.Executable()
		if err != nil {
			exe, _ = filepath.Abs(os.Args[0])
		}

		c := exec.Command(exe, "gateway")
		c.SysProcAttr = &syscall.SysProcAttr{
			Setsid: true,
		}

		logFile := resolveLogFile()
		out, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err == nil {
			c.Stdout = out
			c.Stderr = out
		}

		if err := c.Start(); err != nil {
			fmt.Printf("❌ Failed to start gateway: %v\n", err)
			os.Exit(1)
		}

		dir := filepath.Dir(pidFile)
		os.MkdirAll(dir, 0755)
		os.WriteFile(pidFile, []byte(strconv.Itoa(c.Process.Pid)), 0644)

		fmt.Printf("✅ Gateway started in background (PID: %d)\n", c.Process.Pid)
		fmt.Printf("   PID file: %s\n", pidFile)
		fmt.Printf("   Log file: %s\n", logFile)
		c.Process.Release()
	},
}

var gatewayStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the background gateway server",
	Run: func(cmd *cobra.Command, args []string) {
		pidFile := resolvePIDFile()
		pid, err := readPID(pidFile)
		if err != nil {
			fmt.Println("❌ Gateway is not running (no PID file).")
			os.Exit(1)
		}

		process, err := os.FindProcess(pid)
		if err != nil {
			fmt.Printf("❌ Cannot find process %d: %v\n", pid, err)
			os.Remove(pidFile)
			os.Exit(1)
		}

		if err := process.Signal(syscall.SIGTERM); err != nil {
			fmt.Printf("❌ Failed to stop gateway (PID: %d): %v\n", pid, err)
			os.Remove(pidFile)
			os.Exit(1)
		}

		os.Remove(pidFile)
		fmt.Printf("✅ Gateway stopped (PID: %d)\n", pid)
	},
}

func runGateway(cmd *cobra.Command, args []string) {
	database, err := db.Initialize(cfg)
	if err != nil {
		fmt.Printf("Failed to initialize db: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	var id, name, status string
	err = database.QueryRow("SELECT id, name, status FROM gateways LIMIT 1").Scan(&id, &name, &status)
	if err != nil {
		fmt.Println("⚠️  No gateway found. Run 'kendaliai onboard' first.")
		os.Exit(1)
	}

	fmt.Printf("🚀 Starting KendaliAI Gateway\nGateway Name: %s\nStatus: %s\n", name, status)

	database.Exec("UPDATE gateways SET status = 'running', updated_at = ? WHERE id = ?",
		time.Now().UnixMilli(), id)

	importServer := server.NewServer(database)

	tm := channels.NewTelegramManager(database)
	activeChannels, _ := tm.LoadActiveChannels()
	if len(activeChannels) == 0 {
		c := config.Cfg
		if len(c.Channels) > 0 {
			fmt.Print("\nℹ️  Channels configured but not in DB. Run 'kendaliai onboard' to bind.\n\n")
		} else {
			fmt.Print("\nℹ️  No channels configured. Running API-only mode.\n")
			fmt.Print("   To enable channels, add to config.json:\n\n")
			fmt.Print(`     "channels": [
       {
         "id": "telegram-main",
         "channelName": "My Bot",
         "channelType": "telegram",
         "token": "your-bot-token"
       }
     ]
`)
			fmt.Print("\n   Then run: kendaliai onboard && kendaliai gateway\n\n")
		}
	} else {
		for _, c := range activeChannels {
			go tm.StartPolling(c)
		}
	}

	if err := importServer.Start(port); err != nil {
		fmt.Printf("Server failed: %v\n", err)
		os.Exit(1)
	}
}

func resolvePIDFile() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	return filepath.Join(homeDir, ".kendaliai", "gateway.pid")
}

func resolveLogFile() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	return filepath.Join(homeDir, ".kendaliai", "gateway.log")
}

func isRunning(pidFile string) bool {
	pid, err := readPID(pidFile)
	if err != nil {
		return false
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return process.Signal(syscall.Signal(0)) == nil
}

func readPID(pidFile string) (int, error) {
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(string(data))
}

func init() {
	gatewayCmd.Flags().StringVarP(&port, "port", "p", "42617", "Gateway port")
	gatewayRunCmd.Flags().StringVarP(&port, "port", "p", "42617", "Gateway port")
	gatewayCmd.AddCommand(gatewayRunCmd)
	gatewayCmd.AddCommand(gatewayStopCmd)
	rootCmd.AddCommand(gatewayCmd)
}
