package search

import "context"

type SearchDocument struct {
	ID       string            `json:"id"`
	Path     string            `json:"path"`
	Content  string            `json:"content"`
	Language string            `json:"language"`
	Fields   map[string]string `json:"fields,omitempty"`
}

type SearchResult struct {
	ID      string                 `json:"id"`
	Path    string                 `json:"path"`
	Score   float64                `json:"score"`
	Snippet string                 `json:"snippet,omitempty"`
	Fields  map[string]interface{} `json:"fields,omitempty"`
}

type SearchQuery struct {
	Query  string `json:"query"`
	TopK   int    `json:"top_k"`
	Fuzzy  bool   `json:"fuzzy,omitempty"`
	Filter string `json:"filter,omitempty"`
}

type SearchEngine interface {
	Index(ctx context.Context, doc SearchDocument) error
	Delete(ctx context.Context, id string) error
	Search(ctx context.Context, query SearchQuery) ([]SearchResult, error)
	Close() error
}
