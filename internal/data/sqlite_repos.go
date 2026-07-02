package data

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type SQLiteDataLayer struct {
	db   *sql.DB
	root string
}

var dataLayerSchema = []string{
	`CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		gateway_id TEXT,
		channel_id TEXT,
		goal TEXT,
		intent TEXT,
		status TEXT DEFAULT 'active',
		created_at INTEGER,
		updated_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS goals (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL,
		summary TEXT NOT NULL,
		status TEXT DEFAULT 'active',
		parent_id TEXT,
		dag TEXT,
		tool_trace TEXT,
		created_at INTEGER,
		completed_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS memories (
		id TEXT PRIMARY KEY,
		content TEXT NOT NULL,
		content_hash TEXT,
		source TEXT,
		embedding_json TEXT,
		importance REAL DEFAULT 0.5,
		created_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS workspace_meta (
		id TEXT PRIMARY KEY,
		root_path TEXT NOT NULL UNIQUE,
		framework TEXT,
		language TEXT,
		build_tool TEXT,
		css TEXT,
		routing TEXT,
		entrypoints TEXT,
		config_files TEXT,
		workspace_revision TEXT,
		dependency_revision TEXT,
		indexed_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS conversations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id TEXT NOT NULL,
		role TEXT NOT NULL,
		content TEXT NOT NULL,
		tokens INTEGER DEFAULT 0,
		model TEXT,
		created_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS context_cache (
		context_hash TEXT PRIMARY KEY,
		prompt TEXT,
		response TEXT,
		tool_sequence TEXT,
		provider TEXT,
		model TEXT,
		token_savings INTEGER DEFAULT 0,
		hit_count INTEGER DEFAULT 0,
		created_at INTEGER,
		last_accessed_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS artifacts (
		id TEXT PRIMARY KEY,
		session_id TEXT,
		goal_id TEXT,
		key TEXT NOT NULL,
		bucket TEXT,
		url TEXT,
		checksum TEXT,
		size INTEGER DEFAULT 0,
		mime TEXT,
		parent_id TEXT,
		created_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS symbols (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		kind TEXT,
		file TEXT NOT NULL,
		line INTEGER DEFAULT 0,
		parent TEXT,
		exported INTEGER DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS imports (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		from_file TEXT NOT NULL,
		to_file TEXT,
		symbol TEXT,
		is_named INTEGER DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS file_index (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		path TEXT NOT NULL UNIQUE,
		sha256 TEXT,
		mtime INTEGER,
		workspace_revision TEXT,
		tokens INTEGER DEFAULT 0,
		summary TEXT,
		cached_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS plans (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		goal_pattern TEXT NOT NULL,
		goal_hash TEXT NOT NULL UNIQUE,
		execution_dag TEXT,
		tool_sequence TEXT,
		framework TEXT,
		workspace_revision TEXT,
		dependency_revision TEXT,
		hit_count INTEGER DEFAULT 0,
		created_at INTEGER,
		last_used_at INTEGER
	)`,
	`CREATE INDEX IF NOT EXISTS idx_sessions_gateway ON sessions(gateway_id)`,
	`CREATE INDEX IF NOT EXISTS idx_goals_session ON goals(session_id)`,
	`CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash)`,
	`CREATE INDEX IF NOT EXISTS idx_conversations_sess ON conversations(session_id)`,
	`CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)`,
	`CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file)`,
	`CREATE INDEX IF NOT EXISTS idx_imports_from ON imports(from_file)`,
	`CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id)`,
	`CREATE INDEX IF NOT EXISTS idx_artifacts_goal ON artifacts(goal_id)`,
}

func NewSQLiteDataLayer(rootPath string) (*SQLiteDataLayer, error) {
	dataDir := filepath.Join(rootPath, ".kendaliai")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}

	dbPath := filepath.Join(dataDir, "kendaliai.db")
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	if _, err := db.Exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA cache_size = -16000;"); err != nil {
		db.Close()
		return nil, err
	}

	for _, q := range dataLayerSchema {
		if _, err := db.Exec(q); err != nil {
			db.Close()
			return nil, fmt.Errorf("schema: %w", err)
		}
	}

	return &SQLiteDataLayer{db: db, root: rootPath}, nil
}

