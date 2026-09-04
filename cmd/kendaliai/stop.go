package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the running KendaliAI daemon and clear port 8080",
	Run:   runStop,
}

func init() {
	rootCmd.AddCommand(stopCmd)
}

func runStop(cmd *cobra.Command, args []string) {
	pidFile := resolvePIDFile()
	fmt.Println("🛑 Stopping KendaliAI Gateway...")
	stopped := stopAndClearPort("8080", pidFile)
	if stopped {
		fmt.Println("✅ Successfully stopped KendaliAI Gateway and cleared port 8080.")
	} else {
		fmt.Println("ℹ️ KendaliAI is not running (port 8080 is already free).")
	}
}
