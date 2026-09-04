package gateway

import (
	"bufio"
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

type StreamCallbacks struct {
	OnThinking func(delta string)
	OnText     func(delta string)
}

type StreamResult struct {
	Content      string
	Thought      string
	InputTokens  int
	OutputTokens int
}

// StreamOpenAICompatible performs an SSE stream against an OpenAI-compatible /chat/completions API.
// It supports delta.reasoning_content, delta.thinking, delta.reasoning, and in-band <think>...</think> tags.
func StreamOpenAICompatible(
	ctx context.Context,
	endpoint string,
	apiKey string,
	model string,
	msgs []agent.Message,
	callbacks StreamCallbacks,
) (*StreamResult, error) {
	targetURL := resolveChatCompletionsURL(endpoint)

	type openAIMsg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}

	apiMsgs := make([]openAIMsg, len(msgs))
	for i, m := range msgs {
		apiMsgs[i] = openAIMsg{
			Role:    m.Role,
			Content: m.Content,
		}
	}

	reqPayload := map[string]interface{}{
		"model":    model,
		"messages": apiMsgs,
		"stream":   true,
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

	type sseDelta struct {
		Role             string `json:"role"`
		Content          string `json:"content"`
		ReasoningContent string `json:"reasoning_content"`
		Reasoning        string `json:"reasoning"`
		Thinking         string `json:"thinking"`
	}
	type sseChoice struct {
		Delta sseDelta `json:"delta"`
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
						delta := chunk.Choices[0].Delta

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

						// 2. Visible Content Delta & In-Band <think> Healing
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

	// Fallback count if usage was not returned by stream
	if outputTokens == 0 {
		outputTokens = (len(finalContent) + len(finalThought)) / 4
	}

	return &StreamResult{
		Content:      finalContent,
		Thought:      finalThought,
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
