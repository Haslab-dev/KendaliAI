package vector

import (
	"context"
	"database/sql"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type SQLiteLinearStore struct {
	db *sql.DB
}

func NewSQLiteLinearStore(rootPath string) (*SQLiteLinearStore, error) {
	dir := filepath.Join(rootPath, ".kendaliai")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	dbPath := filepath.Join(dir, "vectors.db")
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open vectors db: %w", err)
	}

	if _, err := db.Exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`); err != nil {
		db.Close()
		return nil, err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS vec_documents (
			id TEXT PRIMARY KEY,
			content TEXT NOT NULL,
			embedding BLOB NOT NULL,
			dimensions INTEGER NOT NULL,
			metadata TEXT,
			created_at INTEGER
		)
	`); err != nil {
		db.Close()
		return nil, fmt.Errorf("create vec_documents: %w", err)
	}

	return &SQLiteLinearStore{db: db}, nil
}

func (s *SQLiteLinearStore) Upsert(ctx context.Context, docs []Document) error {
	now := time.Now().Unix()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx,
		`INSERT OR REPLACE INTO vec_documents (id, content, embedding, dimensions, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, doc := range docs {
		blob := floatsToBlob(doc.Embedding)
		meta := ""
		if len(doc.Metadata) > 0 {
			b, _ := jsonMarshalSimple(doc.Metadata)
			meta = string(b)
		}
		if _, err := stmt.ExecContext(ctx, doc.ID, doc.Content, blob, len(doc.Embedding), meta, now); err != nil {
			return fmt.Errorf("upsert %s: %w", doc.ID, err)
		}
	}

	return tx.Commit()
}

func (s *SQLiteLinearStore) Delete(ctx context.Context, ids []string) error {
	for _, id := range ids {
		if _, err := s.db.ExecContext(ctx, `DELETE FROM vec_documents WHERE id = ?`, id); err != nil {
			return err
		}
	}
	return nil
}

func (s *SQLiteLinearStore) Search(ctx context.Context, query VectorQuery) ([]SearchResult, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, content, embedding, dimensions FROM vec_documents`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type scored struct {
		id      string
		content string
		score   float64
	}
	var results []scored

	for rows.Next() {
		var id, content string
		var blob []byte
		var dims int
		if err := rows.Scan(&id, &content, &blob, &dims); err != nil {
			continue
		}
		if dims != len(query.Embedding) {
			continue
		}
		vec := blobToFloats(blob, dims)
		if vec == nil {
			continue
		}
		score := cosineSimilarity(query.Embedding, vec)
		if query.MinScore > 0 && score < query.MinScore {
			continue
		}
		results = append(results, scored{id: id, content: content, score: score})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].score > results[j].score
	})

	topK := query.TopK
	if topK <= 0 || topK > len(results) {
		topK = len(results)
	}

	out := make([]SearchResult, topK)
	for i := range topK {
		out[i] = SearchResult{
			ID:      results[i].id,
			Content: results[i].content,
			Score:   results[i].score,
		}
	}
	return out, nil
}

func (s *SQLiteLinearStore) Get(ctx context.Context, id string) (*Document, error) {
	var doc Document
	var blob []byte
	var dims int
	var meta sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT id, content, embedding, dimensions, metadata FROM vec_documents WHERE id = ?`, id).
		Scan(&doc.ID, &doc.Content, &blob, &dims, &meta)
	if err != nil {
		return nil, err
	}
	doc.Embedding = blobToFloats(blob, dims)
	return &doc, nil
}

func (s *SQLiteLinearStore) Close() error {
	return s.db.Close()
}

func floatsToBlob(vec []float32) []byte {
	buf := make([]byte, len(vec)*4)
	for i, v := range vec {
		binary.LittleEndian.PutUint32(buf[i*4:], math.Float32bits(v))
	}
	return buf
}

func blobToFloats(blob []byte, dims int) []float32 {
	if len(blob) != dims*4 {
		return nil
	}
	vec := make([]float32, dims)
	for i := range dims {
		bits := binary.LittleEndian.Uint32(blob[i*4:])
		vec[i] = math.Float32frombits(bits)
	}
	return vec
}

func cosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
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

func jsonMarshalSimple(m map[string]string) ([]byte, error) {
	if len(m) == 0 {
		return []byte("{}"), nil
	}
	result := "{"
	first := true
	for k, v := range m {
		if !first {
			result += ","
		}
		result += fmt.Sprintf(`"%s":"%s"`, k, v)
		first = false
	}
	result += "}"
	return []byte(result), nil
}
