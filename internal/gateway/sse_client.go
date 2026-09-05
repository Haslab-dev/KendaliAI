package gateway

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/agent"
)

type StreamCallbacks struct {
	OnThinking func(delta string)
	OnText     func(delta string)
}

type StreamResult struct {
	Content      string
	Thought      string
	ToolCalls    []agent.ToolCall
	FinishReason string
	InputTokens  int
	OutputTokens int
}

type openaiToolCallPayload struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type openAIMsg struct {
	Role       string                  `json:"role"`
	Content    string                  `json:"content,omitempty"`
	ToolCallID string                  `json:"tool_call_id,omitempty"`
	ToolCalls  []openaiToolCallPayload `json:"tool_calls,omitempty"`
}

// serializeMessages converts agent messages into the OpenAI-compatible wire
// format. When native is true, assistant tool_calls and role "tool" results
// are serialized natively; when false (text-protocol fallback), those shapes
// degrade to plain user text, mirroring the legacy protocol. Legacy persisted
// "tool" messages without a pending call always degrade to user text.
func serializeMessages(msgs []agent.Message, native bool) []openAIMsg {
	apiMsgs := make([]openAIMsg, 0, len(msgs))
	for _, m := range msgs {
		switch {
		case m.Role == "tool" && native && m.ToolCallID != "":
			apiMsgs = append(apiMsgs, openAIMsg{
				Role:       "tool",
				Content:    m.Content,
				ToolCallID: m.ToolCallID,
			})
		case m.Role == "tool":
			name := m.Name
			if name == "" {
				name = "tool"
			}
			apiMsgs = append(apiMsgs, openAIMsg{
				Role:    "user",
				Content: fmt.Sprintf("tool_result(%s):\n%s", name, m.Content),
			})
		case m.Role == "assistant" && native && len(m.ToolCalls) > 0:
			msg := openAIMsg{Role: "assistant", Content: m.Content}
			for _, tc := range m.ToolCalls {
				msg.ToolCalls = append(msg.ToolCalls, openaiToolCallPayload{
					ID:   tc.ID,
					Type: "function",
					Function: struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					}{Name: tc.Name, Arguments: tc.Arguments()},
				})
			}
			apiMsgs = append(apiMsgs, msg)
		default:
			apiMsgs = append(apiMsgs, openAIMsg{Role: m.Role, Content: m.Content})
		}
	}
	return apiMsgs
}