func (d *SQLiteDataLayer) DB() *sql.DB {
	return d.db
}

func (d *SQLiteDataLayer) Close() error {
	return d.db.Close()
}

func (d *SQLiteDataLayer) RootPath() string {
	return d.root
}

func now() int64 { return time.Now().Unix() }

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func hashContent(content string) string {
	h := sha256.Sum256([]byte(content))
	return hex.EncodeToString(h[:])
}

// SessionRepository impl
func (d *SQLiteDataLayer) CreateSession(ctx context.Context, session *Session) error {
	_, err := d.db.ExecContext(ctx,
		`INSERT INTO sessions (id, gateway_id, channel_id, goal, intent, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		session.ID, session.GatewayID, session.ChannelID, session.Goal, session.Intent, session.Status, now(), now())
	return err
}

func (d *SQLiteDataLayer) GetSession(ctx context.Context, id string) (*Session, error) {
	var s Session
	var createdAt, updatedAt int64
	err := d.db.QueryRowContext(ctx, `SELECT id, gateway_id, channel_id, goal, intent, status, created_at, updated_at FROM sessions WHERE id = ?`, id).
		Scan(&s.ID, &s.GatewayID, &s.ChannelID, &s.Goal, &s.Intent, &s.Status, &createdAt, &updatedAt)
	if err != nil {
		return nil, err
	}
	s.CreatedAt = time.Unix(createdAt, 0)
	s.UpdatedAt = time.Unix(updatedAt, 0)
	return &s, nil
}

func (d *SQLiteDataLayer) ListSessions(ctx context.Context, gatewayID string, limit, offset int) ([]Session, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT id, gateway_id, channel_id, goal, intent, status, created_at, updated_at FROM sessions WHERE gateway_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, gatewayID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sessions []Session
	for rows.Next() {
		var s Session
		var ca, ua int64
		if err := rows.Scan(&s.ID, &s.GatewayID, &s.ChannelID, &s.Goal, &s.Intent, &s.Status, &ca, &ua); err != nil {
			continue
		}
		s.CreatedAt = time.Unix(ca, 0)
		s.UpdatedAt = time.Unix(ua, 0)
		sessions = append(sessions, s)
	}
	return sessions, nil
}

func (d *SQLiteDataLayer) UpdateSession(ctx context.Context, session *Session) error {
	_, err := d.db.ExecContext(ctx, `UPDATE sessions SET goal = ?, intent = ?, status = ?, updated_at = ? WHERE id = ?`,
		session.Goal, session.Intent, session.Status, now(), session.ID)
	return err
}

func (d *SQLiteDataLayer) DeleteSession(ctx context.Context, id string) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id)
	return err
}

// GoalRepository impl
func (d *SQLiteDataLayer) CreateGoal(ctx context.Context, goal *GoalRecord) error {
	_, err := d.db.ExecContext(ctx,
		`INSERT INTO goals (id, session_id, summary, status, parent_id, dag, tool_trace, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		goal.ID, goal.SessionID, goal.Summary, goal.Status, goal.ParentID, goal.DAG, goal.ToolTrace, now())
	return err
}

func (d *SQLiteDataLayer) GetGoal(ctx context.Context, id string) (*GoalRecord, error) {
	var g GoalRecord
	var createdAt int64
	var completedAt sql.NullInt64
	err := d.db.QueryRowContext(ctx, `SELECT id, session_id, summary, status, parent_id, dag, tool_trace, created_at, completed_at FROM goals WHERE id = ?`, id).
		Scan(&g.ID, &g.SessionID, &g.Summary, &g.Status, &g.ParentID, &g.DAG, &g.ToolTrace, &createdAt, &completedAt)
	if err != nil {
		return nil, err
	}
	g.CreatedAt = time.Unix(createdAt, 0)
	if completedAt.Valid {
		t := time.Unix(completedAt.Int64, 0)
		g.CompletedAt = &t
	}
	return &g, nil
}

func (d *SQLiteDataLayer) ListGoalsBySession(ctx context.Context, sessionID string) ([]GoalRecord, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT id, session_id, summary, status, parent_id, dag, tool_trace, created_at, completed_at FROM goals WHERE session_id = ? ORDER BY created_at`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var goals []GoalRecord
	for rows.Next() {
		var g GoalRecord
		var ca int64
		var comp sql.NullInt64
		if err := rows.Scan(&g.ID, &g.SessionID, &g.Summary, &g.Status, &g.ParentID, &g.DAG, &g.ToolTrace, &ca, &comp); err != nil {
			continue
		}
		g.CreatedAt = time.Unix(ca, 0)
		if comp.Valid {
			t := time.Unix(comp.Int64, 0)
			g.CompletedAt = &t
		}
		goals = append(goals, g)
	}
	return goals, nil
}

func (d *SQLiteDataLayer) UpdateGoal(ctx context.Context, goal *GoalRecord) error {
	_, err := d.db.ExecContext(ctx, `UPDATE goals SET summary = ?, status = ?, dag = ?, tool_trace = ?, completed_at = ? WHERE id = ?`,
		goal.Summary, goal.Status, goal.DAG, goal.ToolTrace, now(), goal.ID)
	return err
}

// MemoryRepository impl
func (d *SQLiteDataLayer) StoreMemory(ctx context.Context, mem *Memory) error {
	if mem.ContentHash == "" {
		mem.ContentHash = hashContent(mem.Content)
	}
	_, err := d.db.ExecContext(ctx,
		`INSERT OR REPLACE INTO memories (id, content, content_hash, source, embedding_json, importance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		mem.ID, mem.Content, mem.ContentHash, mem.Source, mem.EmbeddingJSON, mem.Importance, now())
	return err
}

func (d *SQLiteDataLayer) SearchMemory(ctx context.Context, query string, topK int) ([]Memory, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT id, content, content_hash, source, embedding_json, importance, created_at FROM memories ORDER BY created_at DESC LIMIT ?`, topK)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var mems []Memory
	for rows.Next() {
		var m Memory
		var ca int64
		if err := rows.Scan(&m.ID, &m.Content, &m.ContentHash, &m.Source, &m.EmbeddingJSON, &m.Importance, &ca); err != nil {
			continue
		}
		m.CreatedAt = time.Unix(ca, 0)
		mems = append(mems, m)
	}
	return mems, nil
}

func (d *SQLiteDataLayer) DeleteMemory(ctx context.Context, id string) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM memories WHERE id = ?`, id)
	return err
}

