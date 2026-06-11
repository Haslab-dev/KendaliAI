package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/config"
	"github.com/spf13/cobra"
)

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Interactive setup wizard — configure chat provider, embedding, and channels",
	Run: func(cmd *cobra.Command, args []string) {
		scanner := bufio.NewScanner(os.Stdin)
		cfg := config.Config{}

		fmt.Println("╔══════════════════════════════════════════╗")
		fmt.Println("║      KendaliAI Configuration Setup       ║")
		fmt.Println("╚══════════════════════════════════════════╝")
		fmt.Println()

		fmt.Println("── Chat Provider ──")
		cfg.ChatProvider.Type = prompt(scanner, "  Provider type", "deepseek")
		cfg.ChatProvider.Endpoint = prompt(scanner, "  Endpoint URL", "https://api.deepseek.com/v1")
		cfg.ChatProvider.Model = prompt(scanner, "  Model", "deepseek-v4-flash")
		cfg.ChatProvider.APIKey = prompt(scanner, "  API Key", "")

		fmt.Println()

		fmt.Println("── Embedding (optional, press Enter to skip) ──")
		fmt.Printf("\n  Endpoint URL [(skip)]: ")
		if scanner.Scan() && strings.TrimSpace(scanner.Text()) != "" {
			cfg.Embedding.Endpoint = strings.TrimSpace(scanner.Text())
			cfg.Embedding.Model = prompt(scanner, "  Model", "text-embedding-3-small")
			cfg.Embedding.APIKey = promptOptional(scanner, "  API Key", "")
		}
		fmt.Println()

		fmt.Println("── Channels (optional, press Enter to skip) ──")
		chName := promptOptional(scanner, "  Channel Name", "")
		for chName != "" {
			chType := prompt(scanner, "  Channel Type", "telegram")
			chToken := prompt(scanner, "  Token", "")
			chID := toChannelID(chName)

			cfg.Channels = append(cfg.Channels, config.ChannelConfig{
				ID:          chID,
				ChannelName: chName,
				ChannelType: chType,
				Token:       chToken,
			})
			fmt.Printf("\n  -> Added channel '%s' (id: %s)\n", chName, chID)

			chName = promptOptional(scanner, "  Add another? Enter name (press Enter to finish)", "")
		}

		cfg.DefaultProvider = cfg.ChatProvider.Type

		homeDir, err := os.UserHomeDir()
		if err != nil {
			homeDir = "."
		}
		cfg.Database.Path = filepath.Join(homeDir, ".kendaliai", "kendaliai.db")

		configPath := resolveSetupPath()
		dir := filepath.Dir(configPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			fmt.Printf("Error creating config directory: %v\n", err)
			os.Exit(1)
		}

		data, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			fmt.Printf("Error marshaling config: %v\n", err)
			os.Exit(1)
		}

		if err := os.WriteFile(configPath, data, 0600); err != nil {
			fmt.Printf("Error writing config: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("\nConfiguration saved to: %s\n", configPath)
		fmt.Println("Run 'kendaliai onboard' to initialize the database.")
	},
}

func prompt(scanner *bufio.Scanner, label, defaultVal string) string {
	fmt.Printf("\n%s [%s]: ", label, defaultVal)
	if scanner.Scan() {
		input := strings.TrimSpace(scanner.Text())
		if input != "" {
			return input
		}
	}
	return defaultVal
}

func promptOptional(scanner *bufio.Scanner, label, defaultVal string) string {
	defaultDisplay := defaultVal
	if defaultVal == "" {
		defaultDisplay = "(skip)"
	}
	fmt.Printf("\n%s [%s]: ", label, defaultDisplay)
	if scanner.Scan() {
		input := strings.TrimSpace(scanner.Text())
		if input != "" {
			return input
		}
	}
	return defaultVal
}

func toChannelID(name string) string {
	id := strings.ToLower(name)
	id = strings.ReplaceAll(id, " ", "-")
	return id
}

func resolveSetupPath() string {
	if envPath := os.Getenv("KENDALIAI_CONFIG"); envPath != "" {
		return envPath
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".", "config.json")
	}
	return filepath.Join(homeDir, ".kendaliai", "config.json")
}

func init() {
	rootCmd.AddCommand(setupCmd)
}
