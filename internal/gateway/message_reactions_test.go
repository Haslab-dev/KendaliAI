package gateway

import (
	"testing"
	"time"
)

func TestMessageReactions(t *testing.T) {
	store := newTestStore(t)

	sessID := "sess-reactions-test"
	msg := SessionMessage{
		ID:        "msg-1",
		SessionID: sessID,
		Role:      "user",
		Content:   "haha this is hilarious",
		CreatedAt: time.Now().UnixMilli(),
		Reactions: []MessageReaction{
			{Emoji: "😂", SenderID: "agent-1", SenderName: "Alex"},
		},
	}

	if err := store.SaveMessage(msg); err != nil {
		t.Fatalf("failed to save message with reaction: %v", err)
	}

	msgs, err := store.GetSessionMessages(sessID)
	if err != nil {
		t.Fatalf("failed to get messages: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	if len(msgs[0].Reactions) != 1 || msgs[0].Reactions[0].Emoji != "😂" {
		t.Fatalf("expected reaction '😂', got %+v", msgs[0].Reactions)
	}

	// Add second reaction
	updated, err := store.AddMessageReaction(sessID, "msg-1", "🚀", "user", "User")
	if err != nil {
		t.Fatalf("failed to add message reaction: %v", err)
	}
	if len(updated.Reactions) != 2 {
		t.Fatalf("expected 2 reactions, got %d", len(updated.Reactions))
	}

	// Deduplication test: add same reaction by same user
	dedup, err := store.AddMessageReaction(sessID, "msg-1", "🚀", "user", "User")
	if err != nil {
		t.Fatalf("failed on dedup add: %v", err)
	}
	if len(dedup.Reactions) != 2 {
		t.Fatalf("expected 2 reactions after duplicate add, got %d", len(dedup.Reactions))
	}
}
