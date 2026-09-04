package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// FetchRemoteModels probes a provider endpoint for available models
func FetchRemoteModels(ctx context.Context, pType, endpoint, apiKey string) ([]ModelItem, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	pType = strings.ToLower(strings.TrimSpace(pType))
	endpoint = strings.TrimRight(strings.TrimSpace(endpoint), "/")

	// Provide defaults if endpoint is blank
	if endpoint == "" {
		switch pType {
		case "deepseek":
			endpoint = "https://api.deepseek.com"
		case "openai":
			endpoint = "https://api.openai.com/v1"
		case "anthropic":
			endpoint = "https://api.anthropic.com/v1"
		case "ollama":
			endpoint = "http://localhost:11434"
		default:
			return nil, fmt.Errorf("endpoint is required for custom provider")
		}
	}

	var candidateURLs []string
	if pType == "ollama" {
		// Ollama has /v1/models and /api/tags
		candidateURLs = []string{
			endpoint + "/v1/models",
			endpoint + "/api/tags",
		}
		if !strings.HasSuffix(endpoint, "/v1") {
			candidateURLs = append([]string{endpoint + "/api/tags", endpoint + "/v1/models"}, candidateURLs...)
		}
	} else if pType == "anthropic" {
		candidateURLs = []string{
			endpoint + "/models",
			"https://api.anthropic.com/v1/models",
		}
	} else {
		// OpenAI compatible (DeepSeek, OpenAI, Groq, OpenRouter, vLLM, etc.)
		candidateURLs = []string{
			endpoint + "/models",
		}
		if !strings.HasSuffix(endpoint, "/v1") {
			candidateURLs = append(candidateURLs, endpoint+"/v1/models")
		}
	}

	client := &http.Client{Timeout: 8 * time.Second}
	var lastErr error

	for _, u := range candidateURLs {
		req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
		if err != nil {
			continue
		}

		req.Header.Set("Accept", "application/json")
		if pType == "anthropic" {
			if apiKey != "" {
				req.Header.Set("x-api-key", apiKey)
			}
			req.Header.Set("anthropic-version", "2023-06-01")
		} else if apiKey != "" {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			lastErr = fmt.Errorf("HTTP %d from %s", resp.StatusCode, u)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			lastErr = err
			continue
		}

		models := parseModelsFromPayload(body)
		if len(models) > 0 {
			return models, nil
		}
	}

	// If Anthropic returned 404 or models API is unavailable, provide curated defaults
	if pType == "anthropic" {
		return []ModelItem{
			{ID: "claude-3-7-sonnet", Name: "Claude 3.7 Sonnet (Thinking)", Enabled: true},
			{ID: "claude-3-5-sonnet-20241022", Name: "Claude 3.5 Sonnet", Enabled: true},
			{ID: "claude-3-5-haiku", Name: "Claude 3.5 Haiku", Enabled: true},
			{ID: "claude-3-opus-20240229", Name: "Claude 3 Opus", Enabled: false},
		}, nil
	}

	if lastErr != nil {
		return nil, fmt.Errorf("failed to fetch models from %s: %w", endpoint, lastErr)
	}
	return []ModelItem{}, nil
}

func parseModelsFromPayload(body []byte) []ModelItem {
	seen := make(map[string]bool)
	var result []ModelItem

	// 1. Try standard OpenAI format: { "data": [ { "id": "..." } ] }
	var openAIResp struct {
		Data []struct {
			ID   string `json:"id"`
			Name string `json:"name,omitempty"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &openAIResp); err == nil && len(openAIResp.Data) > 0 {
		for _, m := range openAIResp.Data {
			id := strings.TrimSpace(m.ID)
			if id != "" && !seen[id] {
				seen[id] = true
				name := m.Name
				if name == "" {
					name = id
				}
				result = append(result, ModelItem{ID: id, Name: name, Enabled: true})
			}
		}
	}

	// 2. Try Ollama native format: { "models": [ { "name": "..." } ] }
	var ollamaResp struct {
		Models []struct {
			Name  string `json:"name"`
			Model string `json:"model"`
		} `json:"models"`
	}
	if err := json.Unmarshal(body, &ollamaResp); err == nil && len(ollamaResp.Models) > 0 {
		for _, m := range ollamaResp.Models {
			id := strings.TrimSpace(m.Name)
			if id == "" {
				id = strings.TrimSpace(m.Model)
			}
			if id != "" && !seen[id] {
				seen[id] = true
				result = append(result, ModelItem{ID: id, Name: id, Enabled: true})
			}
		}
	}

	// 3. Try raw array of objects or strings: [ { "id": "..." } ] or [ "..." ]
	var rawList []interface{}
	if err := json.Unmarshal(body, &rawList); err == nil && len(rawList) > 0 {
		for _, item := range rawList {
			switch v := item.(type) {
			case string:
				s := strings.TrimSpace(v)
				if s != "" && !seen[s] {
					seen[s] = true
					result = append(result, ModelItem{ID: s, Name: s, Enabled: true})
				}
			case map[string]interface{}:
				if idVal, ok := v["id"].(string); ok {
					id := strings.TrimSpace(idVal)
					if id != "" && !seen[id] {
						seen[id] = true
						name, _ := v["name"].(string)
						if name == "" {
							name = id
						}
						result = append(result, ModelItem{ID: id, Name: name, Enabled: true})
					}
				}
			}
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})

	return result
}
