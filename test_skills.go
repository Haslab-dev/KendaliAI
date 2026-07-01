package main

import (
	"context"
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/embedding"
	"github.com/kendaliai/app/internal/skills"
)

func main() {
	config.Init()
	fmt.Printf("Embedding config: apiKey=%s... endpoint=%s model=%s\n",
		config.Cfg.Embedding.APIKey[:10], config.Cfg.Embedding.Endpoint, config.Cfg.Embedding.Model)

	client := embedding.NewClient()
	fmt.Printf("Client created: model=%v\n", client)

	vecs, err := client.Embed(context.Background(), []string{"test message"})
	if err != nil {
		fmt.Printf("❌ Embed failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✅ Embed succeeded: %d vectors, len=%d\n", len(vecs), len(vecs[0]))

	skills.Init()
	fmt.Printf("Skills manager: %v\n", skills.DefaultManager)

	specs, err := skills.DefaultManager.List()
	fmt.Printf("Listed %d skills, err=%v\n", len(specs), err)

	for _, s := range specs {
		fmt.Printf("  - %s [%s] keywords=%v\n", s.Name, s.ID, s.Routing.Keywords)
	}

	matched, score, err := skills.DefaultRouter.Match(context.Background(), "Gunakan skill Project Manager, add task Mancing di Kali")
	fmt.Printf("Router match: spec=%v score=%.2f err=%v\n", matched, score, err)
	if matched != nil {
		fmt.Printf("Matched skill: %s\n", matched.Name)
	}
}
