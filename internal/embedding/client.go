package embedding

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"

	"github.com/kendaliai/app/internal/config"
	openai "github.com/sashabaranov/go-openai"
)

type Client struct {
	client *openai.Client
	model  string
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

	ocfg := openai.DefaultConfig(apiKey)
	if base := resolveEmbeddingsBase(endpoint); base != "" {
		ocfg.BaseURL = base
	}

	return &Client{
		client:  openai.NewClientWithConfig(ocfg),
		model:   model,
		baseURL: ocfg.BaseURL,
	}
}

func NewClientFromConfig(apiKey, endpoint, model string) *Client {
	ocfg := openai.DefaultConfig(apiKey)
	base := resolveEmbeddingsBase(endpoint)
	if base != "" {
		ocfg.BaseURL = base
	}
	if model == "" {
		model = "text-embedding-3-small"
	}
	return &Client{
		client:  openai.NewClientWithConfig(ocfg),
		model:   model,
		baseURL: base,
	}
}

func (c *Client) Model() string {
	return c.model
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

		resp, err := c.client.CreateEmbeddings(ctx, openai.EmbeddingRequest{
			Input: batch,
			Model: openai.EmbeddingModel(c.model),
		})
		if err != nil {
			msg := err.Error()
			if strings.Contains(msg, "cannot unmarshal") {
				return nil, fmt.Errorf(
					"embedding API error for batch [%d:%d] via %s/embeddings: %s — the endpoint did not return a JSON response; check the embedding endpoint URL",
					i, end, c.baseURL, msg)
			}
			return nil, fmt.Errorf("embedding API error for batch [%d:%d] via %s/embeddings: %w", i, end, c.baseURL, err)
		}

		for _, d := range resp.Data {
			allVectors = append(allVectors, Vector(d.Embedding))
		}
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