// WorkspaceRepository impl
func (d *SQLiteDataLayer) SaveWorkspace(ctx context.Context, ws *WorkspaceMeta) error {
	_, err := d.db.ExecContext(ctx,
		`INSERT OR REPLACE INTO workspace_meta (id, root_path, framework, language, build_tool, css, routing, entrypoints, config_files, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		ws.ID, ws.RootPath, ws.Framework, ws.Language, ws.BuildTool, ws.CSS, ws.Routing, ws.Entrypoints, ws.ConfigFiles, now())
	return err
}

func (d *SQLiteDataLayer) GetWorkspace(ctx context.Context, rootPath string) (*WorkspaceMeta, error) {
	var ws WorkspaceMeta
	var indexedAt int64
	err := d.db.QueryRowContext(ctx, `SELECT id, root_path, framework, language, build_tool, css, routing, entrypoints, config_files, indexed_at FROM workspace_meta WHERE root_path = ?`, rootPath).
		Scan(&ws.ID, &ws.RootPath, &ws.Framework, &ws.Language, &ws.BuildTool, &ws.CSS, &ws.Routing, &ws.Entrypoints, &ws.ConfigFiles, &indexedAt)
	if err != nil {
		return nil, err
	}
	ws.IndexedAt = time.Unix(indexedAt, 0)
	return &ws, nil
}

func (d *SQLiteDataLayer) DeleteWorkspace(ctx context.Context, rootPath string) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM workspace_meta WHERE root_path = ?`, rootPath)
	return err
}

