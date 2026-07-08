package embedding

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"

	"github.com/kendaliai/app/internal/config"
	openai "github.com/sashabaranov/go-openai"
)

type Client struct {
	client *openai.Client
	model  string
}

func NewClient() *Client {
	c := config.Cfg
	apiKey := c.Embedding.APIKey
	endpoint := c.Embedding.Endpoint
	model := c.Embedding.Model

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
	if model == "" {
		model = "text-embedding-3-small"
	}

	ocfg := openai.DefaultConfig(apiKey)
	if endpoint != "" {
		ocfg.BaseURL = endpoint
	}

	return &Client{
		client: openai.NewClientWithConfig(ocfg),
		model:  model,
	}
}

func NewClientFromConfig(apiKey, endpoint, model string) *Client {
	ocfg := openai.DefaultConfig(apiKey)
	ocfg.BaseURL = endpoint
	return &Client{
		client: openai.NewClientWithConfig(ocfg),
		model:  model,
	}
}

type Vector []float32

type EmbeddingProvider interface {
	Embed(ctx context.Context, texts []string) ([]Vector, error)
}

var _ EmbeddingProvider = (*Client)(nil)

func (c *Client) Embed(ctx context.Context, texts []string) ([]Vector, error) {
	resp, err := c.client.CreateEmbeddings(ctx, openai.EmbeddingRequest{
		Input: texts,
		Model: openai.EmbeddingModel(c.model),
	})
	if err != nil {
		return nil, fmt.Errorf("embedding API error: %w", err)
	}

	result := make([]Vector, len(resp.Data))
	for i, d := range resp.Data {
		result[i] = Vector(d.Embedding)
	}
	return result, nil
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
