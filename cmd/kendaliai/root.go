package main

import (
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/config"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var cfg *config.Config

var rootCmd = &cobra.Command{
	Use:     "kendaliai",
	Short:   "KendaliAI - Multi-Gateway AI Orchestration Platform",
	Version: "0.2.0",
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		config.Init()
		cfg = config.Cfg
	},
}

func init() {
	// Setup Viper for environment variables
	viper.AutomaticEnv()
	viper.SetEnvPrefix("KENDALIAI")
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}
