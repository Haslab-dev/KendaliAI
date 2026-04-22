package providers

import (
	"context"
	"fmt"

	"github.com/kendaliai/app/internal/agent"
	openai "github.com/sashabaranov/go-openai"
)

type DeepSeekProvider struct {
	client *openai.Client
	model  string
}

func NewDeepSeekProvider(apiKey string, model string) *DeepSeekProvider {
	if model == "" {
		model = "deepseek-chat" // Default model mapping
	}

	config := openai.DefaultConfig(apiKey)
	// DeepSeek operates on an OpenAI-compatible API endpoint
	config.BaseURL = "https://api.deepseek.com/v1"

	return &DeepSeekProvider{
		client: openai.NewClientWithConfig(config),
		model:  model,
	}
}

func (p *DeepSeekProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	// Convert agent.Message to openai.ChatCompletionMessage
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
		return nil, fmt.Errorf("DeepSeek Completion error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no choices returned by DeepSeek API")
	}

	return &agent.Response{
		Content:      resp.Choices[0].Message.Content,
		InputTokens:  resp.Usage.PromptTokens,
		OutputTokens: resp.Usage.CompletionTokens,
	}, nil
}
