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

	database, err := db.Initialize(c)
	if err != nil {
		fmt.Printf("❌ DB init failed: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	pr := providers.NewProviderFromConfig()
	loop := agent.NewCognitionLoopWithDB(pr, 5, c, database)
	loop.OnTool = func(name, cat string, args map[string]interface{}) {
		fmt.Printf("  ⚙️  [%s] %s\n", cat, name)
	}

	fmt.Println("=== Test 1: Store a preference ===")
	res, _ := loop.Run(context.Background(), "Remember: I use Go for backend and Neovim as my editor")
	fmt.Printf("Agent: %s\n\n", trunc(res, 200))

	fmt.Println("=== Test 2: Natural question (no 'memory' keyword) ===")
	res, _ = loop.Run(context.Background(), "what editor do I use?")
	fmt.Printf("Agent: %s\n\n", trunc(res, 200))

	fmt.Println("=== Test 3: Natural question about language ===")
	res, _ = loop.Run(context.Background(), "what language should we use for the backend?")
	fmt.Printf("Agent: %s\n", trunc(res, 200))
}

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
