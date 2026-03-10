import { Database } from "bun:sqlite";

export function initSchema(db: Database) {
  db.run(`
        CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

  db.run(`
        CREATE TABLE IF NOT EXISTS tools_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tool_name TEXT,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT
        );
    `);
}
