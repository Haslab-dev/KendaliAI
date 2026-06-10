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
		fmt.Printf("  ⚙️  [%s] %s %v\n", cat, name, args)
	}

	fmt.Println("=== Recall: force search_memory ===")
	res, err := loop.Run(context.Background(), "Use search_memory tool to find what programming language and editor I prefer. You MUST call search_memory before answering.")
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Agent: %s\n", truncate(res, 500))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
