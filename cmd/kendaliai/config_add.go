package main

import (
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/config"
	"github.com/spf13/cobra"
)

var addCmd = &cobra.Command{
	Use:   "add",
	Short: "Add a provider or channel to config.json",
}

var addProviderCmd = &cobra.Command{
	Use:   "provider",
	Short: "Add a new chat provider to config.json",
	Run: func(cmd *cobra.Command, args []string) {
		cfg := config.Cfg
		if cfg == nil {
			fmt.Println("❌ Config not loaded.")
			os.Exit(1)
		}

		scanner := scanner()
		fmt.Println("── Add Chat Provider ──")
		p := config.ProviderConfig{
			Type:     prompt(scanner, "  Provider type", "deepseek"),
			Endpoint: prompt(scanner, "  Endpoint URL", "https://api.deepseek.com/v1"),
			Model:    prompt(scanner, "  Model", "deepseek-v4-flash"),
			APIKey:   prompt(scanner, "  API Key", ""),
		}
		fmt.Println()

		cfg.ChatProviders = append(cfg.ChatProviders, p)

		path := config.ResolveConfigPath()
		if err := cfg.Save(path); err != nil {
			fmt.Printf("❌ Failed to save config: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("✅ Provider '%s' added.\n", p.Type)
		fmt.Printf("   Config saved to: %s\n", path)
	},
}

var addChannelCmd = &cobra.Command{
	Use:   "channel",
	Short: "Add a new channel to config.json",
	Run: func(cmd *cobra.Command, args []string) {
		cfg := config.Cfg
		if cfg == nil {
			fmt.Println("❌ Config not loaded.")
			os.Exit(1)
		}

		scanner := scanner()
		fmt.Println("── Add Channel ──")
		chName := prompt(scanner, "  Channel Name", "")
		if chName == "" {
			fmt.Println("❌ Channel name is required.")
			os.Exit(1)
		}
		ch := config.ChannelConfig{
			ID:          toChannelID(chName),
			ChannelName: chName,
			ChannelType: prompt(scanner, "  Channel Type", "telegram"),
			Token:       prompt(scanner, "  Token", ""),
		}
		fmt.Println()

		cfg.Channels = append(cfg.Channels, ch)

		path := config.ResolveConfigPath()
		if err := cfg.Save(path); err != nil {
			fmt.Printf("❌ Failed to save config: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("✅ Channel '%s' (id: %s) added.\n", ch.ChannelName, ch.ID)
		fmt.Printf("   Config saved to: %s\n", path)
	},
}

func init() {
	addCmd.AddCommand(addProviderCmd)
	addCmd.AddCommand(addChannelCmd)
	rootCmd.AddCommand(addCmd)
}
