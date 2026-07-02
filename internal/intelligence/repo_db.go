package intelligence

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type RepoDB struct {
	db   *sql.DB
	root string
}

var repoSchema = []string{
	`CREATE TABLE IF NOT EXISTS repo_index (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		root_path TEXT NOT NULL UNIQUE,
		framework TEXT,
		language TEXT,
		build_tool TEXT,
		css TEXT,
		routing TEXT,
		entrypoints TEXT,
		config_files TEXT,
		indexed_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS symbol_index (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		kind TEXT,
		file TEXT NOT NULL,
		line INTEGER DEFAULT 0,
		parent TEXT,
		exported INTEGER DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS import_graph (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		from_file TEXT NOT NULL,
		to_file TEXT,
		symbol TEXT,
		is_named INTEGER DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS file_cache (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		path TEXT NOT NULL UNIQUE,
		sha256 TEXT,
		mtime INTEGER,
		tokens INTEGER DEFAULT 0,
		summary TEXT,
		cached_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS working_set (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id TEXT NOT NULL,
		files TEXT NOT NULL,
		goal TEXT,
		intent TEXT,
		created_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS semantic_cache (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		context_hash TEXT NOT NULL UNIQUE,
		prompt TEXT,
		response TEXT,
		tool_sequence TEXT,
		hit_count INTEGER DEFAULT 0,
		created_at INTEGER,
		last_accessed_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS plan_cache (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		goal_pattern TEXT NOT NULL,
		goal_hash TEXT NOT NULL UNIQUE,
		execution_dag TEXT,
		tool_sequence TEXT,
		expected_outputs TEXT,
		framework TEXT,
		framework_version TEXT,
		hit_count INTEGER DEFAULT 0,
		created_at INTEGER,
		last_used_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS execution_cache (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id TEXT NOT NULL,
		goal TEXT NOT NULL,
		phases TEXT NOT NULL,
		tool_trace TEXT,
		files_edited TEXT,
		build_result TEXT,
		lint_result TEXT,
		test_result TEXT,
		success INTEGER DEFAULT 0,
		created_at INTEGER
	)`,
	`CREATE INDEX IF NOT EXISTS idx_symbol_name ON symbol_index(name)`,
	`CREATE INDEX IF NOT EXISTS idx_symbol_file ON symbol_index(file)`,
	`CREATE INDEX IF NOT EXISTS idx_import_from ON import_graph(from_file)`,
	`CREATE INDEX IF NOT EXISTS idx_import_to ON import_graph(to_file)`,
	`CREATE INDEX IF NOT EXISTS idx_ws_session ON working_set(session_id)`,
	`CREATE INDEX IF NOT EXISTS idx_plan_hash ON plan_cache(goal_hash)`,
	`CREATE INDEX IF NOT EXISTS idx_exec_session ON execution_cache(session_id)`,
}

func OpenRepoDB(rootPath string) (*RepoDB, error) {
	repoDBPath := filepath.Join(rootPath, ".kendaliai", "repo.db")
	dir := filepath.Dir(repoDBPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite3", repoDBPath)
	if err != nil {
		return nil, err
	}

	if _, err := db.Exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;"); err != nil {
		db.Close()
		return nil, err
	}

	for _, q := range repoSchema {
		if _, err := db.Exec(q); err != nil {
			db.Close()
			return nil, err
		}
	}

	return &RepoDB{db: db, root: rootPath}, nil
}

func (r *RepoDB) Close() error {
	return r.db.Close()
}

