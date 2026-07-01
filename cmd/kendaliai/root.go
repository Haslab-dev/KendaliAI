package main

import (
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/config"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var cfg *config.Config
var configPath string

var rootCmd = &cobra.Command{
	Use:               "kendaliai",
	Short:             "KendaliAI - Multi-Gateway AI Orchestration Platform",
	Version:           version,
	CompletionOptions: cobra.CompletionOptions{DisableDefaultCmd: true},
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		if configPath != "" {
			config.ConfigOverridePath = configPath
		}
		config.Init()
		cfg = config.Cfg
	},
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&configPath, "config", "c", "", "Path to configuration file")
	viper.AutomaticEnv()
	viper.SetEnvPrefix("KENDALIAI")
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}
