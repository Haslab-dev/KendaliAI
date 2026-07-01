package session

import (
	"fmt"
	"sync"
)

type HistoryEntry struct {
	Role    string
	Content string
}

type Buffer struct {
	mu       sync.RWMutex
	sessions map[string][]HistoryEntry
	maxSize  int
}

var DefaultBuffer = NewBuffer(20)

func NewBuffer(maxSize int) *Buffer {
	return &Buffer{
		sessions: make(map[string][]HistoryEntry),
		maxSize:  maxSize,
	}
}

func (b *Buffer) Add(chatID, role, content string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.sessions[chatID] = append(b.sessions[chatID], HistoryEntry{Role: role, Content: content})
	if len(b.sessions[chatID]) > b.maxSize {
		b.sessions[chatID] = b.sessions[chatID][1:]
	}
}

func (b *Buffer) Last(chatID string, n int) []HistoryEntry {
	b.mu.RLock()
	defer b.mu.RUnlock()
	entries := b.sessions[chatID]
	if n < 0 || n > len(entries) {
		n = len(entries)
	}
	start := len(entries) - n
	if start < 0 {
		start = 0
	}
	result := make([]HistoryEntry, len(entries[start:]))
	copy(result, entries[start:])
	return result
}

func (b *Buffer) Context(chatID string) string {
	entries := b.Last(chatID, 6)
	if len(entries) == 0 {
		return ""
	}
	var result string
	result = "📜 RECENT CONVERSATION:\n"
	for _, e := range entries {
		label := "User"
		if e.Role == "assistant" {
			label = "You"
		}
		content := e.Content
		if len(content) > 200 {
			content = content[:197] + "..."
		}
		result += fmt.Sprintf("[%s]: %s\n", label, content)
	}
	return result + "\nUse this context to stay coherent. The last User message is the current request.\n"
}
