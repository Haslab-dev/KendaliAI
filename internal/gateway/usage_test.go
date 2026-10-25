package gateway

import (
	"database/sql"
	"testing"

	"github.com/kendaliai/app/internal/agent"
	_ "github.com/mattn/go-sqlite3"
)

func TestEstimateMessagesTokens(t *testing.T) {
	msgs := []agent.Message{
		{Role: "system", Content: "12345678"},
		{Role: "user", Content: "12345678"},
	}
	got := EstimateMessagesTokens(msgs)
	if got != 12 { // (8+3)/4 = 2 per message + 4 overhead = 6 each
		t.Fatalf("got %d tokens, want 12", got)
	}
}

func TestUsagePercentClamped(t *testing.T) {
	if p := UsagePercent(50, 100); p != 50 {
		t.Fatalf("got %v, want 50", p)
	}
	if p := UsagePercent(200, 100); p != 100 {
		t.Fatalf("got %v, want 100", p)
	}
	if p := UsagePercent(10, 0); p != 0 {
		t.Fatalf("got %v, want 0", p)
	}
}

func TestComputeSessionUsage(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1)
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE session_messages (
		id TEXT PRIMARY KEY, session_id TEXT NOT NULL, agent_id TEXT, channel TEXT,
		role TEXT NOT NULL, sender_type TEXT, sender_id TEXT, sender_name TEXT,
		sender_avatar TEXT, recipient_agent_id TEXT, content TEXT NOT NULL,
		thought TEXT DEFAULT '', tool_calls TEXT, tool_call_id TEXT,
		tokens INTEGER DEFAULT 0, model TEXT, rag_sources TEXT,
		reactions TEXT DEFAULT '[]', attachments TEXT DEFAULT '[]', created_at INTEGER
	)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	store := NewStore(db)
	for i, content := range []string{"hello world", "another message with a few words"} {
		if err := store.SaveMessage(SessionMessage{
			ID:        string(rune('a' + i)),
			SessionID: "sess_usage",
			Channel:   "web",
			Role:      "user",
			Content:   content,
			CreatedAt: int64(i + 1),
		}); err != nil {
			t.Fatalf("save message: %v", err)
		}
	}

	used, window := ComputeSessionUsage(store, "sess_usage", "gpt-4o")
	if window != ModelContextCapacity("gpt-4o") {
		t.Fatalf("window = %d", window)
	}
	if used <= 2000 {
		t.Fatalf("expected history to add to the 2000-token baseline, got %d", used)
	}
	if used > window {
		t.Fatalf("used %d exceeds window %d", used, window)
	}
}
