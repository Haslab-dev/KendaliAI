/**
 * KendaliAI Database Schema - ZeroClaw-Inspired Architecture
 *
 * Lightweight, optimized schema with:
 * - Gateway pairing system
 * - Channel allowlists
 * - Hybrid memory (FTS5 + vector)
 * - Secure credential storage
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================
// GATEWAYS - AI Provider Configurations
// ============================================
export const gateways = sqliteTable("gateways", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),

  // Provider configuration
  provider: text("provider").notNull(),
  endpoint: text("endpoint"),
  apiKeyEncrypted: text("api_key_encrypted"),
  defaultModel: text("default_model"),
  models: text("models"),

  // ZeroClaw-style security
  requirePairing: integer("require_pairing").default(1),
  allowPublicBind: integer("allow_public_bind").default(0),
  workspaceOnly: integer("workspace_only").default(1),

  // Agent & Capability Config
  agentConfig: text("agent_config"), // JSON
  skills: text("skills"), // JSON array
  tools: text("tools"), // JSON array

  // Daemon settings
  daemonEnabled: integer("daemon_enabled").default(0),
  daemonPid: integer("daemon_pid"),
  daemonAutoRestart: integer("daemon_auto_restart").default(1),
  daemonPort: integer("daemon_port"),

  // Routing
  routingConfig: text("routing_config"), // JSON

  // Runtime config
  config: text("config"),
  status: text("status").default("stopped"),
  lastError: text("last_error"),
  startedAt: integer("started_at", { mode: "timestamp" }),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// PAIRING - Gateway Security Pairing System
// ============================================
export const pairings = sqliteTable("pairings", {
  id: text("id").primaryKey(),
  gatewayId: text("gateway_id")
    .references(() => gateways.id)
    .notNull(),

  // 6-digit pairing code
  pairingCode: text("pairing_code").notNull(), // 6-digit code

  // Bearer token (generated after pairing)
  bearerToken: text("bearer_token"), // JWT or random token
  tokenHash: text("token_hash"), // Hashed token for verification

  // Status
  status: text("status").default("pending"), // "pending" | "paired" | "expired" | "revoked"

  // Metadata
  pairedBy: text("paired_by"), // IP or identifier
  userAgent: text("user_agent"),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  pairedAt: integer("paired_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});

// ============================================
// CHANNELS - Messaging Channel Configurations
// ============================================
export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  gatewayId: text("gateway_id").references(() => gateways.id),

  // Channel type
  type: text("type").notNull(), // "telegram" | "discord" | "slack" | "whatsapp" | "webhook"
  name: text("name").notNull(),

  // Channel credentials (encrypted)
  credentialsEncrypted: text("credentials_encrypted"), // JSON encrypted credentials

  // ZeroClaw-style allowlist (deny-by-default)
  allowedUsers: text("allowed_users"), // JSON array of allowed user IDs, ["*"] for all

  // Channel-specific config
  config: text("config"), // JSON for channel-specific config

  // Status
  enabled: integer("enabled").default(1),
  status: text("status").default("stopped"), // "stopped" | "running" | "error"
  lastError: text("last_error"),
  lastMessageAt: integer("last_message_at", { mode: "timestamp" }),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// MEMORY - Hybrid Memory System (FTS5 + Vector)
// ============================================
export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  gatewayId: text("gateway_id").references(() => gateways.id),

  // Memory content
  content: text("content").notNull(),
  contentHash: text("content_hash"), // SHA-256 hash for deduplication

  // Source metadata
  source: text("source"), // "user" | "agent" | "system" | "file"
  sourceId: text("source_id"), // Reference to source (message ID, file path, etc.)

  // Embedding vector (stored as JSON array)
  embedding: text("embedding"), // JSON array of floats
  embeddingModel: text("embedding_model"), // Model used for embedding

  // Memory metadata
  importance: real("importance").default(0.5), // 0.0 - 1.0 importance score
  accessCount: integer("access_count").default(0),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" }),
});

// ============================================
// MESSAGES - Message History
// ============================================
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gatewayId: text("gateway_id").references(() => gateways.id),
  channelId: text("channel_id").references(() => channels.id),

  // Message data
  role: text("role").notNull(), // "user" | "assistant" | "system"
  content: text("content").notNull(),

  // Sender info
  senderId: text("sender_id"), // User ID from channel
  senderName: text("sender_name"),

  // Metadata
  tokens: integer("tokens").default(0),
  model: text("model"), // Model used for response
  latencyMs: integer("latency_ms"), // Response latency

  // Embedding for RAG
  embedding: text("embedding"), // JSON array for semantic search

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// TOOLS - Tool Registry
// ============================================
export const tools = sqliteTable("tools", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),

  // Tool definition
  category: text("category"), // "shell" | "file" | "http" | "browser" | "custom"
  description: text("description"),
  inputSchema: text("input_schema"), // JSON Schema for input

  // Security
  permissionLevel: text("permission_level").default("allowed"), // "allowed" | "restricted" | "forbidden"
  requiresConfirmation: integer("requires_confirmation").default(0),

  // Usage tracking
  enabled: integer("enabled").default(1),
  usageCount: integer("usage_count").default(0),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// SKILLS - ZeroClaw-style Skills System
// ============================================
export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  version: text("version").notNull(),

  // Skill definition
  description: text("description"),
  instructions: text("instructions"), // SKILL.md content
  manifest: text("manifest"), // TOML manifest as JSON

  // Security audit
  auditStatus: text("audit_status").default("pending"), // "pending" | "approved" | "rejected"
  auditNotes: text("audit_notes"),

  // Status
  enabled: integer("enabled").default(1),

  // Timestamps
  installedAt: integer("installed_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// HOOKS - Lifecycle Event Hooks
// ============================================
export const hooks = sqliteTable("hooks", {
  id: text("id").primaryKey(),
  gatewayId: text("gateway_id").references(() => gateways.id),

  // Hook definition
  event: text("event").notNull(), // "boot" | "message" | "command" | "error"
  name: text("name").notNull(),

  // Hook config
  config: text("config"), // JSON configuration

  // Execution
  priority: integer("priority").default(0),
  enabled: integer("enabled").default(1),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// TUNNELS - Tunnel Configuration
// ============================================
export const tunnels = sqliteTable("tunnels", {
  id: text("id").primaryKey(),
  gatewayId: text("gateway_id").references(() => gateways.id),

  // Tunnel type
  provider: text("provider").notNull(), // "none" | "cloudflare" | "tailscale" | "ngrok" | "custom"

  // Tunnel config
  config: text("config"), // JSON configuration (encrypted if sensitive)

  // Status
  status: text("status").default("stopped"), // "stopped" | "running" | "error"
  publicUrl: text("public_url"), // Public URL when tunnel is active

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// HEARTBEATS - Scheduled Tasks
// ============================================
export const heartbeats = sqliteTable("heartbeats", {
  id: text("id").primaryKey(),
  gatewayId: text("gateway_id").references(() => gateways.id),

  // Task definition
  name: text("name").notNull(),
  task: text("task").notNull(), // Task to execute

  // Schedule
  intervalMinutes: integer("interval_minutes").default(30),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),

  // Status
  enabled: integer("enabled").default(0),
  status: text("status").default("idle"), // "idle" | "running" | "error"
  lastResult: text("last_result"),
  lastError: text("last_error"),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// EVENT LOGS - System Observability
// ============================================
export const eventLogs = sqliteTable("event_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Event classification
  type: text("type").notNull(), // "gateway" | "channel" | "tool" | "memory" | "system"
  level: text("level").notNull(), // "debug" | "info" | "warn" | "error"

  // Event data
  message: text("message").notNull(),
  data: text("data"), // JSON additional data

  // Context
  gatewayId: text("gateway_id").references(() => gateways.id),
  channelId: text("channel_id").references(() => channels.id),
  correlationId: text("correlation_id"), // For tracing related events

  // Timestamp
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// SYSTEM CONFIG - Key-Value Store
// ============================================
export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value"),
  description: text("description"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// ============================================
// EMBEDDING CACHE - Response/Embedding Cache
// ============================================
export const embeddingCache = sqliteTable("embedding_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Cache key (hash of input)
  cacheKey: text("cache_key").notNull().unique(),

  // Cached data
  inputText: text("input_text").notNull(),
  embedding: text("embedding").notNull(), // JSON array
  model: text("model").notNull(),

  // LRU tracking
  accessCount: integer("access_count").default(0),
  lastAccessedAt: integer("last_accessed_at", { mode: "timestamp" }),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});

// ============================================
// IDENTITY - AIEOS/OpenClaw Identity System
// ============================================
export const identity = sqliteTable("identity", {
  id: text("id").primaryKey(),
  gatewayId: text("gateway_id")
    .references(() => gateways.id)
    .notNull(),

  // Identity format
  format: text("format").default("openclaw"), // "openclaw" | "aieos"

  // Identity content
  content: text("content"), // JSON for AIEOS, markdown for OpenClaw

  // Identity sections (OpenClaw style)
  identityMd: text("identity_md"), // IDENTITY.md content
  soulMd: text("soul_md"), // SOUL.md content
  userMd: text("user_md"), // USER.md content
  agentsMd: text("agents_md"), // AGENTS.md content

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
