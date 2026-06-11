package main

import (
	"context"
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/spf13/cobra"
)

var testEmbedCmd = &cobra.Command{
	Use:   "test-embed",
	Short: "Test embedding: store texts and search",
	Run: func(cmd *cobra.Command, args []string) {
		ctx := context.Background()
		c := config.Cfg

		if c.Embedding.APIKey == "" {
			fmt.Println("❌ No embedding apiKey in config.json")
			os.Exit(1)
		}

		database, err := db.Initialize(c)
		if err != nil {
			fmt.Printf("❌ DB init failed: %v\n", err)
			os.Exit(1)
		}
		defer database.Close()

		client := embedding.NewClient()
		store := embedding.NewStore(database, client)

		fmt.Println("📡 Testing embedding API connection...")
		vec, err := client.EmbedOne(ctx, "hello world")
		if err != nil {
			fmt.Printf("❌ Embedding API failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("✅ API connected. Model: %s, Dimensions: %d\n", c.Embedding.Model, len(vec))

		fmt.Print("\n📝 Storing test memories...\n")
		testTexts := []struct {
			content   string
			source    string
		}{
			{"KendaliAI is an autonomous AI coding agent written in Go", "test"},
			{"The cognition loop uses recursive tool invocation to navigate files", "test"},
			{"Telegram channels are configured in config.json as an array", "test"},
			{"Embeddings use OpenAI-compatible APIs with cosine similarity search", "test"},
			{"The database is SQLite with WAL mode for concurrent access", "test"},
			{"Go is a statically typed compiled language designed at Google", "test"},
			{"DeepSeek v4 flash is a fast and cheap model for coding tasks", "test"},
			{"BubbleTea is a terminal UI framework for Go applications", "test"},
		}

		for _, t := range testTexts {
			id, err := store.Store(ctx, t.content, t.source, 0.5)
			if err != nil {
				fmt.Printf("   ❌ Failed: %v\n", err)
				continue
			}
			fmt.Printf("   ✅ Stored [%s]: %s\n", id, truncate(t.content, 60))
		}

		fmt.Print("\n🔍 Testing similarity search...\n\n")
		queries := []string{
			"what programming language is KendaliAI built with?",
			"how does the AI agent work?",
			"what database does it use?",
		}

		for _, q := range queries {
			fmt.Printf("Query: \"%s\"\n", q)
			results, err := store.Search(ctx, q, 3)
			if err != nil {
				fmt.Printf("   ❌ Search failed: %v\n", err)
				continue
			}
			for i, r := range results {
				fmt.Printf("   %d. [%.4f] %s\n", i+1, r.Score, r.Content)
			}
			fmt.Println()
		}

		fmt.Println("✅ Embedding pipeline working!")
	},
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func init() {
	rootCmd.AddCommand(testEmbedCmd)
}
