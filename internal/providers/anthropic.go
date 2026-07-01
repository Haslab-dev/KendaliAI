package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/agent"
)

type AnthropicProvider struct {
	apiKey   string
	model    string
	endpoint string
	client   *http.Client
}

func NewAnthropicProvider(apiKey, model, endpoint string) *AnthropicProvider {
	if endpoint == "" {
		endpoint = "https://api.anthropic.com/v1/messages"
	}
	return &AnthropicProvider{
		apiKey:   apiKey,
		model:    model,
		endpoint: endpoint,
		client:   &http.Client{Timeout: 60 * time.Second},
	}
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicRequest struct {
	Model     string             `json:"model"`
	System    string             `json:"system,omitempty"`
	Messages  []anthropicMessage `json:"messages"`
	MaxTokens int                `json:"max_tokens"`
}

type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

func (p *AnthropicProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	var systemParts []string
	var apiMsgs []anthropicMessage

	for _, m := range msgs {
		role := strings.ToLower(m.Role)
		if role == "system" {
			systemParts = append(systemParts, m.Content)
		} else {
			// Anthropic only allows "user" and "assistant" messages
			if role != "user" && role != "assistant" {
				role = "user"
			}
			apiMsgs = append(apiMsgs, anthropicMessage{
				Role:    role,
				Content: m.Content,
			})
		}
	}

	reqBody := anthropicRequest{
		Model:     p.model,
		System:    strings.Join(systemParts, "\n"),
		Messages:  apiMsgs,
		MaxTokens: 4000,
	}

	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal anthropic request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.endpoint, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send anthropic request: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read anthropic response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errResp anthropicResponse
		if err := json.Unmarshal(bodyBytes, &errResp); err == nil && errResp.Error != nil {
			return nil, fmt.Errorf("anthropic error: %s: %s (status %d)", errResp.Error.Type, errResp.Error.Message, resp.StatusCode)
		}
		return nil, fmt.Errorf("anthropic request failed with status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var response anthropicResponse
	if err := json.Unmarshal(bodyBytes, &response); err != nil {
		return nil, fmt.Errorf("failed to unmarshal anthropic response: %w", err)
	}

	if len(response.Content) == 0 {
		return nil, fmt.Errorf("empty content returned from anthropic")
	}

	return &agent.Response{
		Content:      response.Content[0].Text,
		InputTokens:  response.Usage.InputTokens,
		OutputTokens: response.Usage.OutputTokens,
	}, nil
}
