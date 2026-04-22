package main

import (
	"context"
	"fmt"
	"os"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/providers"
)

func main() {
	d := os.Getenv("DEEPSEEK_API_KEY")
	pr := providers.NewDeepSeekProvider(d, "deepseek-chat")
	loop := agent.NewCognitionLoop(pr, 1, nil)
	
	res, err := loop.Run(context.Background(), "what is the weather in tokyo?")
	if err != nil {
		fmt.Println("ERROR:", err)
		return
	}
	fmt.Println("SUCCESS:", res)
}
