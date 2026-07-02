package vector

import "context"

type Document struct {
	ID        string            `json:"id"`
	Content   string            `json:"content"`
	Embedding []float32         `json:"embedding"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

type SearchResult struct {
	ID      string  `json:"id"`
	Content string  `json:"content"`
	Score   float64 `json:"score"`
}

type VectorQuery struct {
	Embedding []float32 `json:"embedding"`
	TopK      int       `json:"top_k"`
	MinScore  float64   `json:"min_score,omitempty"`
}

type VectorStore interface {
	Upsert(ctx context.Context, docs []Document) error
	Delete(ctx context.Context, ids []string) error
	Search(ctx context.Context, query VectorQuery) ([]SearchResult, error)
	Get(ctx context.Context, id string) (*Document, error)
	Close() error
}
