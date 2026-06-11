package main

import (
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/config"
	"github.com/spf13/cobra"
)

var setCmd = &cobra.Command{
	Use:   "set",
	Short: "Update configuration settings",
}

var setDefaultCmd = &cobra.Command{
	Use:   "default [provider-type]",
	Short: "Set the default chat provider",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		cfg := config.Cfg
		if cfg == nil {
			fmt.Println("❌ Config not loaded.")
			os.Exit(1)
		}

		target := args[0]

		found := false
		for _, p := range cfg.ChatProviders {
			if p.Type == target {
				found = true
				break
			}
		}

		if !found {
			fmt.Printf("❌ Provider '%s' not found in config.\n", target)
			fmt.Println("   Available providers:")
			for _, p := range cfg.ChatProviders {
				fmt.Printf("   - %s (%s)\n", p.Type, p.Model)
			}
			os.Exit(1)
		}

		cfg.DefaultProvider = target

		path := config.ResolveConfigPath()
		if err := cfg.Save(path); err != nil {
			fmt.Printf("❌ Failed to save config: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("✅ Default provider set to '%s'.\n", target)
		fmt.Printf("   Config saved to: %s\n", path)
	},
}

func init() {
	setCmd.AddCommand(setDefaultCmd)
	rootCmd.AddCommand(setCmd)
}