// ConversationRepository impl
func (d *SQLiteDataLayer) AppendConversation(ctx context.Context, turn *ConversationTurn) error {
	res, err := d.db.ExecContext(ctx,
		`INSERT INTO conversations (session_id, role, content, tokens, model, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		turn.SessionID, turn.Role, turn.Content, turn.Tokens, turn.Model, now())
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	turn.ID = int(id)
	return nil
}

func (d *SQLiteDataLayer) ListConversations(ctx context.Context, sessionID string, limit int) ([]ConversationTurn, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := d.db.QueryContext(ctx, `SELECT id, session_id, role, content, tokens, model, created_at FROM conversations WHERE session_id = ? ORDER BY id ASC LIMIT ?`, sessionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var turns []ConversationTurn
	for rows.Next() {
		var t ConversationTurn
		var ca int64
		if err := rows.Scan(&t.ID, &t.SessionID, &t.Role, &t.Content, &t.Tokens, &t.Model, &ca); err != nil {
			continue
		}
		t.CreatedAt = time.Unix(ca, 0)
		turns = append(turns, t)
	}
	return turns, nil
}

// PromptCacheRepository impl
func (d *SQLiteDataLayer) GetContextCache(ctx context.Context, hash string) (*ContextCacheEntry, error) {
	var e ContextCacheEntry
	var ca, la int64
	err := d.db.QueryRowContext(ctx, `SELECT context_hash, prompt, response, tool_sequence, provider, model, token_savings, hit_count, created_at, last_accessed_at FROM context_cache WHERE context_hash = ?`, hash).
		Scan(&e.ContextHash, &e.Prompt, &e.Response, &e.ToolSequence, &e.Provider, &e.Model, &e.TokenSavings, &e.HitCount, &ca, &la)
	if err != nil {
		return nil, err
	}
	e.CreatedAt = time.Unix(ca, 0)
	e.LastAccessedAt = time.Unix(la, 0)
	d.db.ExecContext(ctx, `UPDATE context_cache SET hit_count = hit_count + 1, last_accessed_at = ? WHERE context_hash = ?`, now(), hash)
	return &e, nil
}

func (d *SQLiteDataLayer) SetContextCache(ctx context.Context, entry *ContextCacheEntry) error {
	_, err := d.db.ExecContext(ctx,
		`INSERT OR REPLACE INTO context_cache (context_hash, prompt, response, tool_sequence, provider, model, token_savings, hit_count, created_at, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.ContextHash, entry.Prompt, entry.Response, entry.ToolSequence, entry.Provider, entry.Model, entry.TokenSavings, entry.HitCount, now(), now())
	return err
}

func (d *SQLiteDataLayer) InvalidateContextCache(ctx context.Context) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM context_cache`)
	return err
}

// ArtifactRepository impl
func (d *SQLiteDataLayer) CreateArtifact(ctx context.Context, artifact *Artifact) error {
	_, err := d.db.ExecContext(ctx,
		`INSERT INTO artifacts (id, session_id, goal_id, key, bucket, url, checksum, size, mime, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		artifact.ID, artifact.SessionID, artifact.GoalID, artifact.Key, artifact.Bucket, artifact.URL, artifact.Checksum, artifact.Size, artifact.Mime, artifact.ParentID, now())
	return err
}

func (d *SQLiteDataLayer) GetArtifact(ctx context.Context, id string) (*Artifact, error) {
	var a Artifact
	var ca int64
	err := d.db.QueryRowContext(ctx, `SELECT id, session_id, goal_id, key, bucket, url, checksum, size, mime, parent_id, created_at FROM artifacts WHERE id = ?`, id).
		Scan(&a.ID, &a.SessionID, &a.GoalID, &a.Key, &a.Bucket, &a.URL, &a.Checksum, &a.Size, &a.Mime, &a.ParentID, &ca)
	if err != nil {
		return nil, err
	}
	a.CreatedAt = time.Unix(ca, 0)
	return &a, nil
}

func (d *SQLiteDataLayer) ListArtifactsBySession(ctx context.Context, sessionID string) ([]Artifact, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT id, session_id, goal_id, key, bucket, url, checksum, size, mime, parent_id, created_at FROM artifacts WHERE session_id = ? ORDER BY created_at`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var arts []Artifact
	for rows.Next() {
		var a Artifact
		var ca int64
		if err := rows.Scan(&a.ID, &a.SessionID, &a.GoalID, &a.Key, &a.Bucket, &a.URL, &a.Checksum, &a.Size, &a.Mime, &a.ParentID, &ca); err != nil {
			continue
		}
		a.CreatedAt = time.Unix(ca, 0)
		arts = append(arts, a)
	}
	return arts, nil
}

func (d *SQLiteDataLayer) ListArtifactsByGoal(ctx context.Context, goalID string) ([]Artifact, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT id, session_id, goal_id, key, bucket, url, checksum, size, mime, parent_id, created_at FROM artifacts WHERE goal_id = ? ORDER BY created_at`, goalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var arts []Artifact
	for rows.Next() {
		var a Artifact
		var ca int64
		if err := rows.Scan(&a.ID, &a.SessionID, &a.GoalID, &a.Key, &a.Bucket, &a.URL, &a.Checksum, &a.Size, &a.Mime, &a.ParentID, &ca); err != nil {
			continue
		}
		a.CreatedAt = time.Unix(ca, 0)
		arts = append(arts, a)
	}
	return arts, nil
}

