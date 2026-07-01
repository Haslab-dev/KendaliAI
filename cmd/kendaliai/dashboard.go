package main

import (
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/tui"
	"github.com/spf13/cobra"
)

var dashboardCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Launch Terminal User Interface (Dashboard)",
	Run: func(cmd *cobra.Command, args []string) {
		database, err := db.Initialize(cfg)
		if err != nil {
			fmt.Printf("Failed to initialize db: %v\n", err)
			os.Exit(1)
		}
		defer database.Close()

		if err := tui.StartDynamicTUI(database); err != nil {
			fmt.Printf("TUI Error: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	rootCmd.AddCommand(dashboardCmd)
}
