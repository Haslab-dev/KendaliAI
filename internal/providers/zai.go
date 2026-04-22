package providers

import (
	"context"
	"fmt"

	"github.com/kendaliai/app/internal/agent"
	openai "github.com/sashabaranov/go-openai"
)

type ZAIProvider struct {
	client *openai.Client
	model  string
}

func NewZAIProvider(apiKey string, model string) *ZAIProvider {
	if model == "" {
		model = "zai-1" // Default model mapping for ZAI
	}

	config := openai.DefaultConfig(apiKey)
	// ZAI operates heavily on OpenAI-compatible configurations
	config.BaseURL = "https://api.z.ai/api/coding/paas/v4"

	return &ZAIProvider{
		client: openai.NewClientWithConfig(config),
		model:  model,
	}
}

func (p *ZAIProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	openAiMsgs := make([]openai.ChatCompletionMessage, len(msgs))
	for i, m := range msgs {
		openAiMsgs[i] = openai.ChatCompletionMessage{
			Role:    m.Role,
			Content: m.Content,
		}
	}

	req := openai.ChatCompletionRequest{
		Model:    p.model,
		Messages: openAiMsgs,
	}

	resp, err := p.client.CreateChatCompletion(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("ZAI Completion error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no choices returned by ZAI API")
	}

	return &agent.Response{
		Content:      resp.Choices[0].Message.Content,
		InputTokens:  resp.Usage.PromptTokens,
		OutputTokens: resp.Usage.CompletionTokens,
	}, nil
}
