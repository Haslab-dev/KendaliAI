package gateway

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func newMainSessionTestStore(t *testing.T) *Store {
	t.Helper()
	// File-backed DB: ListSessions issues nested queries while rows are open,
	// which deadlocks on a single-connection in-memory database.
	db, err := sql.Open("sqlite3", filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	stmts := []string{
		`CREATE TABLE sessions (
			id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT,
			avatar TEXT, summary TEXT, channel_id TEXT, user_id TEXT, status TEXT,
			pinned INTEGER DEFAULT 0, metadata TEXT, created_at INTEGER, updated_at INTEGER
		)`,
		`CREATE TABLE session_messages (
			id TEXT PRIMARY KEY, session_id TEXT NOT NULL, agent_id TEXT, channel TEXT,
			role TEXT NOT NULL, sender_type TEXT, sender_id TEXT, sender_name TEXT,
			sender_avatar TEXT, recipient_agent_id TEXT, content TEXT NOT NULL,
			thought TEXT DEFAULT '', tool_calls TEXT, tool_call_id TEXT,
			tokens INTEGER DEFAULT 0, model TEXT, rag_sources TEXT,
			reactions TEXT DEFAULT '[]', attachments TEXT DEFAULT '[]', created_at INTEGER
		)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("schema: %v", err)
		}
	}
	return NewStore(db)
}

func TestEnsureMainSessionConsolidatesDuplicates(t *testing.T) {
	store := newMainSessionTestStore(t)

	oldMain := Session{
		ID: "main_old", AgentID: "agent1", Title: "Main Chat", Type: "direct",
		ChannelID: "web", UserID: "default", Status: "active",
		Metadata: `{"isMain":true}`, CreatedAt: 100, UpdatedAt: 100,
	}
	newMain := Session{
		ID: "main_new", AgentID: "agent1", Title: "Main Chat", Type: "direct",
		ChannelID: "web", UserID: "default", Status: "active",
		Metadata: `{"isMain":true}`, CreatedAt: 200, UpdatedAt: 200,
	}
	otherAgent := Session{
		ID: "main_other", AgentID: "agent2", Title: "Main Chat", Type: "direct",
		ChannelID: "web", UserID: "default", Status: "active",
		Metadata: `{"isMain":true}`, CreatedAt: 50, UpdatedAt: 50,
	}
	for _, sess := range []Session{oldMain, newMain, otherAgent} {
		if err := store.SaveSession(sess); err != nil {
			t.Fatalf("save session: %v", err)
		}
	}
	// SaveSession rewrites updated_at; force deterministic values.
	_, _ = store.db.Exec("UPDATE sessions SET updated_at = 100 WHERE id = 'main_old'")
	_, _ = store.db.Exec("UPDATE sessions SET updated_at = 200 WHERE id = 'main_new'")

	if err := store.SaveMessage(SessionMessage{ID: "m1", SessionID: "main_old", Role: "user", Content: "old hello", CreatedAt: 1}); err != nil {
		t.Fatalf("save old msg: %v", err)
	}
	if err := store.SaveMessage(SessionMessage{ID: "m2", SessionID: "main_new", Role: "user", Content: "new hello", CreatedAt: 2}); err != nil {
		t.Fatalf("save new msg: %v", err)
	}

	canonical, err := store.EnsureMainSession("agent1")
	if err != nil {
		t.Fatalf("ensure main: %v", err)
	}
	if canonical == nil || canonical.ID != "main_new" {
		t.Fatalf("expected most recently updated session as canonical, got %+v", canonical)
	}

	var mainCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE agent_id = 'agent1'`).Scan(&mainCount); err != nil {
		t.Fatalf("count: %v", err)
	}
	if mainCount != 1 {
		t.Fatalf("expected 1 session for agent1, got %d", mainCount)
	}

	msgs, err := store.GetSessionMessages("main_new")
	if err != nil {
		t.Fatalf("messages: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected merged messages, got %d", len(msgs))
	}

	// A different agent's Main Chat must be untouched.
	if other, err := store.GetSession("main_other"); err != nil || other == nil {
		t.Fatalf("other agent's main session was removed: %v", err)
	}
}

func TestEnsureMainSessionCreatesOnce(t *testing.T) {
	store := newMainSessionTestStore(t)

	first, err := store.EnsureMainSession("agent_new")
	if err != nil || first == nil {
		t.Fatalf("ensure main: %v", err)
	}
	second, err := store.EnsureMainSession("agent_new")
	if err != nil || second == nil {
		t.Fatalf("ensure main 2: %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("expected the same session, got %s and %s", first.ID, second.ID)
	}
}
