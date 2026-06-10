package main

import (
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/gateways"
	"github.com/spf13/cobra"
)

var onboardCmd = &cobra.Command{
	Use:   "onboard",
	Short: "Quick setup wizard — reads from config.json",
	Run: func(cmd *cobra.Command, args []string) {
		database, err := db.Initialize(cfg)
		if err != nil {
			fmt.Printf("Failed to initialize db: %v\n", err)
			os.Exit(1)
		}
		defer database.Close()

		gateways.HandleOnboard(database)
	},
}

func init() {
	rootCmd.AddCommand(onboardCmd)
}