func (d *SQLiteDataLayer) DeleteArtifact(ctx context.Context, id string) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM artifacts WHERE id = ?`, id)
	return err
}

// Symbol & Import indexing
func (d *SQLiteDataLayer) IndexSymbols(ctx context.Context, symbols []SymbolEntry) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM symbols`); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO symbols (name, kind, file, line, parent, exported) VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, s := range symbols {
		exp := 0
		if s.Exported {
			exp = 1
		}
		if _, err := stmt.ExecContext(ctx, s.Name, s.Kind, s.File, s.Line, s.Parent, exp); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *SQLiteDataLayer) ResolveSymbol(ctx context.Context, name string) ([]SymbolEntry, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT id, name, kind, file, line, parent, exported FROM symbols WHERE name = ?`, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []SymbolEntry
	for rows.Next() {
		var s SymbolEntry
		var exp int
		if err := rows.Scan(&s.ID, &s.Name, &s.Kind, &s.File, &s.Line, &s.Parent, &exp); err != nil {
			continue
		}
		s.Exported = exp == 1
		results = append(results, s)
	}
	return results, nil
}

func (d *SQLiteDataLayer) SearchSymbols(ctx context.Context, partial string) ([]SymbolEntry, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT id, name, kind, file, line, parent, exported FROM symbols WHERE name LIKE ?`, "%"+partial+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []SymbolEntry
	for rows.Next() {
		var s SymbolEntry
		var exp int
		if err := rows.Scan(&s.ID, &s.Name, &s.Kind, &s.File, &s.Line, &s.Parent, &exp); err != nil {
			continue
		}
		s.Exported = exp == 1
		results = append(results, s)
	}
	return results, nil
}

func (d *SQLiteDataLayer) IndexImports(ctx context.Context, edges []ImportEdge) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM imports`); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO imports (from_file, to_file, symbol, is_named) VALUES (?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, e := range edges {
		isNamed := 0
		if e.IsNamed {
			isNamed = 1
		}
		if _, err := stmt.ExecContext(ctx, e.FromFile, e.ToFile, e.Symbol, isNamed); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *SQLiteDataLayer) GetImports(ctx context.Context, file string) ([]ImportEdge, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT from_file, to_file, symbol, is_named FROM imports WHERE from_file = ?`, file)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var edges []ImportEdge
	for rows.Next() {
		var e ImportEdge
		var isNamed int
		if err := rows.Scan(&e.FromFile, &e.ToFile, &e.Symbol, &isNamed); err != nil {
			continue
		}
		e.IsNamed = isNamed == 1
		edges = append(edges, e)
	}
	return edges, nil
}

func (d *SQLiteDataLayer) GetImportedBy(ctx context.Context, file string) ([]ImportEdge, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT from_file, to_file, symbol, is_named FROM imports WHERE to_file = ?`, file)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var edges []ImportEdge
	for rows.Next() {
		var e ImportEdge
		var isNamed int
		if err := rows.Scan(&e.FromFile, &e.ToFile, &e.Symbol, &isNamed); err != nil {
			continue
		}
		e.IsNamed = isNamed == 1
		edges = append(edges, e)
	}
	return edges, nil
}

func (d *SQLiteDataLayer) IndexFile(ctx context.Context, path, content string, summary string) error {
	h := hashContent(content)
	tokens := len(content) / 4
	_, err := d.db.ExecContext(ctx,
		`INSERT OR REPLACE INTO file_index (path, sha256, mtime, tokens, summary, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
		path, h, now(), tokens, summary, now())
	return err
}

