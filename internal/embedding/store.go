package embedding

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Store struct {
	db     *sql.DB
	client *Client
}

func NewStore(db *sql.DB, client *Client) *Store {
	return &Store{db: db, client: client}
}

func (s *Store) Store(ctx context.Context, content string, source string, importance float64) (string, error) {
	vec, err := s.client.EmbedOne(ctx, content)
	if err != nil {
		return "", fmt.Errorf("embed failed: %w", err)
	}

	serialized, err := Serialize(vec)
	if err != nil {
		return "", err
	}

	id := "mem_" + uuid.New().String()[:8]
	now := time.Now().UnixMilli()

	_, err = s.db.Exec(`
		INSERT INTO memories (id, content, source, embedding, embedding_model, importance, created_at, updated_at, last_accessed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, content, source, serialized, s.client.model, importance, now, now, now)
	if err != nil {
		return "", fmt.Errorf("insert failed: %w", err)
	}

	return id, nil
}

func (s *Store) Search(ctx context.Context, query string, topK int) ([]ScoredItem, error) {
	queryVec, err := s.client.EmbedOne(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("embed query failed: %w", err)
	}

	rows, err := s.db.Query(`
		SELECT id, content, embedding
		FROM memories
		WHERE embedding IS NOT NULL AND embedding != ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type item = VecItem
	var items []item

	for rows.Next() {
		var id, content, embStr string
		if err := rows.Scan(&id, &content, &embStr); err != nil {
			continue
		}
		vec, err := Deserialize(embStr)
		if err != nil {
			continue
		}
		items = append(items, item{ID: id, Vec: vec, Content: content})
	}

	scored := RankBySimilarity(queryVec, items)
	if topK > 0 && len(scored) > topK {
		scored = scored[:topK]
	}

	now := time.Now().UnixMilli()
	for _, sc := range scored {
		s.db.Exec("UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?", now, sc.ID)
	}

	return scored, nil
}

func (s *Store) CachedEmbed(ctx context.Context, text string) (Vector, error) {
	var embStr string
	err := s.db.QueryRow("SELECT embedding FROM embedding_cache WHERE cache_key = ?", text).Scan(&embStr)
	if err == nil {
		s.db.Exec("UPDATE embedding_cache SET access_count = access_count + 1, last_accessed_at = ? WHERE cache_key = ?", time.Now().UnixMilli(), text)
		return Deserialize(embStr)
	}

	vec, err := s.client.EmbedOne(ctx, text)
	if err != nil {
		return nil, err
	}

	serialized, _ := Serialize(vec)
	now := time.Now().UnixMilli()
	expires := now + 7*24*60*60*1000
	s.db.Exec(`INSERT OR IGNORE INTO embedding_cache (cache_key, input_text, embedding, model, access_count, created_at, expires_at)
		VALUES (?, ?, ?, ?, 1, ?, ?)`, text, text, serialized, s.client.model, now, expires)

	return vec, nil
}
