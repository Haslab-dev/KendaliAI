package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/config"
	_ "github.com/mattn/go-sqlite3"
)

func Initialize(cfg *config.Config) (*sql.DB, error) {
	dbPath := cfg.Database.Path
	if dbPath == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			homeDir = "."
		}
		dbPath = filepath.Join(homeDir, ".kendaliai", "kendaliai.db")
	}

	// Ensure directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}

	// Set pragmas
	if _, err := db.Exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;"); err != nil {
		return nil, err
	}

	if err := initTables(db); err != nil {
		return nil, err
	}

	runMigrations(db)

	return db, nil
}

func initTables(db *sql.DB) error {
	for _, query := range schemaQueries {
		if _, err := db.Exec(query); err != nil {
			return err
		}
	}
	return nil
}

func runMigrations(db *sql.DB) {
	// Add columns to sessions if missing
	addColumnIfNotExists(db, "sessions", "type", "TEXT DEFAULT 'direct'")
	addColumnIfNotExists(db, "sessions", "avatar", "TEXT DEFAULT ''")
	addColumnIfNotExists(db, "sessions", "summary", "TEXT DEFAULT ''")

	// Add columns to session_messages if missing
	addColumnIfNotExists(db, "session_messages", "sender_type", "TEXT DEFAULT 'user'")
	addColumnIfNotExists(db, "session_messages", "sender_id", "TEXT DEFAULT ''")
	addColumnIfNotExists(db, "session_messages", "sender_name", "TEXT DEFAULT ''")
	addColumnIfNotExists(db, "session_messages", "sender_avatar", "TEXT DEFAULT ''")
	addColumnIfNotExists(db, "session_messages", "recipient_agent_id", "TEXT DEFAULT ''")
	addColumnIfNotExists(db, "session_messages", "reactions", "TEXT DEFAULT '[]'")

	// Add department and role columns to agents if missing
	addColumnIfNotExists(db, "agents", "role", "TEXT DEFAULT ''")
	addColumnIfNotExists(db, "agents", "department", "TEXT DEFAULT ''")
}

func addColumnIfNotExists(db *sql.DB, tableName, colName, colDef string) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", tableName))
	if err != nil {
		return
	}
	defer rows.Close()

	found := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var dfltValue sql.NullString
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err == nil {
			if strings.EqualFold(name, colName) {
				found = true
				break
			}
		}
	}
	if !found {
		_, _ = db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", tableName, colName, colDef))
	}
}
