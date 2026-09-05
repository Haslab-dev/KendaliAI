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

// anthropicContent is either a plain string or a []anthropicBlock, matching the
// two content shapes the Messages API accepts.
type anthropicContent interface{}

type anthropicBlock struct {
	Type string `json:"type"` // "text" | "tool_use" | "tool_result"
	// text block
	Text string `json:"text,omitempty"`
	// tool_use block
	ID    string                 `json:"id,omitempty"`
	Name  string                 `json:"name,omitempty"`
	Input map[string]interface{} `json:"input,omitempty"`
	// tool_result block
	ToolUseID string `json:"tool_use_id,omitempty"`
	Content   string `json:"content,omitempty"`
}

type anthropicMessage struct {
	Role    string           `json:"role"`
	Content anthropicContent `json:"content"`
}

type anthropicToolDef struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	InputSchema map[string]interface{} `json:"input_schema"`
}

type anthropicRequest struct {
	Model     string             `json:"model"`
	System    string             `json:"system,omitempty"`
	Messages  []anthropicMessage `json:"messages"`
	MaxTokens int                `json:"max_tokens"`
	Tools     []anthropicToolDef `json:"tools,omitempty"`
}

type anthropicResponse struct {
	Content []struct {
		Type  string                 `json:"type"`
		Text  string                 `json:"text"`
		ID    string                 `json:"id"`
		Name  string                 `json:"name"`
		Input map[string]interface{} `json:"input"`
	} `json:"content"`
	StopReason string `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

func (p *AnthropicProvider) ChatCompletion(ctx context.Context, msgs []agent.Message) (*agent.Response, error) {
	return p.ChatCompletionWithTools(ctx, msgs, nil)
}

// ChatCompletionWithTools implements agent.ToolCallingProvider using Anthropic
// tool_use content blocks. Tools may be nil for plain completions.
func (p *AnthropicProvider) ChatCompletionWithTools(ctx context.Context, msgs []agent.Message, tools []agent.ToolDefinition) (*agent.Response, error) {
	var systemParts []string
	var apiMsgs []anthropicMessage

	for _, m := range msgs {
		role := strings.ToLower(m.Role)
		if role == "system" {
			systemParts = append(systemParts, m.Content)
			continue
		}
		if role != "user" && role != "assistant" {
			role = "user"
		}

		switch {
		case role == "assistant" && len(m.ToolCalls) > 0:
			// Assistant request to call tools: optional text block + tool_use blocks.
			var blocks []anthropicBlock
			if strings.TrimSpace(m.Content) != "" {
				blocks = append(blocks, anthropicBlock{Type: "text", Text: m.Content})
			}
			for _, tc := range m.ToolCalls {
				input := tc.Args
				if input == nil {
					input = map[string]interface{}{}
				}
				blocks = append(blocks, anthropicBlock{
					Type:  "tool_use",
					ID:    tc.ID,
					Name:  tc.Name,
					Input: input,
				})
			}
			apiMsgs = append(apiMsgs, anthropicMessage{Role: role, Content: blocks})

		case m.Role == "tool" && m.ToolCallID != "":
			// Tool result answering a pending tool_use block.
			apiMsgs = append(apiMsgs, anthropicMessage{
				Role: "user",
				Content: []anthropicBlock{{
					Type:      "tool_result",
					ToolUseID: m.ToolCallID,
					Content:   m.Content,
				}},
			})

		case m.Role == "tool":
			// Legacy tool output from persisted history without a pending
			// native call — present it as plain user text.
			name := m.Name
			if name == "" {
				name = "tool"
			}
			apiMsgs = append(apiMsgs, anthropicMessage{
				Role:    "user",
				Content: fmt.Sprintf("tool_result(%s):\n%s", name, m.Content),
			})

		default:
			apiMsgs = append(apiMsgs, anthropicMessage{Role: role, Content: m.Content})
		}
	}

	reqBody := anthropicRequest{
		Model:     p.model,
		System:    strings.Join(systemParts, "\n"),
		Messages:  apiMsgs,
		MaxTokens: 4000,
		Tools:     convertAnthropicTools(tools),
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

	// Join text blocks and collect tool_use blocks.
	var content strings.Builder
	var toolCalls []agent.ToolCall
	for _, block := range response.Content {
		switch block.Type {
		case "tool_use":
			toolCalls = append(toolCalls, agent.ToolCall{
				ID:   block.ID,
				Name: block.Name,
				Args: block.Input,
			})
		default:
			content.WriteString(block.Text)
		}
	}
	if content.Len() == 0 && len(toolCalls) == 0 {
		return nil, fmt.Errorf("empty content returned from anthropic")
	}

	return &agent.Response{
		Content:      content.String(),
		ToolCalls:    toolCalls,
		FinishReason: response.StopReason,
		InputTokens:  response.Usage.InputTokens,
		OutputTokens: response.Usage.OutputTokens,
	}, nil
}

func convertAnthropicTools(tools []agent.ToolDefinition) []anthropicToolDef {
	if len(tools) == 0 {
		return nil
	}
	out := make([]anthropicToolDef, 0, len(tools))
	for _, t := range tools {
		schema := t.Parameters
		if schema == nil {
			schema = map[string]interface{}{"type": "object"}
		}
		out = append(out, anthropicToolDef{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: schema,
		})
	}
	return out
}
