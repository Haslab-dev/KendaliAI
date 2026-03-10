import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================
// Users Table - PRD Section 24
// ============================================
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").default("user").notNull(), // "admin" | "user"
  apiKey: text("api_key").unique(),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Agents Table - PRD Section 9
// ============================================
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("active").notNull(), // "active" | "inactive" | "busy"
  gatewayId: text("gateway_id"),
  systemPrompt: text("system_prompt"),
  model: text("model").default("gpt-4o"),
  capabilities: text("capabilities"), // JSON array of capabilities
  tools: text("tools"), // JSON array of tool names
  temperature: text("temperature").default("0.7"),
  maxTokens: integer("max_tokens").default(4096),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Tasks Table - PRD Section 9
// ============================================
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").references(() => agents.id),
  description: text("description").notNull(),
  status: text("status").default("pending").notNull(), // "pending" | "in_progress" | "completed" | "failed"
  priority: text("priority").default("normal"), // "low" | "normal" | "high"
  result: text("result"),
  error: text("error"),
  metadata: text("metadata"), // JSON for additional data
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
  completedAt: text("completed_at"),
});

// ============================================
// Task Steps Table - PRD Section 9
// ============================================
export const taskSteps = sqliteTable("task_steps", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .references(() => tasks.id)
    .notNull(),
  stepOrder: integer("step_order").notNull(),
  action: text("action").notNull(),
  status: text("status").default("pending").notNull(), // "pending" | "running" | "completed" | "failed"
  input: text("input"), // JSON input data
  output: text("output"), // JSON output data
  error: text("error"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Workflows Table - PRD Section 11
// ============================================
export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("draft").notNull(), // "draft" | "active" | "paused" | "archived"
  nodes: text("nodes"), // JSON array of workflow nodes
  edges: text("edges"), // JSON array of connections
  triggers: text("triggers"), // JSON array of trigger configurations
  variables: text("variables"), // JSON object of workflow variables
  lastRunAt: text("last_run_at"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Workflow Runs Table - Track workflow executions
// ============================================
export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id")
    .references(() => workflows.id)
    .notNull(),
  status: text("status").default("running").notNull(), // "running" | "completed" | "failed" | "cancelled"
  trigger: text("trigger"), // What triggered this run
  input: text("input"), // JSON input data
  output: text("output"), // JSON output data
  error: text("error"),
  startedAt: text("started_at").default(sql`(CURRENT_TIMESTAMP)`),
  completedAt: text("completed_at"),
});

// ============================================
// Gateways Table - AI Provider configurations
// ============================================
export const gateways = sqliteTable("gateways", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(), // "openai" | "anthropic" | "ollama" | "vllm"
  endpoint: text("endpoint"), // Custom API endpoint
  apiKey: text("api_key"),
  models: text("models"), // JSON array of available models
  defaultModel: text("default_model"),
  isDefault: integer("is_default").default(0),
  config: text("config"), // JSON for provider-specific config
  status: text("status").default("active"), // "active" | "inactive" | "error"
  lastError: text("last_error"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Plugins Table - PRD Section 15
// ============================================
export const plugins = sqliteTable("plugins", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  description: text("description"),
  author: text("author"),
  enabled: integer("enabled").default(1),
  config: text("config"), // JSON plugin configuration
  manifest: text("manifest"), // JSON manifest content
  installedAt: text("installed_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Tools Table - PRD Section 13
// ============================================
export const tools = sqliteTable("tools", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category"), // "browser" | "filesystem" | "messaging" | "system" | "custom"
  description: text("description"),
  schema: text("schema"), // JSON schema for input validation
  permissionLevel: text("permission_level").default("allowed"), // "allowed" | "restricted" | "disabled"
  enabled: integer("enabled").default(1),
  pluginId: text("plugin_id").references(() => plugins.id), // If tool is from a plugin
  usageCount: integer("usage_count").default(0),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Messages Table - PRD Section 12
// ============================================
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adapter: text("adapter").notNull(), // "telegram" | "discord" | "whatsapp"
  sender: text("sender").notNull(),
  recipient: text("recipient"),
  payload: text("payload").notNull(),
  messageType: text("message_type").default("text"), // "text" | "command" | "media"
  metadata: text("metadata"), // JSON for additional data
  processed: integer("processed").default(0),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// AI Usage Table - PRD Section 7 (Usage Tracking)
// ============================================
export const aiUsage = sqliteTable("ai_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  gatewayId: text("gateway_id").references(() => gateways.id),
  requestId: text("request_id"),
  tokensIn: integer("tokens_in").default(0),
  tokensOut: integer("tokens_out").default(0),
  totalTokens: integer("total_tokens").default(0),
  cost: text("cost").default("0"), // Cost in USD
  latencyMs: integer("latency_ms"), // Response latency in milliseconds
  status: text("status").default("success"), // "success" | "error" | "timeout"
  errorMessage: text("error_message"),
  agentId: text("agent_id").references(() => agents.id),
  workflowRunId: text("workflow_run_id").references(() => workflowRuns.id),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Cache Table - PRD Section 7 (Request Caching)
// ============================================
export const cache = sqliteTable("cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  contentType: text("content_type").default("application/json"),
  hits: integer("hits").default(0),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// System Config Table - General system settings
// ============================================
export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value"),
  description: text("description"),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Tools Log Table - Tool execution history
// ============================================
export const toolsLog = sqliteTable("tools_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolName: text("tool_name").notNull(),
  taskId: text("task_id").references(() => tasks.id),
  workflowRunId: text("workflow_run_id").references(() => workflowRuns.id),
  input: text("input"), // JSON input
  output: text("output"), // JSON output
  status: text("status").notNull(), // "success" | "error" | "timeout"
  error: text("error"),
  executionTimeMs: integer("execution_time_ms"),
  executedAt: text("executed_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// Event Logs Table - System observability
// ============================================
export const eventLogs = sqliteTable("event_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // "agent" | "tool" | "workflow" | "gateway" | "system"
  level: text("level").notNull(), // "info" | "warn" | "error" | "debug"
  message: text("message").notNull(),
  data: text("data"), // JSON additional data
  source: text("source"), // Module/component that generated the event
  correlationId: text("correlation_id"), // For tracing related events
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// ============================================
// API Keys Table - Auth system
// ============================================
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(), // First 8 chars for identification
  permissions: text("permissions"), // JSON permissions array
  lastUsedAt: text("last_used_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  revokedAt: text("revoked_at"),
});
