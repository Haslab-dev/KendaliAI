/**
 * KendaliAI Database Manager - Lightweight SQLite
 */

import { Database } from "bun:sqlite";
import { drizzle, BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { join } from "path";

// Import schema
import * as schema from "./schema";

// Database singleton
let dbInstance: BunSQLiteDatabase<typeof schema> | null = null;
let sqlite: Database | null = null;

// ============================================
// Database Types
// ============================================

// Export the database type for use in other modules
export type KendaliDB = BunSQLiteDatabase<typeof schema>;

// ============================================
// Database Functions
// ============================================

/**
 * Initialize database connection
 */
export function initDatabase(
  dbPath: string = ".kendaliai/kendaliai.db",
): KendaliDB {
  if (dbInstance && sqlite?.filename === dbPath) return dbInstance;

  // Close existing if path changed
  if (sqlite && sqlite.filename !== dbPath) {
    sqlite.close();
    sqlite = null;
    dbInstance = null;
  }

  if (dbInstance) return dbInstance;

  // Ensure directory exists
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir) {
    try {
      // Create directory if needed
      const fs = require("fs");
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // Directory might already exist
    }
  }

  sqlite = new Database(dbPath);

  // Enable WAL mode for better performance
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA synchronous = NORMAL");
  sqlite.run("PRAGMA cache_size = 10000");
  sqlite.run("PRAGMA temp_store = MEMORY");

  dbInstance = drizzle(sqlite, { schema });

  return dbInstance;
}

/**
 * Get database instance
 */
export function getDatabase(): KendaliDB {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

/**
 * Get raw SQLite database for direct queries
 */
export function getRawDatabase(): Database | null {
  return sqlite;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    dbInstance = null;
  }
}

/**
 * Reset database (drop all tables and recreate)
 */
export async function resetDatabase(
  dbPath: string = ".kendaliai/kendaliai.db",
): Promise<void> {
  closeDatabase();

  // Delete existing database files
  const fs = require("fs");
  const files = [dbPath, dbPath + "-wal", dbPath + "-shm"];
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch {
      // File might not exist
    }
  }

  // Reinitialize
  sqlite = new Database(dbPath);

  // Create tables using raw SQL for initial setup
  const createTablesSQL = `
    -- Gateways
    CREATE TABLE IF NOT EXISTS gateways (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      endpoint TEXT,
      api_key_encrypted TEXT,
      default_model TEXT,
      models TEXT,
      require_pairing INTEGER DEFAULT 1,
      allow_public_bind INTEGER DEFAULT 0,
      workspace_only INTEGER DEFAULT 1,
      config TEXT,
      status TEXT DEFAULT 'stopped',
      last_error TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    
    -- Pairings
    CREATE TABLE IF NOT EXISTS pairings (
      id TEXT PRIMARY KEY,
      gateway_id TEXT NOT NULL,
      pairing_code TEXT NOT NULL,
      bearer_token TEXT,
      token_hash TEXT,
      status TEXT DEFAULT 'pending',
      paired_by TEXT,
      user_agent TEXT,
      created_at INTEGER,
      paired_at INTEGER,
      expires_at INTEGER,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id)
    );
    
    -- Channels
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      gateway_id TEXT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      credentials_encrypted TEXT,
      allowed_users TEXT,
      config TEXT,
      enabled INTEGER DEFAULT 1,
      status TEXT DEFAULT 'stopped',
      last_error TEXT,
      last_message_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id)
    );
    
    -- Memories
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      gateway_id TEXT,
      content TEXT NOT NULL,
      content_hash TEXT,
      source TEXT,
      source_id TEXT,
      embedding TEXT,
      embedding_model TEXT,
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER,
      last_accessed_at INTEGER,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id)
    );
    
    -- FTS5 virtual table for memories (hybrid search)
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      content='memories',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );
    
    -- Messages
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gateway_id TEXT,
      channel_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sender_id TEXT,
      sender_name TEXT,
      tokens INTEGER DEFAULT 0,
      model TEXT,
      latency_ms INTEGER,
      embedding TEXT,
      created_at INTEGER,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );
    
    -- Tools
    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT,
      description TEXT,
      input_schema TEXT,
      permission_level TEXT DEFAULT 'allowed',
      requires_confirmation INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      usage_count INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );
    
    -- Skills
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      version TEXT NOT NULL,
      description TEXT,
      instructions TEXT,
      manifest TEXT,
      audit_status TEXT DEFAULT 'pending',
      audit_notes TEXT,
      enabled INTEGER DEFAULT 1,
      installed_at INTEGER,
      updated_at INTEGER
    );
    
    -- Hooks
    CREATE TABLE IF NOT EXISTS hooks (
      id TEXT PRIMARY KEY,
      gateway_id TEXT,
      event TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT,
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id)
    );
    
    -- Tunnels
    CREATE TABLE IF NOT EXISTS tunnels (
      id TEXT PRIMARY KEY,
      gateway_id TEXT,
      provider TEXT NOT NULL,
      config TEXT,
      status TEXT DEFAULT 'stopped',
      public_url TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id)
    );
    
    -- Heartbeats
    CREATE TABLE IF NOT EXISTS heartbeats (
      id TEXT PRIMARY KEY,
      gateway_id TEXT,
      name TEXT NOT NULL,
      task TEXT NOT NULL,
      interval_minutes INTEGER DEFAULT 30,
      last_run_at INTEGER,
      next_run_at INTEGER,
      enabled INTEGER DEFAULT 0,
      status TEXT DEFAULT 'idle',
      last_result TEXT,
      last_error TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id)
    );
    
    -- Event Logs
    CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT,
      gateway_id TEXT,
      channel_id TEXT,
      correlation_id TEXT,
      created_at INTEGER,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );
    
    -- System Config
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_at INTEGER
    );
    
    -- Embedding Cache
    CREATE TABLE IF NOT EXISTS embedding_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT NOT NULL UNIQUE,
      input_text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      model TEXT NOT NULL,
      access_count INTEGER DEFAULT 0,
      last_accessed_at INTEGER,
      created_at INTEGER,
      expires_at INTEGER
    );
    
    -- Identity
    CREATE TABLE IF NOT EXISTS identity (
      id TEXT PRIMARY KEY,
      gateway_id TEXT NOT NULL,
      format TEXT DEFAULT 'openclaw',
      content TEXT,
      identity_md TEXT,
      soul_md TEXT,
      user_md TEXT,
      agents_md TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id)
    );
    
    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_pairings_gateway ON pairings(gateway_id);
    CREATE INDEX IF NOT EXISTS idx_pairings_code ON pairings(pairing_code);
    CREATE INDEX IF NOT EXISTS idx_channels_gateway ON channels(gateway_id);
    CREATE INDEX IF NOT EXISTS idx_memories_gateway ON memories(gateway_id);
    CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);
    CREATE INDEX IF NOT EXISTS idx_messages_gateway ON messages(gateway_id);
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(type);
    CREATE INDEX IF NOT EXISTS idx_event_logs_created ON event_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_cache_key ON embedding_cache(cache_key);
  `;

  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA synchronous = NORMAL");

  // Execute each statement
  const statements = createTablesSQL.split(";").filter((s) => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      sqlite.run(stmt);
    }
  }

  dbInstance = drizzle(sqlite, { schema });

  console.log("✅ Database reset complete");
}

// Export dbManager for compatibility
export const dbManager = {
  init: initDatabase,
  get: getDatabase,
  getRaw: getRawDatabase,
  close: closeDatabase,
  reset: resetDatabase,
};

export { schema };
