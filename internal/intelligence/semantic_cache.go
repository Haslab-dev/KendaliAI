package intelligence

import (
	"crypto/sha256"
	"encoding/hex"
	"time"
)

type SemanticCache struct {
	repoDB *RepoDB
}

func NewSemanticCache(repoDB *RepoDB) *SemanticCache {
	return &SemanticCache{repoDB: repoDB}
}

func (sc *SemanticCache) Hash(context string) string {
	h := sha256.Sum256([]byte(context))
	return hex.EncodeToString(h[:])
}

func (sc *SemanticCache) Lookup(contextHash string) *SemanticCacheEntry {
	if sc.repoDB == nil {
		return nil
	}
	return sc.repoDB.LookupSemanticCache(contextHash)
}

func (sc *SemanticCache) Store(contextHash, prompt, response string, toolSequence []string) {
	if sc.repoDB == nil {
		return
	}
	entry := &SemanticCacheEntry{
		ContextHash:    contextHash,
		Prompt:         prompt,
		Response:       response,
		ToolSequence:   toolSequence,
		CreatedAt:      time.Now(),
		LastAccessedAt: time.Now(),
	}
	sc.repoDB.StoreSemanticCache(entry)
}

func (sc *SemanticCache) BuildContextHash(query, systemPrompt string, fileContents map[string]string) string {
	material := query + systemPrompt
	for _, content := range fileContents {
		material += content[:min8(200, len(content))]
	}
	return sc.Hash(material)
}

func min8(a, b int) int {
	if a < b {
		return a
	}
	return b
}
