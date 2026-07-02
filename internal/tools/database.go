package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (tr *ToolRegistry) DatabaseTools() map[string]ToolDef {
	return map[string]ToolDef{
		"query_sql": {
			Name:        "query_sql",
			Description: "Executes a read-only SQL query and returns results as JSON.",
			Signature:   `{"sql": "string"}`,
			Category:    "Database",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				sqlQuery, _ := args["sql"].(string)
				if sqlQuery == "" {
					return "error: 'sql' query is required"
				}

				if tr.db == nil {
					return "error: database not configured"
				}

				rows, err := tr.db.QueryContext(ctx, sqlQuery)
				if err != nil {
					return fmt.Sprintf("query error: %v", err)
				}
				defer rows.Close()

				cols, _ := rows.Columns()
				var results []map[string]interface{}

				for rows.Next() {
					values := make([]interface{}, len(cols))
					valuePtrs := make([]interface{}, len(cols))
					for i := range values {
						valuePtrs[i] = &values[i]
					}

					if err := rows.Scan(valuePtrs...); err != nil {
						continue
					}

					row := make(map[string]interface{})
					for i, col := range cols {
						val := values[i]
						if b, ok := val.([]byte); ok {
							row[col] = string(b)
						} else {
							row[col] = val
						}
					}
					results = append(results, row)
				}

				b, _ := json.MarshalIndent(results, "", "  ")
				return string(b)
			},
		},

		"execute_sql": {
			Name:        "execute_sql",
			Description: "Executes a SQL mutation (INSERT, UPDATE, DELETE). Returns affected rows.",
			Signature:   `{"sql": "string"}`,
			Category:    "Database",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				sqlQuery, _ := args["sql"].(string)
				if sqlQuery == "" {
					return "error: 'sql' query is required"
				}

				if tr.db == nil {
					return "error: database not configured"
				}

				result, err := tr.db.ExecContext(ctx, sqlQuery)
				if err != nil {
					return fmt.Sprintf("execute error: %v", err)
				}

				rowsAffected, _ := result.RowsAffected()
				lastID, _ := result.LastInsertId()

				return fmt.Sprintf(`{"success":true,"rows_affected":%d,"last_insert_id":%d}`, rowsAffected, lastID)
			},
		},

		"backup_database": {
			Name:        "backup_database",
			Description: "Creates a backup of the kendaliai database to a timestamped file.",
			Signature:   `{"path": "string"}`,
			Category:    "Database",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				backupPath, _ := args["path"].(string)
				if backupPath == "" {
					home, _ := os.UserHomeDir()
					backupPath = filepath.Join(home, ".kendaliai", "backups")
				}

				if err := os.MkdirAll(backupPath, 0755); err != nil {
					return fmt.Sprintf("error creating backup dir: %v", err)
				}

				dbPath := filepath.Join(os.Getenv("HOME"), ".kendaliai", "kendaliai.db")
				if _, err := os.Stat(dbPath); os.IsNotExist(err) {
					return "error: kendaliai.db not found"
				}

				timestamp := time.Now().Format("20060102-150405")
				backupFile := filepath.Join(backupPath, fmt.Sprintf("kendaliai-%s.db", timestamp))

				src, err := os.Open(dbPath)
				if err != nil {
					return fmt.Sprintf("error opening db: %v", err)
				}
				defer src.Close()

				dst, err := os.Create(backupFile)
				if err != nil {
					return fmt.Sprintf("error creating backup: %v", err)
				}
				defer dst.Close()

				written, err := io.Copy(dst, src)
				if err != nil {
					return fmt.Sprintf("error copying: %v", err)
				}

				return fmt.Sprintf(`{"backup_file":"%s","size":%d}`, backupFile, written)
			},
		},

		"list_tables": {
			Name:        "list_tables",
			Description: "Lists all tables in the database with row counts.",
			Signature:   `{}`,
			Category:    "Database",
			Execute: func(ctx context.Context, args map[string]interface{}) string {
				if tr.db == nil {
					return "error: database not configured"
				}

				rows, err := tr.db.QueryContext(ctx, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
				if err != nil {
					return fmt.Sprintf("error: %v", err)
				}
				defer rows.Close()

				var tables []string
				for rows.Next() {
					var name string
					rows.Scan(&name)
					tables = append(tables, name)
				}

				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("Tables (%d total)\n\n", len(tables)))
				for _, t := range tables {
					var count int
					tr.db.QueryRowContext(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %s", t)).Scan(&count)
					sb.WriteString(fmt.Sprintf("• %s (%d rows)\n", t, count))
				}

				return sb.String()
			},
		},
	}
}
