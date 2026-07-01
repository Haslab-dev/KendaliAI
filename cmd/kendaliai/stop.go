package main

import (
	"fmt"
	"os"
	"syscall"

	"github.com/spf13/cobra"
)

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the running KendaliAI daemon",
	Run:   runStop,
}

func init() {
	rootCmd.AddCommand(stopCmd)
}

func runStop(cmd *cobra.Command, args []string) {
	pidFile := resolvePIDFile()
	data, err := os.ReadFile(pidFile)
	if err != nil {
		fmt.Println("❌ KendaliAI Gateway is not running (no PID file found).")
		return
	}

	var pid int
	_, err = fmt.Sscanf(string(data), "%d", &pid)
	if err != nil {
		fmt.Println("❌ Invalid PID file.")
		return
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		fmt.Printf("❌ Process PID %d not found.\n", pid)
		return
	}

	err = process.Signal(syscall.SIGTERM)
	if err != nil {
		fmt.Printf("❌ Failed to send stop signal to PID %d: %v\n", pid, err)
		return
	}

	_ = os.Remove(pidFile)
	fmt.Printf("✅ Successfully stopped KendaliAI Gateway (PID: %d)\n", pid)
}
