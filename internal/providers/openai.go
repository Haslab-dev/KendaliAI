package providers

import (
	"context"
	"encoding/json"
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
	if endpoint != "" {
		cfg.BaseURL = endpoint
	}

	return &OpenAIProvider{
		client: openai.NewClientWithConfig(cfg),
		model:  model,
	}
}

func NewProviderFromConfig() *OpenAIProvider {
	c := config.Cfg
	if c == nil || len(c.ChatProviders) == 0 {
		return NewProvider("", "", "")
	}
	return NewProvider(c.ChatProviders[0].APIKey, c.ChatProviders[0].Model, c.ChatProviders[0].Endpoint)
}

func (p *OpenAIProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	return p.ChatCompletionWithTools(ctx, msgs, nil)
}

// ChatCompletionWithTools implements agent.ToolCallingProvider using the native
// OpenAI function-calling API. Tools may be nil for plain completions.
func (p *OpenAIProvider) ChatCompletionWithTools(ctx context.Context, msgs []agent.Message, tools []agent.ToolDefinition) (*agent.Response, error) {
	openAiMsgs := convertMessages(msgs)

	req := openai.ChatCompletionRequest{
		Model:    p.model,
		Messages: openAiMsgs,
		Tools:    convertTools(tools),
	}

	resp, err := p.client.CreateChatCompletion(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("chat completion error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("no choices returned")
	}

	choice := resp.Choices[0]
	return &agent.Response{
		Content:      choice.Message.Content,
		ToolCalls:    convertToolCalls(choice.Message.ToolCalls),
		FinishReason: string(choice.FinishReason),
		InputTokens:  resp.Usage.PromptTokens,
		OutputTokens: resp.Usage.CompletionTokens,
	}, nil
}

func convertMessages(msgs []agent.Message) []openai.ChatCompletionMessage {
	openAiMsgs := make([]openai.ChatCompletionMessage, 0, len(msgs))
	for _, m := range msgs {
		switch {
		case m.Role == "tool" && m.ToolCallID != "":
			// Native tool result answering a pending tool_calls request.
			openAiMsgs = append(openAiMsgs, openai.ChatCompletionMessage{
				Role:       "tool",
				Content:    m.Content,
				ToolCallID: m.ToolCallID,
			})
		case m.Role == "tool":
			// Legacy tool output from persisted history without a pending
			// native call — present it as plain user text.
			name := m.Name
			if name == "" {
				name = "tool"
			}
			openAiMsgs = append(openAiMsgs, openai.ChatCompletionMessage{
				Role:    "user",
				Content: fmt.Sprintf("tool_result(%s):\n%s", name, m.Content),
			})
		case m.Role == "assistant" && len(m.ToolCalls) > 0:
			msg := openai.ChatCompletionMessage{
				Role:    "assistant",
				Content: m.Content,
			}
			for _, tc := range m.ToolCalls {
				msg.ToolCalls = append(msg.ToolCalls, openai.ToolCall{
					ID:   tc.ID,
					Type: openai.ToolTypeFunction,
					Function: openai.FunctionCall{
						Name:      tc.Name,
						Arguments: tc.Arguments(),
					},
				})
			}
			openAiMsgs = append(openAiMsgs, msg)
		default:
			openAiMsgs = append(openAiMsgs, openai.ChatCompletionMessage{
				Role:    m.Role,
				Content: m.Content,
			})
		}
	}
	return openAiMsgs
}

func convertTools(tools []agent.ToolDefinition) []openai.Tool {
	if len(tools) == 0 {
		return nil
	}
	out := make([]openai.Tool, 0, len(tools))
	for _, t := range tools {
		params := t.Parameters
		if params == nil {
			params = map[string]interface{}{"type": "object"}
		}
		out = append(out, openai.Tool{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  params,
			},
		})
	}
	return out
}

func convertToolCalls(calls []openai.ToolCall) []agent.ToolCall {
	if len(calls) == 0 {
		return nil
	}
	out := make([]agent.ToolCall, 0, len(calls))
	for _, c := range calls {
		tc := agent.ToolCall{
			ID:       c.ID,
			Name:     c.Function.Name,
			ArgsJSON: c.Function.Arguments,
		}
		var args map[string]interface{}
		if err := json.Unmarshal([]byte(c.Function.Arguments), &args); err == nil {
			tc.Args = args
		}
		out = append(out, tc)
	}
	return out
}