func (d *SQLiteDataLayer) GetFileInfo(ctx context.Context, path string) (sha256 string, tokens int, summary string, err error) {
	err = d.db.QueryRowContext(ctx, `SELECT sha256, tokens, COALESCE(summary, '') FROM file_index WHERE path = ?`, path).
		Scan(&sha256, &tokens, &summary)
	return
}

func (d *SQLiteDataLayer) IsFileChanged(ctx context.Context, path string) (bool, error) {
	var cachedSHA string
	var cachedMTime int64
	err := d.db.QueryRowContext(ctx, `SELECT sha256, mtime FROM file_index WHERE path = ?`, path).Scan(&cachedSHA, &cachedMTime)
	if err != nil {
		return true, nil
	}
	stat, err := os.Stat(filepath.Join(d.root, path))
	if err != nil {
		return true, err
	}
	if stat.ModTime().Unix() > cachedMTime {
		return true, nil
	}
	b, err := os.ReadFile(filepath.Join(d.root, path))
	if err != nil {
		return true, err
	}
	currentSHA := hashContent(string(b))
	return currentSHA != cachedSHA, nil
}

func (d *SQLiteDataLayer) StorePlan(ctx context.Context, pattern, goalHash, dag, toolSeq, framework string) error {
	_, err := d.db.ExecContext(ctx,
		`INSERT OR REPLACE INTO plans (goal_pattern, goal_hash, execution_dag, tool_sequence, framework, hit_count, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
		pattern, goalHash, dag, toolSeq, framework, now(), now())
	return err
}

func (d *SQLiteDataLayer) LookupPlan(ctx context.Context, goalHash string) (dag, toolSeq string, found bool) {
	err := d.db.QueryRowContext(ctx, `SELECT execution_dag, tool_sequence FROM plans WHERE goal_hash = ?`, goalHash).Scan(&dag, &toolSeq)
	if err != nil {
		return "", "", false
	}
	d.db.ExecContext(ctx, `UPDATE plans SET hit_count = hit_count + 1, last_used_at = ? WHERE goal_hash = ?`, now(), goalHash)
	return dag, toolSeq, true
}

func (d *SQLiteDataLayer) IsWorkspaceStale() bool {
	var indexedAt int64
	err := d.db.QueryRow(`SELECT indexed_at FROM workspace_meta WHERE root_path = ?`, d.root).Scan(&indexedAt)
	if err != nil {
		return true
	}
	for _, f := range []string{"package.json", "go.mod", "Cargo.toml", "requirements.txt"} {
		abs := filepath.Join(d.root, f)
		info, err := os.Stat(abs)
		if err != nil {
			continue
		}
		if info.ModTime().Unix() > indexedAt {
			return true
		}
	}
	return false
}

func (d *SQLiteDataLayer) InvalidateWorkspace() {
	d.db.Exec(`DELETE FROM workspace_meta`)
	d.db.Exec(`DELETE FROM symbols`)
	d.db.Exec(`DELETE FROM imports`)
	d.db.Exec(`DELETE FROM plans`)
	d.db.Exec(`DELETE FROM file_index`)
}

func (d *SQLiteDataLayer) StoreExecution(ctx context.Context, sessionID, goal, phases, toolTrace, filesEdited, build, lint, test string, success bool) error {
	s := 0
	if success {
		s = 1
	}
	_, err := d.db.ExecContext(ctx,
		`INSERT INTO plans (goal_pattern, goal_hash, execution_dag, tool_sequence, framework, hit_count, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		goal, hashContent(goal), phases, toolTrace, "execution_"+sessionID, s, now(), now())
	return err
}

func (d *SQLiteDataLayer) DumpTablesJSON() string {
	tables := []string{"sessions", "goals", "memories", "workspace_meta", "conversations", "context_cache", "artifacts", "symbols", "imports", "file_index", "plans"}
	result := map[string]interface{}{}
	for _, t := range tables {
		rows, err := d.db.Query(`SELECT COUNT(*) FROM ` + t)
		if err != nil {
			continue
		}
		var count int
		rows.Next()
		rows.Scan(&count)
		rows.Close()
		result[t] = count
	}
	b, _ := json.MarshalIndent(result, "", "  ")
	return string(b)
}
