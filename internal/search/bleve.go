package search

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/search/query"
)

type BleveEngine struct {
	index bleve.Index
	path  string
}

func NewBleveEngine(rootPath string) (*BleveEngine, error) {
	indexPath := filepath.Join(rootPath, ".kendaliai", "bleve")
	if err := os.MkdirAll(indexPath, 0755); err != nil {
		return nil, fmt.Errorf("bleve mkdir: %w", err)
	}

	idx, err := bleve.Open(indexPath)
	if err != nil {
		mapping := bleve.NewIndexMapping()
		docMapping := bleve.NewDocumentMapping()

		pathField := bleve.NewTextFieldMapping()
		pathField.Store = true
		pathField.IncludeTermVectors = true
		docMapping.AddFieldMappingsAt("path", pathField)

		contentField := bleve.NewTextFieldMapping()
		contentField.Store = true
		contentField.IncludeTermVectors = true
		docMapping.AddFieldMappingsAt("content", contentField)

		langField := bleve.NewTextFieldMapping()
		langField.Store = true
		docMapping.AddFieldMappingsAt("language", langField)

		mapping.AddDocumentMapping("_default", docMapping)
		idx, err = bleve.New(indexPath, mapping)
		if err != nil {
			return nil, fmt.Errorf("bleve create: %w", err)
		}
	}

	return &BleveEngine{index: idx, path: indexPath}, nil
}

func (b *BleveEngine) Index(ctx context.Context, doc SearchDocument) error {
	data := map[string]interface{}{
		"path":     doc.Path,
		"content":  doc.Content,
		"language": doc.Language,
	}
	for k, v := range doc.Fields {
		data[k] = v
	}
	return b.index.Index(doc.ID, data)
}

func (b *BleveEngine) Delete(ctx context.Context, id string) error {
	return b.index.Delete(id)
}

func (b *BleveEngine) Search(ctx context.Context, sq SearchQuery) ([]SearchResult, error) {
	var q query.Query

	if sq.Fuzzy {
		q = query.NewFuzzyQuery(sq.Query)
	} else {
		q = query.NewQueryStringQuery(sq.Query)
	}

	searchReq := bleve.NewSearchRequest(q)
	if sq.TopK > 0 {
		searchReq.Size = sq.TopK
	} else {
		searchReq.Size = 10
	}
	searchReq.Highlight = bleve.NewHighlight()

	res, err := b.index.Search(searchReq)
	if err != nil {
		return nil, fmt.Errorf("bleve search: %w", err)
	}

	var results []SearchResult
	for _, hit := range res.Hits {
		r := SearchResult{
			ID:    hit.ID,
			Score: hit.Score,
		}
		if path, ok := hit.Fields["path"].(string); ok {
			r.Path = path
		}
		if len(hit.Fragments["content"]) > 0 {
			r.Snippet = hit.Fragments["content"][0]
		}
		results = append(results, r)
	}
	return results, nil
}

func (b *BleveEngine) Close() error {
	return b.index.Close()
}
