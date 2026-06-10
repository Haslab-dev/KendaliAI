package providers

import (
	"context"
	"fmt"

	"github.com/kendaliai/app/internal/agent"
	"github.com/kendaliai/app/internal/config"
	openai "github.com/sashabaranov/go-openai"
)

type OpenAIProvider struct {
	client *openai.Client
	model  string
}

func NewProvider(apiKey, model, endpoint string) *OpenAIProvider {
	cfg := openai.DefaultConfig(apiKey)
	cfg.BaseURL = endpoint

	return &OpenAIProvider{
		client: openai.NewClientWithConfig(cfg),
		model:  model,
	}
}

func NewProviderFromConfig() *OpenAIProvider {
	c := config.Cfg
	return NewProvider(c.ChatProvider.APIKey, c.ChatProvider.Model, c.ChatProvider.Endpoint)
}

func (p *OpenAIProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	openAiMsgs := make([]openai.ChatCompletionMessage, len(msgs))
	for i, m := range msgs {
		openAiMsgs[i] = openai.ChatCompletionMessage{
			Role:    m.Role,
			Content: m.Content,
		}
	}

	resp, err := p.client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model:    p.model,
		Messages: openAiMsgs,
	})
	if err != nil {
		return nil, fmt.Errorf("chat completion error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no choices returned")
	}

	return &agent.Response{
		Content:      resp.Choices[0].Message.Content,
		InputTokens:  resp.Usage.PromptTokens,
		OutputTokens: resp.Usage.CompletionTokens,
	}, nil
}
