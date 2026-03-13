import { Database } from "bun:sqlite";

export async function initTables(db: Database): Promise<void> {
  const createTablesSQL = `
    -- Gateways (Enhanced for Multi-Gateway Support)
    CREATE TABLE IF NOT EXISTS gateways (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      provider TEXT NOT NULL,
      endpoint TEXT,
      api_key_encrypted TEXT,
      default_model TEXT,
      models TEXT,
      require_pairing INTEGER DEFAULT 1,
      allow_public_bind INTEGER DEFAULT 0,
      workspace_only INTEGER DEFAULT 1,
      
      -- Agent configuration (JSON)
      agent_config TEXT,
      
      -- Skills and tools (JSON arrays)
      skills TEXT,
      tools TEXT,
      
      -- Daemon configuration
      daemon_enabled INTEGER DEFAULT 0,
      daemon_pid INTEGER,
      daemon_auto_restart INTEGER DEFAULT 1,
      daemon_port INTEGER DEFAULT 0,
      
      -- Routing configuration
      routing_config TEXT,
      
      -- Status and metadata
      config TEXT,
      status TEXT DEFAULT 'stopped',
      last_error TEXT,
      started_at INTEGER,
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
    
    -- System Config (Key-Value Store)
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

    -- Identity (OpenClaw style)
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
  `;

  // Use a transaction for initialization
  db.transaction(() => {
    db.run(createTablesSQL);
  })();
}
