package blackboard

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
)

type EntryType string

const (
	EntryFact       EntryType = "fact"
	EntryNote       EntryType = "note"
	EntryQuestion   EntryType = "question"
	EntryResult     EntryType = "result"
	EntryHypothesis EntryType = "hypothesis"
	EntryWarning    EntryType = "warning"
	EntryDecision   EntryType = "decision"
	EntryTaskStatus EntryType = "task_status"
	EntryAssumption EntryType = "assumption"
	EntryUnknown    EntryType = "unknown"
	EntryConflict   EntryType = "conflict"
	EntryFailure    EntryType = "failure"
	EntryMetric     EntryType = "metric"
	EntryArtifact   EntryType = "artifact"
	EntryURL        EntryType = "url"
	EntryFile       EntryType = "file"
	EntrySymbol     EntryType = "symbol"
	EntryTodo       EntryType = "todo"
)

type BlackboardEntry struct {
	ID        string    `json:"id"`
	Type      EntryType `json:"type"`
	Author    string    `json:"author"`
	Content   string    `json:"content"`
	Tags      []string  `json:"tags,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type Blackboard struct {
	mu      sync.RWMutex
	entries map[string]*BlackboardEntry
}

func NewBlackboard() *Blackboard {
	return &Blackboard{
		entries: make(map[string]*BlackboardEntry),
	}
}

func (b *Blackboard) Post(ctx context.Context, entryType EntryType, author, content string, tags []string) *BlackboardEntry {
	b.mu.Lock()
	defer b.mu.Unlock()

	id := "entry-" + uuid.New().String()[:8]
	entry := &BlackboardEntry{
		ID:        id,
		Type:      entryType,
		Author:    author,
		Content:   content,
		Tags:      tags,
		CreatedAt: time.Now(),
	}

	b.entries[id] = entry
	return entry
}

func (b *Blackboard) Get(ctx context.Context, id string) (*BlackboardEntry, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	entry, ok := b.entries[id]
	return entry, ok
}

func (b *Blackboard) List(ctx context.Context) []*BlackboardEntry {
	b.mu.RLock()
	defer b.mu.RUnlock()

	list := make([]*BlackboardEntry, 0, len(b.entries))
	for _, e := range b.entries {
		list = append(list, e)
	}
	return list
}
