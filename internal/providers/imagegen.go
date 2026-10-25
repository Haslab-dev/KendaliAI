package providers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ProviderImageConfig is the subset of a stored provider a generation call
// needs. Kept local to avoid importing the gateway package (cycle).
type ProviderImageConfig struct {
	Type     string
	Endpoint string
	APIKey   string
}

// ImageRequest describes a text-to-image generation.
type ImageRequest struct {
	Prompt  string
	Model   string
	Size    string
	Quality string
	N       int
}

// ImageResult is the generated image plus provider metadata.
type ImageResult struct {
	Data          []byte
	Mime          string
	RevisedPrompt string
}

// GenerateImage dispatches to the OpenAI-compatible /images/generations API or
// the native Gemini generateContent image modality.
func GenerateImage(ctx context.Context, cfg ProviderImageConfig, req ImageRequest) (*ImageResult, error) {
	if strings.TrimSpace(req.Prompt) == "" {
		return nil, fmt.Errorf("image prompt is required")
	}
	if req.N <= 0 {
		req.N = 1
	}
	providerType := strings.ToLower(strings.TrimSpace(cfg.Type))
	if providerType == "gemini" || providerType == "google" || strings.Contains(strings.ToLower(cfg.Endpoint), "generativelanguage.googleapis.com") {
		return generateGeminiImage(ctx, cfg, req)
	}
	return generateOpenAIImage(ctx, cfg, req)
}

func resolveImagesURL(endpoint string) string {
	ep := strings.TrimRight(strings.TrimSpace(endpoint), "/")
	if ep == "" {
		return "https://api.openai.com/v1/images/generations"
	}
	if strings.HasSuffix(ep, "/images/generations") {
		return ep
	}
	ep = strings.TrimSuffix(ep, "/chat/completions")
	if strings.HasSuffix(ep, "/v1") {
		return ep + "/images/generations"
	}
	return ep + "/v1/images/generations"
}

func generateOpenAIImage(ctx context.Context, cfg ProviderImageConfig, req ImageRequest) (*ImageResult, error) {
	payload := map[string]interface{}{
		"model":  req.Model,
		"prompt": req.Prompt,
		"n":      req.N,
	}
	if strings.TrimSpace(req.Size) != "" {
		payload["size"] = req.Size
	}
	if strings.TrimSpace(req.Quality) != "" {
		payload["quality"] = req.Quality
	}
	// gpt-image-* returns b64 by default; older models need to be asked.
	if !strings.HasPrefix(strings.ToLower(req.Model), "gpt-image") {
		payload["response_format"] = "b64_json"
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, resolveImagesURL(cfg.Endpoint), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if cfg.APIKey != "" && cfg.APIKey != "dummy-key" {
		httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}

	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("image request failed: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("image API error (%d): %s", resp.StatusCode, truncateForError(string(respBody), 600))
	}

	var parsed struct {
		Data []struct {
			B64JSON       string `json:"b64_json"`
			URL           string `json:"url"`
			RevisedPrompt string `json:"revised_prompt"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("decode image response: %w", err)
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return nil, fmt.Errorf("image API error: %s", parsed.Error.Message)
	}
	if len(parsed.Data) == 0 {
		return nil, fmt.Errorf("image API returned no images")
	}

	item := parsed.Data[0]
	var data []byte
	if item.B64JSON != "" {
		data, err = base64.StdEncoding.DecodeString(item.B64JSON)
		if err != nil {
			return nil, fmt.Errorf("decode image base64: %w", err)
		}
	} else if item.URL != "" {
		data, err = downloadImage(ctx, item.URL)
		if err != nil {
			return nil, err
		}
	} else {
		return nil, fmt.Errorf("image API returned an empty result")
	}

	return &ImageResult{
		Data:          data,
		Mime:          detectImageMime(data),
		RevisedPrompt: item.RevisedPrompt,
	}, nil
}

func resolveGeminiGenerateURL(endpoint, model string) string {
	ep := strings.TrimRight(strings.TrimSpace(endpoint), "/")
	if ep == "" {
		ep = "https://generativelanguage.googleapis.com"
	}
	if strings.Contains(ep, ":generateContent") {
		return ep
	}
	if strings.HasSuffix(ep, "/v1beta") || strings.HasSuffix(ep, "/v1") {
		return ep + "/models/" + model + ":generateContent"
	}
	return ep + "/v1beta/models/" + model + ":generateContent"
}

func generateGeminiImage(ctx context.Context, cfg ProviderImageConfig, req ImageRequest) (*ImageResult, error) {
	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]interface{}{{"text": req.Prompt}}},
		},
		"generationConfig": map[string]interface{}{
			"responseModalities": []string{"TEXT", "IMAGE"},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, resolveGeminiGenerateURL(cfg.Endpoint, req.Model), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if cfg.APIKey != "" {
		httpReq.Header.Set("x-goog-api-key", cfg.APIKey)
	}

	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("gemini image request failed: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gemini image API error (%d): %s", resp.StatusCode, truncateForError(string(respBody), 600))
	}

	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text       string `json:"text"`
					InlineData *struct {
						MimeType string `json:"mimeType"`
						Data     string `json:"data"`
					} `json:"inlineData"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("decode gemini image response: %w", err)
	}
	if parsed.Error != nil && parsed.Error.Message != "" {
		return nil, fmt.Errorf("gemini image API error: %s", parsed.Error.Message)
	}

	for _, candidate := range parsed.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData == nil || part.InlineData.Data == "" {
				continue
			}
			data, err := base64.StdEncoding.DecodeString(part.InlineData.Data)
			if err != nil {
				return nil, fmt.Errorf("decode gemini image base64: %w", err)
			}
			mimeType := part.InlineData.MimeType
			if mimeType == "" {
				mimeType = detectImageMime(data)
			}
			return &ImageResult{Data: data, Mime: mimeType}, nil
		}
	}
	return nil, fmt.Errorf("gemini returned no image (the model may not support image output)")
}

func downloadImage(ctx context.Context, url string) ([]byte, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("download generated image: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download generated image: status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func detectImageMime(data []byte) string {
	if len(data) == 0 {
		return "image/png"
	}
	switch http.DetectContentType(data) {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
		return http.DetectContentType(data)
	default:
		if len(data) > 8 && string(data[:8]) == "\x89PNG\r\n\x1a\n" {
			return "image/png"
		}
		return "image/png"
	}
}

func truncateForError(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
