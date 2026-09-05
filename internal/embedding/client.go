package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/config"
)

type Client struct {
	httpClient *http.Client
	apiKey     string
	model      string
	// baseURL is the resolved endpoint root (ends with a version segment,
	// e.g. https://host/v1); included in errors for debugging.
	baseURL string
}

// resolveEmbeddingsBase normalizes a configured endpoint into the base URL
// go-openai expects (it appends /embeddings). Mirrors the chat client's
// resolveChatCompletionsURL: bare proxy roots without a version segment are
// the most common misconfiguration and previously produced opaque
// "cannot unmarshal number" errors from plain-text 404 bodies.
func resolveEmbeddingsBase(endpoint string) string {
	ep := strings.TrimRight(strings.TrimSpace(endpoint), "/")
	if ep == "" {
		return "" // go-openai default (https://api.openai.com/v1)
	}
	if strings.HasSuffix(ep, "/embeddings") {
		return strings.TrimSuffix(ep, "/embeddings")
	}
	if versioned := regexp.MustCompile(`/v\d+[a-z]*$`); versioned.MatchString(ep) {
		return ep
	}
	return ep + "/v1"
}

func NewClient() *Client {
	c := config.Cfg
	apiKey := ""
	endpoint := ""
	model := ""

	if c != nil {
		apiKey = c.Embedding.APIKey
		endpoint = c.Embedding.Endpoint
		model = c.Embedding.Model

		// Fall back to the default chat provider's credentials when the
		// embedding section is not explicitly configured.
		if apiKey == "" || endpoint == "" {
			if p := c.DefaultChatProvider(); p != nil {
				if apiKey == "" {
					apiKey = p.APIKey
				}
				if endpoint == "" {
					endpoint = p.Endpoint
				}
			}
		}
	}
	if model == "" {
		model = "text-embedding-3-small"
	}

	base := resolveEmbeddingsBase(endpoint)
	if base == "" {
		base = "https://api.openai.com/v1"
	}

	return &Client{
		httpClient: &http.Client{Timeout: 120 * time.Second},
		apiKey:     apiKey,
		model:      model,
		baseURL:    base,
	}
}

func NewClientFromConfig(apiKey, endpoint, model string) *Client {
	base := resolveEmbeddingsBase(endpoint)
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "text-embedding-3-small"
	}
	return &Client{
		httpClient: &http.Client{Timeout: 120 * time.Second},
		apiKey:     apiKey,
		model:      model,
		baseURL:    base,
	}
}

func (c *Client) Model() string {
	return c.model
}

type embeddingsRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
	// NOTE: deliberately no `user` field — go-openai's client always sent
	// `"user":""` which Mistral's API rejects with 422 (extra_forbidden).
}

type embeddingsResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
}

func (c *Client) embedBatch(ctx context.Context, batch []string) ([]Vector, error) {
	body, err := json.Marshal(embeddingsRequest{Model: c.model, Input: batch})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, parseAPIError(resp.StatusCode, raw)
	}

	var parsed embeddingsResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("unexpected response shape: %v — body: %.300s", err, raw)
	}
	if len(parsed.Data) == 0 {
		return nil, fmt.Errorf("no embeddings in response — body: %.300s", raw)
	}

	vectors := make([]Vector, 0, len(parsed.Data))
	for _, d := range parsed.Data {
		vectors = append(vectors, Vector(d.Embedding))
	}
	return vectors, nil
}

