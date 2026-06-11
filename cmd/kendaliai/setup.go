package main

import (
	"bufio"
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

		fmt.Println("── Chat Providers ──")
		fmt.Println("  (Add at least one provider)")
		provType := prompt(scanner, "  Provider type", "deepseek")
		for provType != "" {
			provEndpoint := prompt(scanner, "  Endpoint URL", "https://api.deepseek.com/v1")
			provModel := prompt(scanner, "  Model", "deepseek-v4-flash")
			provAPIKey := prompt(scanner, "  API Key", "")

			cfg.ChatProviders = append(cfg.ChatProviders, config.ProviderConfig{
				Type:     provType,
				Endpoint: provEndpoint,
				Model:    provModel,
				APIKey:   provAPIKey,
			})
			fmt.Printf("\n  -> Added provider '%s' (%s)\n", provType, provModel)

			provType = promptOptional(scanner, "  Add another? Enter type (press Enter to finish)", "")
		}

		if len(cfg.ChatProviders) == 0 {
			fmt.Println("❌ At least one chat provider is required.")
			os.Exit(1)
		}
		cfg.DefaultProvider = cfg.ChatProviders[0].Type

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

		homeDir, err := os.UserHomeDir()
		if err != nil {
			homeDir = "."
		}
		cfg.Database.Path = filepath.Join(homeDir, ".kendaliai", "kendaliai.db")

		configPath := config.ResolveConfigPath()
		if err := cfg.Save(configPath); err != nil {
			fmt.Printf("Error saving config: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("\nConfiguration saved to: %s\n", configPath)
		fmt.Println("Run 'kendaliai onboard' to initialize the database.")
	},
}

func scanner() *bufio.Scanner {
	return bufio.NewScanner(os.Stdin)
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

func init() {
	rootCmd.AddCommand(setupCmd)
}
