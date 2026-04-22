package main

import (
	"fmt"
	"os"
	"time"

	"github.com/kendaliai/app/internal/channels"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/server"
	"github.com/spf13/cobra"
)

var port string

var gatewayCmd = &cobra.Command{
	Use:   "gateway",
	Short: "Start the gateway server",
	Run: func(cmd *cobra.Command, args []string) {
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

		importServer := server.NewServer(database, cfg)

		// Start polling in background
		tm := channels.NewTelegramManager(database, cfg)
		activeChannels, _ := tm.LoadActiveChannels()
		for _, c := range activeChannels {
			go tm.StartPolling(c)
		}

		if err := importServer.Start(port); err != nil {
			fmt.Printf("Server failed: %v\n", err)
			os.Exit(1)
		}
	},
}

func init() {
	gatewayCmd.Flags().StringVarP(&port, "port", "p", "42617", "Gateway port")
	rootCmd.AddCommand(gatewayCmd)
}