// parseAPIError extracts a human-readable message from the many vendor error
// shapes: OpenAI's {"error":{"message":...}}, Mistral's
// {"message":{"detail":[{"msg":...}]}}, LiteLLM/FastAPI's {"detail":...}, and
// plain-text bodies (e.g. Go's "404 page not found").
func parseAPIError(status int, raw []byte) error {
	short := raw
	if len(short) > 300 {
		short = short[:300]
	}
	bodyStr := strings.TrimSpace(string(short))

	var top struct {
		Error   *struct {
			Message string `json:"message"`
			Type    string `json:"type"`
		} `json:"error"`
		Message json.RawMessage `json:"message"`
		Detail  json.RawMessage `json:"detail"`
	}
	_ = json.Unmarshal(raw, &top)

	if top.Error != nil && top.Error.Message != "" {
		return fmt.Errorf("status %d: %s", status, top.Error.Message)
	}

	// Mistral: "message" is an object holding a FastAPI "detail" list.
	var msgObj struct {
		Detail []struct {
			Msg  string `json:"msg"`
			Type string `json:"type"`
		} `json:"detail"`
	}
	if len(top.Message) > 0 && json.Unmarshal(top.Message, &msgObj) == nil && len(msgObj.Detail) > 0 {
		msgs := make([]string, 0, len(msgObj.Detail))
		for _, d := range msgObj.Detail {
			msgs = append(msgs, d.Msg)
		}
		return fmt.Errorf("status %d: %s", status, strings.Join(msgs, "; "))
	}
	if len(top.Message) > 0 {
		var msgStr string
		if json.Unmarshal(top.Message, &msgStr) == nil && msgStr != "" {
			return fmt.Errorf("status %d: %s", status, msgStr)
		}
	}
	if len(top.Detail) > 0 {
		var detailStr string
		if json.Unmarshal(top.Detail, &detailStr) == nil && detailStr != "" {
			return fmt.Errorf("status %d: %s", status, detailStr)
		}
		var detailList []struct {
			Msg string `json:"msg"`
		}
		if json.Unmarshal(top.Detail, &detailList) == nil && len(detailList) > 0 {
			msgs := make([]string, 0, len(detailList))
			for _, d := range detailList {
				msgs = append(msgs, d.Msg)
			}
			return fmt.Errorf("status %d: %s", status, strings.Join(msgs, "; "))
		}
	}

	// Non-JSON body (proxy misdirection, HTML error pages, plain text)
	if !json.Valid(raw) {
		return fmt.Errorf("status %d: endpoint did not return a JSON response — body: %s", status, bodyStr)
	}
	return fmt.Errorf("status %d: unrecognised error shape — body: %s", status, bodyStr)
}

func (c *Client) TestConnection(ctx context.Context) (int, error) {
	vecs, err := c.Embed(ctx, []string{"KendaliAI embedding test connection probe."})
	if err != nil {
		return 0, err
	}
	if len(vecs) == 0 || len(vecs[0]) == 0 {
		return 0, fmt.Errorf("no vector dimensions returned")
	}
	return len(vecs[0]), nil
}

type Vector []float32

type EmbeddingProvider interface {
	Embed(ctx context.Context, texts []string) ([]Vector, error)
}

var _ EmbeddingProvider = (*Client)(nil)

func (c *Client) Embed(ctx context.Context, texts []string) ([]Vector, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	batchSize := 16
	var allVectors []Vector

	for i := 0; i < len(texts); i += batchSize {
		end := i + batchSize
		if end > len(texts) {
			end = len(texts)
		}
		batch := texts[i:end]

		vectors, err := c.embedBatch(ctx, batch)
		if err != nil {
			return nil, fmt.Errorf("embedding API error for batch [%d:%d] via %s/embeddings: %w", i, end, c.baseURL, err)
		}
		allVectors = append(allVectors, vectors...)
	}

	return allVectors, nil
}

func (c *Client) EmbedOne(ctx context.Context, text string) (Vector, error) {
	vecs, err := c.Embed(ctx, []string{text})
	if err != nil {
		return nil, err
	}
	if len(vecs) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}
	return vecs[0], nil
}

func Serialize(vec Vector) (string, error) {
	b, err := json.Marshal(vec)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func Deserialize(data string) (Vector, error) {
	var vec Vector
	if err := json.Unmarshal([]byte(data), &vec); err != nil {
		return nil, err
	}
	return vec, nil
}

func CosineSimilarity(a, b Vector) float64 {
	if len(a) != len(b) {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		ai := float64(a[i])
		bi := float64(b[i])
		dot += ai * bi
		normA += ai * ai
		normB += bi * bi
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

type ScoredItem struct {
	ID      string
	Content string
	Score   float64
}

type VecItem struct {
	ID      string
	Vec     Vector
	Content string
}

func RankBySimilarity(query Vector, items []VecItem) []ScoredItem {
	scored := make([]ScoredItem, 0, len(items))
	for _, item := range items {
		score := CosineSimilarity(query, item.Vec)
		scored = append(scored, ScoredItem{
			ID:      item.ID,
			Content: item.Content,
			Score:   score,
		})
	}
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].Score > scored[j].Score
	})
	return scored
}