// StreamOpenAICompatible performs an SSE stream against an OpenAI-compatible /chat/completions API.
// It supports delta.reasoning_content, delta.thinking, delta.reasoning, in-band <think>...</think> tags,
// and native streamed tool_calls (accumulated from argument fragments). Tools may be nil.
func StreamOpenAICompatible(
	ctx context.Context,
	endpoint string,
	apiKey string,
	model string,
	msgs []agent.Message,
	tools []agent.ToolDefinition,
	callbacks StreamCallbacks,
) (*StreamResult, error) {
	targetURL := resolveChatCompletionsURL(endpoint)

	reqPayload := map[string]interface{}{
		"model":    model,
		"messages": serializeMessages(msgs, len(tools) > 0),
		"stream":   true,
	}
	if len(tools) > 0 {
		reqPayload["tools"] = tools
	}

	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", targetURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	if apiKey != "" && apiKey != "dummy-key" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{
		Timeout: 4 * time.Minute,
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("streaming request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, string(errBody))
	}

	reader := bufio.NewReader(resp.Body)
	var accumulatedContent strings.Builder
	var accumulatedThought strings.Builder
	var inThinkingTag bool
	var inputTokens, outputTokens int
	var finishReason string

	// Streamed tool calls arrive as fragments indexed by position.
	type toolCallAccumulator struct {
		id   string
		name string
		args strings.Builder
	}
	accIndex := map[int]*toolCallAccumulator{}

	type sseDelta struct {
		Role             string `json:"role"`
		Content          string `json:"content"`
		ReasoningContent string `json:"reasoning_content"`
		Reasoning        string `json:"reasoning"`
		Thinking         string `json:"thinking"`
		ToolCalls        []struct {
			Index    *int   `json:"index"`
			ID       string `json:"id"`
			Type     string `json:"type"`
			Function struct {
				Name      string `json:"name"`
				Arguments string `json:"arguments"`
			} `json:"function"`
		} `json:"tool_calls"`
	}
	type sseChoice struct {
		Delta        sseDelta `json:"delta"`
		FinishReason *string  `json:"finish_reason"`
	}
	type sseChunk struct {
		Choices []sseChoice `json:"choices"`
		Usage   *struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}

	for {
		lineBytes, err := reader.ReadBytes('\n')
		if len(lineBytes) > 0 {
			line := strings.TrimSpace(string(lineBytes))
			if strings.HasPrefix(line, "data: ") {
				payload := strings.TrimPrefix(line, "data: ")
				if payload == "[DONE]" {
					break
				}

				var chunk sseChunk
				if err := json.Unmarshal([]byte(payload), &chunk); err == nil {
					if chunk.Usage != nil {
						inputTokens = chunk.Usage.PromptTokens
						outputTokens = chunk.Usage.CompletionTokens
					}

					if len(chunk.Choices) > 0 {
						choice := chunk.Choices[0]
						if choice.FinishReason != nil && *choice.FinishReason != "" {
							finishReason = *choice.FinishReason
						}
						delta := choice.Delta

						// 1. Structured Reasoning Delta (DeepSeek, OpenRouter, etc.)
						reasoningChunk := delta.ReasoningContent
						if reasoningChunk == "" {
							reasoningChunk = delta.Reasoning
						}
						if reasoningChunk == "" {
							reasoningChunk = delta.Thinking
						}

						if reasoningChunk != "" {
							accumulatedThought.WriteString(reasoningChunk)
							if callbacks.OnThinking != nil {
								callbacks.OnThinking(reasoningChunk)
							}
						}

						// 2. Native tool call fragments
						for _, tcd := range delta.ToolCalls {
							idx := 0
							if tcd.Index != nil {
								idx = *tcd.Index
							}
							acc, ok := accIndex[idx]
							if !ok {
								acc = &toolCallAccumulator{}
								accIndex[idx] = acc
							}
							if tcd.ID != "" {
								acc.id = tcd.ID
							}
							if tcd.Function.Name != "" {
								acc.name = tcd.Function.Name
							}
							acc.args.WriteString(tcd.Function.Arguments)
						}

						// 3. Visible Content Delta & In-Band <think> Healing
						if delta.Content != "" {
							text := delta.Content

							if !inThinkingTag && strings.Contains(text, "<think>") {
								parts := strings.SplitN(text, "<think>", 2)
								if len(parts[0]) > 0 {
									accumulatedContent.WriteString(parts[0])
									if callbacks.OnText != nil {
										callbacks.OnText(parts[0])
									}
								}
								inThinkingTag = true
								text = parts[1]
							}

							if inThinkingTag {
								if strings.Contains(text, "</think>") {
									parts := strings.SplitN(text, "</think>", 2)
									if len(parts[0]) > 0 {
										accumulatedThought.WriteString(parts[0])
										if callbacks.OnThinking != nil {
											callbacks.OnThinking(parts[0])
										}
									}
									inThinkingTag = false
									if len(parts[1]) > 0 {
										accumulatedContent.WriteString(parts[1])
										if callbacks.OnText != nil {
											callbacks.OnText(parts[1])
										}
									}
								} else {
									accumulatedThought.WriteString(text)
									if callbacks.OnThinking != nil {
										callbacks.OnThinking(text)
									}
								}
							} else {
								accumulatedContent.WriteString(text)
								if callbacks.OnText != nil {
									callbacks.OnText(text)
								}
							}
						}
					}
				}
			}
		}

		if err != nil {
			if err == io.EOF {
				break
			}
			break
		}
	}

	finalThought := strings.TrimSpace(accumulatedThought.String())
	finalContent := strings.TrimSpace(accumulatedContent.String())

	// Assemble accumulated tool call fragments in index order.
	var toolCalls []agent.ToolCall
	if len(accIndex) > 0 {
		indexes := make([]int, 0, len(accIndex))
		for idx := range accIndex {
			indexes = append(indexes, idx)
		}
		sort.Ints(indexes)
		for _, idx := range indexes {
			acc := accIndex[idx]
			raw := acc.args.String()
			if strings.TrimSpace(raw) == "" {
				raw = "{}"
			}
			tc := agent.ToolCall{
				ID:       acc.id,
				Name:     acc.name,
				ArgsJSON: raw,
			}
			var args map[string]interface{}
			if err := json.Unmarshal([]byte(raw), &args); err == nil {
				tc.Args = args
			}
			toolCalls = append(toolCalls, tc)
		}
	}

	// Fallback count if usage was not returned by stream
	if outputTokens == 0 {
		outputTokens = (len(finalContent) + len(finalThought)) / 4
	}

	return &StreamResult{
		Content:      finalContent,
		Thought:      finalThought,
		ToolCalls:    toolCalls,
		FinishReason: finishReason,
		InputTokens:  inputTokens,
		OutputTokens: outputTokens,
	}, nil
}

func resolveChatCompletionsURL(endpoint string) string {
	ep := strings.TrimRight(strings.TrimSpace(endpoint), "/")
	if ep == "" {
		return "https://api.openai.com/v1/chat/completions"
	}
	if strings.HasSuffix(ep, "/chat/completions") {
		return ep
	}
	if strings.HasSuffix(ep, "/v1") {
		return ep + "/chat/completions"
	}
	return ep + "/v1/chat/completions"
}
