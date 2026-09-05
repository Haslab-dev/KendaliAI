package gateway

import (
	"testing"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/db"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	cfg := &config.Config{}
	cfg.Database.Path = ":memory:"
	database, err := db.Initialize(cfg)
	if err != nil {
		t.Fatalf("db init: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store := NewStore(database)
	store.SeedInitialData(cfg)
	return store
}

func filledVec(dims int) []float32 {
	vec := make([]float32, dims)
	for i := range vec {
		vec[i] = 0.5
	}
	return vec
}

// TestDocumentChunkEmbeddingModelCompatibility covers switching embedding
// models: chunks tagged with an old model must be excluded from vector search
// for a new model, reindexing (re-ingest) restores searchability, and legacy
// untagged chunks stay best-effort searchable by dimension match.
func TestDocumentChunkEmbeddingModelCompatibility(t *testing.T) {
	store := newTestStore(t)

	doc := Document{ID: "doc_compat", SessionID: "sess1", Title: "Compat Doc", Source: "test", Content: "hello world"}

	// 1. Embedded with old model (1536 dims).
	oldVec := make([]float32, 1536)
	for i := range oldVec {
		oldVec[i] = 0.5
	}
	if err := store.IngestDocument(doc, []string{"chunk text"}, [][]float32{oldVec}, "old-model"); err != nil {
		t.Fatalf("ingest: %v", err)
	}

	// 2. Query with new model (1024 dims): old-model chunk is not comparable
	//    and must be excluded, not crash.
	res, err := store.SearchDocumentChunks("sess1", filledVec(1024), 5, 0.1, "new-model")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(res) != 0 {
		t.Errorf("expected 0 hits across incompatible models, got %d", len(res))
	}

	// 3. Reindex = re-ingest with the new model; search must work again.
	if err := store.IngestDocument(doc, []string{"chunk text"}, [][]float32{filledVec(1024)}, "new-model"); err != nil {
		t.Fatalf("re-ingest: %v", err)
	}
	res, err = store.SearchDocumentChunks("sess1", filledVec(1024), 5, 0.1, "new-model")
	if err != nil {
		t.Fatalf("search after reindex: %v", err)
	}
	if len(res) != 1 {
		t.Fatalf("expected 1 hit after reindex, got %d", len(res))
	}
	if res[0].DocumentID != "doc_compat" {
		t.Errorf("hit on wrong document: %+v", res[0])
	}

	// 4. Model stats: old-model rows were replaced, only new-model remains.
	stats, err := store.ChunkModelStats()
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	total := 0
	for _, st := range stats {
		if st.Model == "old-model" {
			t.Errorf("stale old-model chunks survived reindex: %+v", st)
		}
		if st.Model == "new-model" && (st.Dims != 1024 || st.Count != 1) {
			t.Errorf("unexpected new-model stat: %+v", st)
		}
		total += st.Count
	}
	if total != 1 {
		t.Errorf("expected 1 total chunk, got %d", total)
	}
}

// TestDocumentChunkLegacyRowsStaySearchable: rows ingested before model
// tagging (embedding_model='') remain searchable for any model whose query
// vector has matching dimensions.
func TestDocumentChunkLegacyRowsStaySearchable(t *testing.T) {
	store := newTestStore(t)

	doc := Document{ID: "doc_legacy", SessionID: "sess1", Title: "Legacy Doc", Source: "test", Content: "legacy content"}
	if err := store.IngestDocument(doc, []string{"legacy chunk"}, [][]float32{filledVec(1024)}, ""); err != nil {
		t.Fatalf("ingest: %v", err)
	}

	res, err := store.SearchDocumentChunks("sess1", filledVec(1024), 5, 0.1, "some-new-model")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(res) != 1 {
		t.Errorf("expected legacy chunk to stay searchable, got %d hits", len(res))
	}

	// Different dimensions must still be excluded (guard).
	res, err = store.SearchDocumentChunks("sess1", filledVec(512), 5, 0.1, "some-new-model")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(res) != 0 {
		t.Errorf("expected dimension mismatch to exclude legacy chunk, got %d hits", len(res))
	}
}
