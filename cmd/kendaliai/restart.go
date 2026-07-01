package main

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"
)

var restartCmd = &cobra.Command{
	Use:   "restart",
	Short: "Restart the KendaliAI daemon",
	Run:   runRestart,
}

func init() {
	restartCmd.Flags().StringVarP(&configPath, "config", "c", "", "Path to configuration file")
	rootCmd.AddCommand(restartCmd)
}

func runRestart(cmd *cobra.Command, args []string) {
	fmt.Println("🔄 Restarting KendaliAI Gateway...")
	runStop(cmd, args)
	time.Sleep(1 * time.Second)
	daemonMode = true
	runStart(cmd, args)
}
