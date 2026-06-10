//go:build ignore

package main

import (
	"context"
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
	"github.com/kendaliai/app/internal/providers"
)

func main() {
	config.Init()
	c := config.Cfg

	if c.ChatProvider.APIKey == "" {
		fmt.Println("❌ No chat provider configured")
		os.Exit(1)
	}

	database, err := db.Initialize(c)
	if err != nil {
		fmt.Printf("❌ DB init failed: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	pr := providers.NewProviderFromConfig()
	loop := agent.NewCognitionLoopWithDB(pr, 10, c, database)

	loop.OnTool = func(name, cat string, args map[string]interface{}) {
		fmt.Printf("  ⚙️  [%s] %s %v\n", cat, name, args)
	}
	loop.OnResponse = func(content string) {
		if len(content) > 120 {
			content = content[:120] + "..."
		}
		fmt.Printf("  💭 %s\n", content)
	}

	fmt.Println("=== Test 1: Ask agent to store a memory ===")
	res, err := loop.Run(context.Background(), "Remember this: I prefer Go for backend development and my favorite editor is Neovim. Store this to memory.")
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Agent: %s\n\n", truncate(res, 300))

	fmt.Println("=== Test 2: Ask agent to recall memory ===")
	res, err = loop.Run(context.Background(), "What programming language and editor do I prefer? Search your memory.")
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Agent: %s\n", truncate(res, 300))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