func (r *RepoDB) StoreProjectInfo(info *ProjectInfo) error {
	now := time.Now().Unix()
	_, err := r.db.Exec(
		`INSERT OR REPLACE INTO repo_index (root_path, framework, language, build_tool, css, routing, entrypoints, config_files, indexed_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.root, info.Framework, info.Language, info.BuildTool, info.CSS, info.Routing,
		strings.Join(info.Entrypoints, ","), strings.Join(info.ConfigFiles, ","), now,
	)
	return err
}

func (r *RepoDB) LoadProjectInfo() *ProjectInfo {
	row := r.db.QueryRow(`SELECT framework, language, build_tool, css, routing, entrypoints, config_files FROM repo_index WHERE root_path = ?`, r.root)
	var fw, lang, bt, css, routing, eps, cfs sql.NullString
	if err := row.Scan(&fw, &lang, &bt, &css, &routing, &eps, &cfs); err != nil {
		return nil
	}
	if !fw.Valid {
		return nil
	}
	info := &ProjectInfo{
		Framework: fw.String,
		Language:  lang.String,
		BuildTool: bt.String,
		CSS:       css.String,
		Routing:   routing.String,
	}
	if eps.Valid && eps.String != "" {
		info.Entrypoints = strings.Split(eps.String, ",")
	}
	if cfs.Valid && cfs.String != "" {
		info.ConfigFiles = strings.Split(cfs.String, ",")
	}
	return info
}

func (r *RepoDB) IndexSymbols(symbols []SymbolEntry) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM symbol_index"); err != nil {
		return err
	}

	stmt, err := tx.Prepare(`INSERT INTO symbol_index (name, kind, file, line, parent, exported) VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, s := range symbols {
		exp := 0
		if s.Exported {
			exp = 1
		}
		if _, err := stmt.Exec(s.Name, s.Kind, s.File, s.Line, s.Parent, exp); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *RepoDB) ResolveSymbol(name string) []SymbolEntry {
	rows, err := r.db.Query(`SELECT name, kind, file, line, parent, exported FROM symbol_index WHERE name = ?`, name)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var results []SymbolEntry
	for rows.Next() {
		var s SymbolEntry
		var exp int
		if err := rows.Scan(&s.Name, &s.Kind, &s.File, &s.Line, &s.Parent, &exp); err != nil {
			continue
		}
		s.Exported = exp == 1
		results = append(results, s)
	}
	return results
}

func (r *RepoDB) SearchSymbol(partial string) []SymbolEntry {
	rows, err := r.db.Query(`SELECT name, kind, file, line, parent, exported FROM symbol_index WHERE name LIKE ?`, "%"+partial+"%")
	if err != nil {
		return nil
	}
	defer rows.Close()

	var results []SymbolEntry
	for rows.Next() {
		var s SymbolEntry
		var exp int
		if err := rows.Scan(&s.Name, &s.Kind, &s.File, &s.Line, &s.Parent, &exp); err != nil {
			continue
		}
		s.Exported = exp == 1
		results = append(results, s)
	}
	return results
}

func (r *RepoDB) StoreImports(edges []ImportEdge) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM import_graph"); err != nil {
		return err
	}

	stmt, err := tx.Prepare(`INSERT INTO import_graph (from_file, to_file, symbol, is_named) VALUES (?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, e := range edges {
		isNamed := 0
		if e.IsNamed {
			isNamed = 1
		}
		if _, err := stmt.Exec(e.FromFile, e.ToFile, e.Symbol, isNamed); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *RepoDB) GetImportsOf(file string) []ImportEdge {
	rows, err := r.db.Query(`SELECT from_file, to_file, symbol, is_named FROM import_graph WHERE from_file = ?`, file)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var results []ImportEdge
	for rows.Next() {
		var e ImportEdge
		var isNamed int
		if err := rows.Scan(&e.FromFile, &e.ToFile, &e.Symbol, &isNamed); err != nil {
			continue
		}
		e.IsNamed = isNamed == 1
		results = append(results, e)
	}
	return results
}

func (r *RepoDB) GetImportedBy(file string) []ImportEdge {
	rows, err := r.db.Query(`SELECT from_file, to_file, symbol, is_named FROM import_graph WHERE to_file = ?`, file)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var results []ImportEdge
	for rows.Next() {
		var e ImportEdge
		var isNamed int
		if err := rows.Scan(&e.FromFile, &e.ToFile, &e.Symbol, &isNamed); err != nil {
			continue
		}
		e.IsNamed = isNamed == 1
		results = append(results, e)
	}
	return results
}

func (r *RepoDB) CacheFile(path, content string) error {
	h := sha256.Sum256([]byte(content))
	sha := hex.EncodeToString(h[:])
	tokens := estimateTokens(content)

	rel, _ := filepath.Rel(r.root, path)
	now := time.Now().Unix()

	_, err := r.db.Exec(
		`INSERT OR REPLACE INTO file_cache (path, sha256, mtime, tokens, summary, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
		rel, sha, time.Now().Unix(), tokens, "", now,
	)
	return err
}

func (r *RepoDB) GetFileCache(path string) *FileCacheEntry {
	rel, _ := filepath.Rel(r.root, path)
	row := r.db.QueryRow(`SELECT path, sha256, mtime, tokens, summary, cached_at FROM file_cache WHERE path = ?`, rel)
	var fc FileCacheEntry
	var cachedAt int64
	if err := row.Scan(&fc.Path, &fc.SHA256, &fc.MTime, &fc.Tokens, &fc.Summary, &cachedAt); err != nil {
		return nil
	}
	fc.CachedAt = time.Unix(cachedAt, 0)
	return &fc
}

func (r *RepoDB) IsFileChanged(path string) (bool, error) {
	rel, _ := filepath.Rel(r.root, path)
	row := r.db.QueryRow(`SELECT sha256, mtime FROM file_cache WHERE path = ?`, rel)
	var cachedSHA string
	var cachedMTime int64
	if err := row.Scan(&cachedSHA, &cachedMTime); err != nil {
		return true, nil
	}

	stat, err := os.Stat(path)
	if err != nil {
		return true, err
	}

	if stat.ModTime().Unix() > cachedMTime {
		return true, nil
	}

	b, err := os.ReadFile(path)
	if err != nil {
		return true, err
	}
	h := sha256.Sum256(b)
	if hex.EncodeToString(h[:]) != cachedSHA {
		return true, nil
	}
	return false, nil
}

func (r *RepoDB) UpdateFileSummary(path, summary string) error {
	rel, _ := filepath.Rel(r.root, path)
	_, err := r.db.Exec(`UPDATE file_cache SET summary = ? WHERE path = ?`, summary, rel)
	return err
}

func (r *RepoDB) SaveWorkingSet(ws *WorkingSet) error {
	now := time.Now().Unix()
	_, err := r.db.Exec(
		`INSERT INTO working_set (session_id, files, goal, intent, created_at) VALUES (?, ?, ?, ?, ?)`,
		ws.SessionID, strings.Join(ws.Files, ","), ws.Goal, ws.Intent, now,
	)
	return err
}

func (r *RepoDB) GetWorkingSet(sessionID string) *WorkingSet {
	row := r.db.QueryRow(`SELECT session_id, files, goal, intent, created_at FROM working_set WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`, sessionID)
	var ws WorkingSet
	var files, createdAt int64
	var goal, intent sql.NullString
	if err := row.Scan(&ws.SessionID, &files, &goal, &intent, &createdAt); err != nil {
		return nil
	}
	ws.Goal = goal.String
	ws.Intent = intent.String
	ws.CreatedAt = time.Unix(createdAt, 0)
	if files != 0 {
		ws.Files = []string{}
	}
	return &ws
}

func (r *RepoDB) LookupSemanticCache(contextHash string) *SemanticCacheEntry {
	row := r.db.QueryRow(`SELECT context_hash, prompt, response, tool_sequence, hit_count, created_at, last_accessed_at FROM semantic_cache WHERE context_hash = ?`, contextHash)
	var sc SemanticCacheEntry
	var toolSeq sql.NullString
	var createdAt, lastAccessed int64
	if err := row.Scan(&sc.ContextHash, &sc.Prompt, &sc.Response, &toolSeq, &sc.HitCount, &createdAt, &lastAccessed); err != nil {
		return nil
	}
	sc.CreatedAt = time.Unix(createdAt, 0)
	sc.LastAccessedAt = time.Unix(lastAccessed, 0)
	if toolSeq.Valid {
		sc.ToolSequence = strings.Split(toolSeq.String, ",")
	}
	now := time.Now().Unix()
	r.db.Exec(`UPDATE semantic_cache SET hit_count = hit_count + 1, last_accessed_at = ? WHERE context_hash = ?`, now, contextHash)
	return &sc
}

func (r *RepoDB) StoreSemanticCache(sc *SemanticCacheEntry) error {
	now := time.Now().Unix()
	toolSeq := strings.Join(sc.ToolSequence, ",")
	_, err := r.db.Exec(
		`INSERT OR REPLACE INTO semantic_cache (context_hash, prompt, response, tool_sequence, hit_count, created_at, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		sc.ContextHash, sc.Prompt, sc.Response, toolSeq, 1, now, now,
	)
	return err
}

func (r *RepoDB) DB() *sql.DB {
	return r.db
}

func (r *RepoDB) StorePlan(pattern string, goalHash string, dag, toolSeq, expectedOutputs, framework, frameworkVersion string) error {
	now := time.Now().Unix()
	_, err := r.db.Exec(
		`INSERT OR REPLACE INTO plan_cache (goal_pattern, goal_hash, execution_dag, tool_sequence, expected_outputs, framework, framework_version, hit_count, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
		pattern, goalHash, dag, toolSeq, expectedOutputs, framework, frameworkVersion, now, now,
	)
	return err
}

func (r *RepoDB) LookupPlan(goalHash string) (executionDAG, toolSequence string, found bool) {
	row := r.db.QueryRow(`SELECT execution_dag, tool_sequence FROM plan_cache WHERE goal_hash = ?`, goalHash)
	if err := row.Scan(&executionDAG, &toolSequence); err != nil {
		return "", "", false
	}
	r.db.Exec(`UPDATE plan_cache SET hit_count = hit_count + 1, last_used_at = ? WHERE goal_hash = ?`, time.Now().Unix(), goalHash)
	return executionDAG, toolSequence, true
}

func (r *RepoDB) InvalidatePlanCacheForFramework(framework string) error {
	_, err := r.db.Exec(`DELETE FROM plan_cache WHERE framework = ?`, framework)
	return err
}

func (r *RepoDB) InvalidateFileCache(path string) error {
	rel, _ := filepath.Rel(r.root, path)
	_, err := r.db.Exec(`DELETE FROM file_cache WHERE path = ?`, rel)
	return err
}

func (r *RepoDB) InvalidateRepositoryCache() error {
	_, err := r.db.Exec(`DELETE FROM repo_index`)
	return err
}

func (r *RepoDB) IsRepositoryCacheStale() bool {
	row := r.db.QueryRow(`SELECT indexed_at FROM repo_index WHERE root_path = ?`, r.root)
	var indexedAt int64
	if err := row.Scan(&indexedAt); err != nil {
		return true
	}
	filesToCheck := []string{"package.json", "go.mod", "Cargo.toml", "requirements.txt", "pubspec.yaml", "Package.swift"}
	for _, f := range filesToCheck {
		abs := filepath.Join(r.root, f)
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

func (r *RepoDB) InvalidateWorkingSet(sessionID string) error {
	_, err := r.db.Exec(`DELETE FROM working_set WHERE session_id = ?`, sessionID)
	return err
}

func (r *RepoDB) InvalidatePromptCache() error {
	_, err := r.db.Exec(`DELETE FROM semantic_cache`)
	return err
}

func (r *RepoDB) StoreExecution(entry *ExecutionCacheEntry) error {
	now := time.Now().Unix()
	success := 0
	if entry.Success {
		success = 1
	}
	_, err := r.db.Exec(
		`INSERT INTO execution_cache (session_id, goal, phases, tool_trace, files_edited, build_result, lint_result, test_result, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		entry.SessionID, entry.Goal, entry.Phases, entry.ToolTrace, entry.FilesEdited, entry.BuildResult, entry.LintResult, entry.TestResult, success, now,
	)
	return err
}

func (r *RepoDB) LookupSimilarExecution(goalPattern string) *ExecutionCacheEntry {
	row := r.db.QueryRow(`SELECT session_id, goal, phases, tool_trace, files_edited, build_result, lint_result, test_result, success, created_at FROM execution_cache WHERE goal LIKE ? ORDER BY created_at DESC LIMIT 1`, "%"+goalPattern+"%")
	var e ExecutionCacheEntry
	var success int
	var createdAt int64
	if err := row.Scan(&e.SessionID, &e.Goal, &e.Phases, &e.ToolTrace, &e.FilesEdited, &e.BuildResult, &e.LintResult, &e.TestResult, &success, &createdAt); err != nil {
		return nil
	}
	e.Success = success == 1
	return &e
}

func estimateTokens(content string) int {
	return len(content) / 4
}

func ComputeFileSHA(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func ReadFileContent(path string, maxBytes int) (string, error) {
	if maxBytes <= 0 {
		maxBytes = 1 << 20
	}
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return "", err
	}
	size := stat.Size()
	if size > int64(maxBytes) {
		size = int64(maxBytes)
	}
	buf := make([]byte, size)
	n, err := f.Read(buf)
	if err != nil && err != io.EOF {
		return "", err
	}
	return string(buf[:n]), nil
}
