#!/usr/bin/env bun
/**
 * KendaliAI Minimal CLI - Lightweight Binary Entry Point
 * 
 * ZeroClaw-inspired minimal binary for gateway + channel operations.
 * No React dashboard, no Vite - pure CLI for maximum performance.
 * 
 * Usage:
 *   bun run src/cli-minimal.ts [command] [options]
 *   bun build --compile --minify src/cli-minimal.ts --outfile kendaliai
 * 
 * Multi-Gateway Commands:
 *   kendaliai gateway create <name>     Create new gateway
 *   kendaliai gateway start <name>      Start gateway
 *   kendaliai gateway stop <name>       Stop gateway
 *   kendaliai gateway restart <name>    Restart gateway
 *   kendaliai gateway list               List all gateways
 *   kendaliai gateway show <name>        Show gateway details
 *   kendaliai gateway delete <name>     Delete gateway
 *   kendaliai gateway logs <name>       View gateway logs
 *   kendaliai status                     Show all gateway status
 */

import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";
import { securityManager } from "./server/security";
import { encrypt, decrypt } from "./server/security/encryption";

// ============================================
// CLI Version
// ============================================

const VERSION = "0.2.0";

// ============================================
// Global State
// ============================================

let db: Database | null = null;

// Directory paths
const KENDALIAI_DIR = join(process.env.HOME || "", ".kendaliai");
const GATEWAYS_DIR = join(KENDALIAI_DIR, "gateways");
const RUN_DIR = join(KENDALIAI_DIR, "run");
const LOGS_DIR = join(KENDALIAI_DIR, "logs");
const DATA_DIR = join(KENDALIAI_DIR, "data");

// Ensure directories exist
function ensureDirectories(): void {
  [KENDALIAI_DIR, GATEWAYS_DIR, RUN_DIR, LOGS_DIR, DATA_DIR].forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });
}

// ============================================
// Database Helper
// ============================================

function ensureDirectory(filePath: string): void {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir) {
    try {
      const fs = require("fs");
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
    // Log directory creation errors but continue
    console.error(`Failed to create directory: ${error}`);
  }
  }
}

function getDb(dbPath: string = ".kendaliai/data.db"): Database {
  if (db) return db;
  ensureDirectories();
  // Use DATA_DIR if path is default
  const actualPath = dbPath === ".kendaliai/data.db" ? join(DATA_DIR, "kendaliai.db") : dbPath;
  ensureDirectory(actualPath);
  db = new Database(actualPath);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  return db;
}

function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================
// Argument Parser
// ============================================

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    // Global options
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
    config: { type: "string", short: "c", default: ".kendaliai/config.toml" },
    
    // Gateway options
    port: { type: "string", short: "p", default: "42617" },
    host: { type: "string", default: "127.0.0.1" },
    
    // Pairing options
    "pairing-code": { type: "string" },
    
    // Provider options
    provider: { type: "string" },
    model: { type: "string" },
    "api-key": { type: "string" },
    "api-url": { type: "string" },
    
    // Channel options
    channel: { type: "string" },
    "bot-token": { type: "string" },
    "allowed-users": { type: "string" },
    
    // Memory options
    "embedding-provider": { type: "string", default: "none" },
    
    // Security options
    "require-pairing": { type: "boolean", default: true },
    "allow-public": { type: "boolean", default: false },
    "workspace-only": { type: "boolean", default: true },
    
    // Database options
    "db-path": { type: "string", default: ".kendaliai/data.db" },
    "reset-db": { type: "boolean", default: false },
    
    // Message options
    message: { type: "string", short: "m" },
    
    // Gateway options for multi-gateway support
    gateway: { type: "string", short: "g" },
    daemon: { type: "boolean", short: "d", default: false },
    force: { type: "boolean", short: "f", default: false },
    follow: { type: "boolean", short: "F", default: false },
  },
  strict: false,
});

// Get string value helper
function getString(key: string, defaultValue: string = ""): string {
  const val = (values as Record<string, unknown>)[key];
  if (typeof val === "string") return val;
  if (typeof val === "boolean") return defaultValue;
  return defaultValue;
}

// ============================================
// Command Handlers
// ============================================

async function handleHelp(): Promise<void> {
  console.log(`
KendaliAI CLI v${VERSION} - Multi-Gateway AI Orchestration Platform

USAGE:
  kendaliai <command> [options]

COMMANDS:
  onboard              Quick setup wizard
  gateway              Start the gateway server (legacy)
  daemon               Start Telegram bot with AI (legacy)
  agent                Chat with AI agent
  pairing              Manage pairing codes
  channel              Manage messaging channels
  routing              Manage channel-to-gateway routing
  skills               Manage skills (install, list, audit)
  status               Show system status
  doctor               Run diagnostics
  reset                Reset database

GATEWAY MANAGEMENT (Multi-Gateway):
  gateway create <name>     Create new gateway
  gateway start <name>      Start gateway
  gateway start <name> -d   Start as daemon
  gateway stop <name>       Stop gateway
  gateway stop <name> -f    Force stop
  gateway restart <name>    Restart gateway
  gateway list              List all gateways
  gateway show <name>       Show gateway details
  gateway delete <name>     Delete gateway
  gateway logs <name>       View gateway logs
  gateway logs <name> -f    Follow logs

DAEMON MANAGEMENT:
  daemon status             Show daemon status
  daemon stop-all           Stop all daemons
  daemon restart-all        Restart all daemons
  daemon health <name>      Check daemon health

ROUTING MANAGEMENT:
  routing list                     List all channel bindings
  routing bind <ch> <gw>           Bind channel to gateway
  routing unbind <ch> <gw>         Unbind channel from gateway
  routing show <channel-id>        Show routing config for channel
  routing set-mode <gw> <mode>     Set routing mode for gateway
  routing set-prefix <gw> <prefix> Set prefix for prefix routing
  routing set-keywords <gw> <kw>   Set keywords for keyword routing

SKILLS MANAGEMENT:
  skills list                List installed skills
  skills install <source>   Install a skill
  skills audit <name>       Audit a skill for security
  skills new <name>         Scaffold a new skill
  skills remove <name>      Remove a skill

GATEWAY OPTIONS:
  -p, --port <port>    Gateway port (default: 42617)
  --host <host>        Gateway host (default: 127.0.0.1)
  --require-pairing    Require pairing code (default: true)
  --allow-public       Allow public binding (default: false)
  -d, --daemon         Run as background daemon
  -f, --force          Force stop

PROVIDER OPTIONS:
  --provider <name>    AI provider (openai, anthropic, ollama, zai, deepseek)
  --model <model>      Model name
  --api-key <key>      API key
  --api-url <url>      Custom API endpoint

CHANNEL OPTIONS:
  --channel <type>     Channel type (telegram, discord, slack)
  --bot-token <token>  Bot token
  --allowed-users <users>  Comma-separated allowed user IDs

SECURITY OPTIONS:
  --workspace-only     Restrict file access to workspace (default: true)

DATABASE OPTIONS:
  --db-path <path>     Database path (default: .kendaliai/data.db)
  --reset-db           Reset database on startup

EXAMPLES:
  # Quick setup
  kendaliai onboard --provider openai --api-key sk-...

  # Create and manage multiple gateways
  kendaliai gateway create dev-assistant --provider zai --model zai-1
  kendaliai gateway create support-bot --provider deepseek
  kendaliai gateway start dev-assistant --daemon
  kendaliai gateway list
  kendaliai status

  # Manage skills
  kendaliai skills list
  kendaliai skills new my-skill
  kendaliai skills install namespace/name

  # Chat with agent
  kendaliai agent -m "Hello, KendaliAI!"

  # Create pairing code
  kendaliai pairing create

  # Bind Telegram user
  kendaliai channel bind-telegram 123456789
`);
}

async function handleVersion(): Promise<void> {
  console.log(`KendaliAI v${VERSION}`);
}

async function handleOnboard(): Promise<void> {
  console.log("🚀 KendaliAI Onboarding\n");
  
  const dbPath = getString("db-path", ".kendaliai/data.db");
  
  // Initialize database
  console.log("📁 Initializing database...");
  const database = getDb(dbPath);
  
  // Create tables if not exist
  await initTables(database);
  
  // Create default gateway
  const gatewayId = `gw_${randomUUID().slice(0, 8)}`;
  let provider = getString("provider", "openai");
  let model = getString("model", "");
  const apiKey = getString("api-key");
  let apiUrl = getString("api-url", "");
  
  if (!apiKey) {
    console.error("❌ Error: --api-key is required for onboarding");
    process.exit(1);
  }
  
  // OpenAI-compatible provider auto-configuration
  const openaiCompatibleProviders: Record<string, { endpoint: string; defaultModel: string }> = {
    deepseek: { endpoint: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
    zai: { endpoint: "https://api.z.ai/api/coding/paas/v4", defaultModel: "zai-1" },
    openrouter: { endpoint: "https://openrouter.ai/api/v1", defaultModel: "openrouter/auto" },
    together: { endpoint: "https://api.together.xyz/v1", defaultModel: "togethercomputer/CodeLlama-34b-Instruct" },
    groq: { endpoint: "https://api.groq.com/openai/v1", defaultModel: "llama-3.1-70b-versatile" },
  };
  
  // Auto-configure OpenAI-compatible providers
  if (provider in openaiCompatibleProviders) {
    const config = openaiCompatibleProviders[provider];
    if (!apiUrl) {
      apiUrl = config.endpoint;
    }
    if (!model) {
      model = config.defaultModel;
    }
    console.log(`🔧 Provider '${provider}' configured as OpenAI-compatible`);
    console.log(`   Endpoint: ${apiUrl}`);
    console.log(`   Model: ${model}`);
  } else {
    // Default model for native providers
    if (!model) {
      if (provider === "openai") model = "gpt-4o";
      else if (provider === "anthropic") model = "claude-3-5-sonnet-20241022";
      else if (provider === "ollama") model = "llama3.2";
      else model = "default";
    }
  }
  
  console.log(`🔧 Creating gateway with provider: ${provider}`);
  
  const now = Date.now();
  
  // Check if default gateway already exists
  const existingGateway = database.query<{ id: string }, []>(`
    SELECT id FROM gateways WHERE name = 'default'
  `).get();
  
  if (existingGateway) {
    // Update existing gateway
    database.run(`
      UPDATE gateways SET
        provider = ?,
        endpoint = ?,
        default_model = ?,
        api_key_encrypted = ?,
        require_pairing = ?,
        allow_public_bind = ?,
        workspace_only = ?,
        updated_at = ?
      WHERE id = ?
    `, [
      provider,
      apiUrl || null,
      model,
      encrypt(apiKey), // Encrypt API key before storing
      values["require-pairing"] ? 1 : 0,
      values["allow-public"] ? 1 : 0,
      values["workspace-only"] ? 1 : 0,
      now,
      existingGateway.id,
    ]);
    
    // Create pairing code
    console.log("🔐 Generating pairing code...");
    const result = await securityManager.createPairing(existingGateway.id);
    
    if (result.success && result.pairingCode) {
      console.log(`\n✅ Gateway updated!`);
      console.log(`\n📋 Pairing Code: ${result.pairingCode}`);
      console.log(`   Use this code to pair your client with the gateway.`);
      console.log(`\n🚀 Start gateway with: kendaliai gateway`);
    } else {
      console.error("❌ Failed to create pairing code");
    }
    return;
  }
  
  // Insert new gateway
  database.run(`
    INSERT INTO gateways (
      id, name, provider, endpoint, default_model, api_key_encrypted,
      require_pairing, allow_public_bind, workspace_only, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    gatewayId,
    "default",
    provider,
    apiUrl || null,
    model,
    encrypt(apiKey), // Encrypt API key
    values["require-pairing"] ? 1 : 0,
    values["allow-public"] ? 1 : 0,
    values["workspace-only"] ? 1 : 0,
    "stopped",
    now,
    now,
  ]);
  
  // Create pairing code
  console.log("🔐 Generating pairing code...");
  const result = await securityManager.createPairing(gatewayId);
  
  if (result.success && result.pairingCode) {
    console.log(`\n✅ Onboarding complete!`);
    console.log(`\n📋 Pairing Code: ${result.pairingCode}`);
    console.log(`   Use this code to pair your client with the gateway.`);
    console.log(`\n🚀 Start gateway with: kendaliai gateway`);
  } else {
    console.error("❌ Failed to create pairing code");
  }
}

async function handleGateway(): Promise<void> {
  const port = parseInt(getString("port", "42617"));
  const host = getString("host", "127.0.0.1");
  const dbPath = getString("db-path", ".kendaliai/data.db");
  
  console.log(`🚀 Starting KendaliAI Gateway on ${host}:${port}\n`);
  
  // Initialize database
  const database = getDb(dbPath);
  await initTables(database);
  
  // Get gateway with full config
  const gateway = database.query<{ 
    id: string; 
    name: string; 
    provider: string; 
    default_model: string;
    endpoint: string | null;
    api_key_encrypted: string | null;
  }, []>(`
    SELECT id, name, provider, default_model, endpoint, api_key_encrypted FROM gateways LIMIT 1
  `).get();
  
  if (!gateway) {
    console.log("⚠️  No gateway found. Run 'kendaliai onboard' first.");
    return;
  }
  
  // Decrypt API key for use (with fallback for plain text)
  let apiKey: string;
  try {
    apiKey = gateway.api_key_encrypted ? decrypt(gateway.api_key_encrypted) : "";
  } catch {
    // Backward compatibility: try plain text if decryption fails
    apiKey = gateway.api_key_encrypted || "";
  }
  
  // Update gateway status to running
  database.run(`UPDATE gateways SET status = 'running', updated_at = ? WHERE id = ?`, [Date.now(), gateway.id]);
  
  // Check pairing status
  const pairingStatus = await securityManager.getPairingStatus(gateway.id);
  
  if (!pairingStatus.isPaired && pairingStatus.pairingCode) {
    console.log(`🔐 Gateway not paired.`);
    console.log(`   Pairing Code: ${pairingStatus.pairingCode}`);
    console.log(`   Expires in 5 minutes.\n`);
  }
  
  // Check if public binding is allowed
  if (host === "0.0.0.0" && !values["allow-public"]) {
    console.error("❌ Error: Public binding requires --allow-public or active tunnel");
    console.log("   Use --host 127.0.0.1 for local-only binding");
    process.exit(1);
  }
  
  // Get Telegram channel
  const channel = database.query<{ 
    id: string; 
    config: string; 
    allowed_users: string; 
  }, []>(`
    SELECT id, config, allowed_users FROM channels WHERE type = 'telegram' AND enabled = 1 LIMIT 1
  `).get();
  
  // Parse Telegram config
  let botToken: string | null = null;
  let allowedUsers: string[] = [];
  
  if (channel) {
    try {
      const config = JSON.parse(channel.config);
      botToken = config.botToken;
    } catch {}
    try {
      allowedUsers = JSON.parse(channel.allowed_users || "[]");
    } catch {}
  }
  
  // Determine API endpoint for AI calls
  let apiUrl = gateway.endpoint;
  if (!apiUrl) {
    const defaultEndpoints: Record<string, string> = {
      openai: "https://api.openai.com/v1",
      deepseek: "https://api.deepseek.com/v1",
      zai: "https://api.z.ai/api/coding/paas/v4",
      openrouter: "https://openrouter.ai/api/v1",
    };
    apiUrl = defaultEndpoints[gateway.provider] || "https://api.openai.com/v1";
  }
  
  // AI call helper
  async function callAI(userMessage: string): Promise<string> {
    try {
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: gateway!.default_model,
          messages: [{ role: "user", content: userMessage }],
          stream: false,
        }),
      });
      
      if (!response.ok) return `❌ API Error: ${response.status}`;
      
      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      
      return data.choices?.[0]?.message?.content || "No response";
    } catch (error) {
      return `❌ Error: ${error}`;
    }
  }
  
  // Start HTTP server
  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(request) {
      const url = new URL(request.url);
      
      // Health check (always public)
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok", version: VERSION }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      
      // Status endpoint
      if (url.pathname === "/status") {
        return new Response(JSON.stringify({
          gateway: gateway!.name,
          provider: gateway!.provider,
          model: gateway!.default_model,
          paired: pairingStatus.isPaired,
          telegram: channel ? "connected" : "not configured",
          version: VERSION,
        }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      
      // OpenAI-compatible chat completions endpoint
      if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        const token = auth.slice(7);
        const valid = await securityManager.verifyBearerToken(gateway!.id, token);
        
        if (!valid) {
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        try {
          const body = await request.json() as {
            messages?: Array<{ role: string; content: string }>;
            model?: string;
            stream?: boolean;
          };
          
          const lastMessage = body.messages?.filter(m => m.role === "user").pop();
          if (!lastMessage) {
            return new Response(JSON.stringify({ error: "No user message" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          
          const aiResponse = await callAI(lastMessage.content);
          
          // OpenAI-compatible response
          return new Response(JSON.stringify({
            id: `chatcmpl-${randomUUID().slice(0, 8)}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: gateway!.default_model,
            choices: [{
              index: 0,
              message: { role: "assistant", content: aiResponse },
              finish_reason: "stop",
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      
      // Pairing endpoint
      if (url.pathname === "/pair" && request.method === "POST") {
        const pairingCode = request.headers.get("X-Pairing-Code");
        if (!pairingCode) {
          return new Response(JSON.stringify({ error: "Missing pairing code" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        const result = await securityManager.completePairing(
          gateway!.id,
          pairingCode,
          { ip: request.headers.get("X-Forwarded-For") || "unknown" }
        );
        
        if (result.success) {
          return new Response(JSON.stringify({ 
            success: true, 
            token: result.bearerToken 
          }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      
      // Webhook endpoint (requires auth)
      if (url.pathname === "/webhook" && request.method === "POST") {
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        const token = auth.slice(7);
        const valid = await securityManager.verifyBearerToken(gateway!.id, token);
        
        if (!valid) {
          return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        // Process webhook
        const body = await request.json();
        return new Response(JSON.stringify({ 
          success: true, 
          message: "Webhook received",
          data: body 
        }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      
      // 404 for unknown routes
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  
  console.log(`✅ Gateway HTTP server running at http://${host}:${port}`);
  console.log(`   Health:    http://${host}:${port}/health`);
  console.log(`   Status:    http://${host}:${port}/status`);
  console.log(`   Chat:      POST http://${host}:${port}/v1/chat/completions`);
  console.log(`   Pair:      POST http://${host}:${port}/pair`);
  console.log(`   Webhook:   POST http://${host}:${port}/webhook`);
  
  // Start Telegram bot if configured
  if (botToken && channel) {
    console.log(`\n📱 Starting Telegram bot...`);
    await startTelegramBot(botToken, channel.id, gateway, apiUrl, apiKey, allowedUsers, database);
  } else {
    console.log(`\n⚠️  No Telegram bot configured.`);
    console.log(`   Run: kendaliai channel add-telegram --bot-token <token>`);
  }
  
  console.log(`\nPress Ctrl+C to stop`);
}

async function handleAgent(): Promise<void> {
  const message = getString("message", "");
  const dbPath = getString("db-path", ".kendaliai/data.db");
  
  if (!message) {
    console.log("💬 Interactive mode (not implemented in minimal CLI)");
    console.log("   Use -m \"your message\" for single message mode");
    return;
  }
  
  console.log(`💬 Sending message: ${message}\n`);
  
  // Initialize database
  const database = getDb(dbPath);
  
  // Get gateway with full config
  const gateway = database.query<{ 
    id: string; 
    provider: string; 
    default_model: string; 
    endpoint: string | null;
    api_key_encrypted: string | null;
  }, []>(`
    SELECT id, provider, default_model, endpoint, api_key_encrypted FROM gateways LIMIT 1
  `).get();
  
  if (!gateway) {
    console.error("❌ No gateway found. Run 'kendaliai onboard' first.");
    return;
  }
  
  if (!gateway.api_key_encrypted) {
    console.error("❌ No API key configured. Run 'kendaliai onboard' first.");
    return;
  }
  
  // Decrypt API key
  let apiKey: string;
  try {
    apiKey = decrypt(gateway.api_key_encrypted);
  } catch {
    // Backward compatibility
    apiKey = gateway.api_key_encrypted;
  }
  
  // Determine API endpoint based on provider
  let apiUrl = gateway.endpoint;
  if (!apiUrl) {
    // Default endpoints for known providers
    const defaultEndpoints: Record<string, string> = {
      openai: "https://api.openai.com/v1",
      deepseek: "https://api.deepseek.com/v1",
      zai: "https://api.z.ai/api/coding/paas/v4",
      openrouter: "https://openrouter.ai/api/v1",
      anthropic: "https://api.anthropic.com/v1",
    };
    apiUrl = defaultEndpoints[gateway.provider] || "https://api.openai.com/v1";
  }
  
  console.log(`🔄 Calling ${gateway.provider} (${gateway.default_model})...`);
  
  try {
    // Make OpenAI-compatible API request
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: gateway.default_model,
        messages: [
          { role: "user", content: message }
        ],
        stream: false,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`\n❌ API Error (${response.status}): ${errorText}`);
      return;
    }
    
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    
    if (data.error) {
      console.error(`\n❌ API Error: ${data.error.message}`);
      return;
    }
    
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      console.log(`\n🤖 Response:\n`);
      console.log(content);
    } else {
      console.error("\n❌ No response content received");
    }
  } catch (error) {
    console.error(`\n❌ Request failed: ${error}`);
  }
}

async function handlePairing(): Promise<void> {
  const dbPath = getString("db-path", ".kendaliai/data.db");
  const database = getDb(dbPath);
  
  const subCommand = positionals[1];
  
  if (subCommand === "create") {
    const gateway = database.query<{ id: string }, []>(`
      SELECT id FROM gateways LIMIT 1
    `).get();
    
    if (!gateway) {
      console.error("❌ No gateway found. Run 'kendaliai onboard' first.");
      return;
    }
    
    const result = await securityManager.createPairing(gateway.id);
    
    if (result.success && result.pairingCode) {
      console.log(`🔐 Pairing Code: ${result.pairingCode}`);
      console.log(`   Expires in 5 minutes`);
      console.log(`\n   Use this code to pair your client:`);
      console.log(`   POST /pair with header X-Pairing-Code: ${result.pairingCode}`);
    }
  } else if (subCommand === "status") {
    const gateway = database.query<{ id: string }, []>(`
      SELECT id FROM gateways LIMIT 1
    `).get();
    
    if (!gateway) {
      console.error("❌ No gateway found.");
      return;
    }
    
    const status = await securityManager.getPairingStatus(gateway.id);
    console.log(`Paired: ${status.isPaired}`);
    if (status.pairingCode) {
      console.log(`Pending Code: ${status.pairingCode}`);
      if (status.expiresAt) {
        console.log(`Expires: ${status.expiresAt.toISOString()}`);
      }
    }
  } else {
    console.log("Usage: kendaliai pairing [create|status]");
  }
}

async function handleChannel(): Promise<void> {
  const dbPath = getString("db-path", ".kendaliai/data.db");
  const database = getDb(dbPath);
  
  const subCommand = positionals[1];
  
  if (subCommand === "bind-telegram") {
    const userId = positionals[2];
    if (!userId) {
      console.error("❌ Error: User ID required");
      console.log("   Usage: kendaliai channel bind-telegram <user_id>");
      return;
    }
    
    const channel = database.query<{ id: string }, []>(`
      SELECT id FROM channels WHERE type = 'telegram' LIMIT 1
    `).get();
    
    if (!channel) {
      // Create telegram channel
      const channelId = `ch_${randomUUID().slice(0, 8)}`;
      const gateway = database.query<{ id: string }, []>(`
        SELECT id FROM gateways LIMIT 1
      `).get();
      
      const now = Date.now();
      database.run(`
        INSERT INTO channels (id, gateway_id, type, name, allowed_users, enabled, status, created_at, updated_at)
        VALUES (?, ?, 'telegram', 'Telegram Bot', ?, 1, 'stopped', ?, ?)
      `, [channelId, gateway?.id || null, JSON.stringify([userId]), now, now]);
      
      console.log(`✅ Added user ${userId} to new Telegram channel allowlist`);
    } else {
      await securityManager.addToAllowlist(channel.id, userId);
      console.log(`✅ Added user ${userId} to Telegram channel allowlist`);
    }
  } else if (subCommand === "add-telegram") {
    // Add Telegram channel with bot token
    const botToken = getString("bot-token", "");
    
    if (!botToken) {
      console.error("❌ Error: --bot-token is required");
      console.log("   Usage: kendaliai channel add-telegram --bot-token <token>");
      return;
    }
    
    const gateway = database.query<{ id: string }, []>(`
      SELECT id FROM gateways LIMIT 1
    `).get();
    
    if (!gateway) {
      console.error("❌ No gateway found. Run 'kendaliai onboard' first.");
      return;
    }
    
    // Check if telegram channel already exists
    const existingChannel = database.query<{ id: string }, [string]>(`
      SELECT id FROM channels WHERE type = 'telegram' AND gateway_id = ?
    `).get(gateway.id);
    
    const now = Date.now();
    
    if (existingChannel) {
      // Update existing channel
      database.run(`
        UPDATE channels SET config = ?, updated_at = ? WHERE id = ?
      `, [JSON.stringify({ botToken }), now, existingChannel.id]);
      console.log(`✅ Updated Telegram channel with new bot token`);
    } else {
      // Create new telegram channel
      const channelId = `ch_${randomUUID().slice(0, 8)}`;
      database.run(`
        INSERT INTO channels (id, gateway_id, type, name, config, allowed_users, enabled, status, created_at, updated_at)
        VALUES (?, ?, 'telegram', 'Telegram Bot', ?, '[]', 1, 'stopped', ?, ?)
      `, [channelId, gateway.id, JSON.stringify({ botToken }), now, now]);
      console.log(`✅ Created Telegram channel: ${channelId}`);
    }
    
    console.log(`\n   To allow users, run:`);
    console.log(`   kendaliai channel bind-telegram <user_id>`);
  } else if (subCommand === "list") {
    const channels = database.query<{ id: string; type: string; name: string; enabled: number; status: string }, []>(`
      SELECT id, type, name, enabled, status FROM channels
    `).all();
    
    if (channels.length === 0) {
      console.log("No channels configured.");
      return;
    }
    
    console.log("Configured Channels:\n");
    for (const ch of channels) {
      console.log(`  ${ch.name} (${ch.type})`);
      console.log(`    ID: ${ch.id}`);
      console.log(`    Status: ${ch.status}`);
      console.log(`    Enabled: ${ch.enabled ? "Yes" : "No"}`);
    }
  } else {
    console.log("Usage: kendaliai channel [add-telegram|bind-telegram|list]");
  }
}

async function handleStatus(): Promise<void> {
  const dbPath = getString("db-path", ".kendaliai/data.db");
  const database = getDb(dbPath);
  
  console.log("📊 KendaliAI Status\n");
  
  // Get all gateways
  const gateways = database.query<{ 
    id: string; 
    name: string; 
    provider: string; 
    default_model: string; 
    status: string;
    daemon_enabled: number;
    daemon_pid: number | null;
    daemon_port: number;
    require_pairing: number;
  }, []>(`
    SELECT id, name, provider, default_model, status, daemon_enabled, daemon_pid, daemon_port, require_pairing 
    FROM gateways ORDER BY name
  `).all();
  
  if (gateways.length > 0) {
    console.log("╔══════════════════════════════════════════════════════════════════════════╗");
    console.log("║                        KendaliAI Gateways                              ║");
    console.log("╠══════════════════════════════════════════════════════════════════════════╣");
    console.log("║ Name          Status    PID      Provider    Model           Port      ║");
    console.log("╠══════════════════════════════════════════════════════════════════════════╣");
    
    let runningCount = 0;
    
    for (const gw of gateways) {
      const status = gw.status === "running" ? "● Running" : "○ Stopped";
      const pid = gw.daemon_pid ? String(gw.daemon_pid) : "-";
      const model = gw.default_model || "-";
      const port = gw.daemon_port || "-";
      
      if (gw.status === "running") runningCount++;
      
      console.log(`║ ${gw.name.padEnd(14)} ${status.padEnd(9)} ${pid.padEnd(7)} ${gw.provider.padEnd(10)} ${model.padEnd(16)} ${String(port).padEnd(9)}║`);
    }
    
    console.log("╚══════════════════════════════════════════════════════════════════════════╝");
    console.log(`Total: ${gateways.length} gateway(s), ${runningCount} running\n`);
  } else {
    console.log("No gateways configured. Run 'kendaliai onboard' or 'kendaliai gateway create' to get started.\n");
  }
  
  // Check if any daemon is running
  console.log("Daemon Status:");
  try {
    const result = Bun.spawnSync(["pgrep", "-f", "bun.*cli.*gateway"]);
    if (result.stdout.toString().trim()) {
      const pids = result.stdout.toString().trim().split("\n");
      console.log(`  Status: Running (${pids.length} process(es))`);
    } else {
      console.log(`  Status: No daemons running`);
    }
  } catch {
    console.log(`  Status: Unknown`);
  }
  
  // Memory status
  const memoryCount = database.query<{ count: number }, []>(`
    SELECT COUNT(*) as count FROM memories
  `).get();
  
  console.log(`\nMemory:`);
  console.log(`  Entries: ${memoryCount?.count || 0}`);
  
  // Channels status
  const channels = database.query<{ count: number }, []>(`
    SELECT COUNT(*) as count FROM channels WHERE enabled = 1
  `).get();
  
  console.log(`\nChannels:`);
  console.log(`  Active: ${channels?.count || 0}`);
}

async function handleDoctor(): Promise<void> {
  console.log("🔍 KendaliAI Diagnostics\n");
  
  const checks: { name: string; status: "ok" | "warn" | "error"; message: string }[] = [];
  
  // Check database
  try {
    const dbPath = getString("db-path", ".kendaliai/data.db");
    const database = getDb(dbPath);
    database.query("SELECT 1").get();
    checks.push({ name: "Database", status: "ok", message: "Connected" });
  } catch (e) {
    checks.push({ name: "Database", status: "error", message: `Failed: ${e}` });
  }
  
  // Check gateway
  try {
    const database = getDb();
    const gateway = database.query<{ id: string }, []>(`
      SELECT id FROM gateways LIMIT 1
    `).get();
    
    if (gateway) {
      checks.push({ name: "Gateway", status: "ok", message: "Configured" });
    } else {
      checks.push({ name: "Gateway", status: "warn", message: "Not configured" });
    }
  } catch (e) {
    checks.push({ name: "Gateway", status: "error", message: `Error: ${e}` });
  }
  
  // Check pairing
  try {
    const database = getDb();
    const gateway = database.query<{ id: string }, []>(`
      SELECT id FROM gateways LIMIT 1
    `).get();
    
    if (gateway) {
      const status = await securityManager.getPairingStatus(gateway.id);
      if (status.isPaired) {
        checks.push({ name: "Pairing", status: "ok", message: "Paired" });
      } else {
        checks.push({ name: "Pairing", status: "warn", message: "Not paired" });
      }
    }
  } catch (e) {
    checks.push({ name: "Pairing", status: "error", message: `Error: ${e}` });
  }
  
  // Print results
  for (const check of checks) {
    const icon = check.status === "ok" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
    console.log(`${icon} ${check.name}: ${check.message}`);
  }
}

async function handleReset(): Promise<void> {
  const dbPath = getString("db-path", ".kendaliai/data.db");
  
  console.log("⚠️  This will delete all data!");
  console.log(`   Database: ${dbPath}`);
  console.log("\n   Run with --confirm to proceed");
  
  console.log("\n🔄 Resetting database...");
  
  closeDb();
  
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
  const database = getDb(dbPath);
  await initTables(database);
  
  console.log("✅ Database reset complete");
}

// ============================================
// Daemon - Telegram Bot with AI Integration
// ============================================

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
  };
}

interface GatewayConfig {
  id: string;
  provider: string;
  default_model: string;
  endpoint: string | null;
  api_key_encrypted: string | null;
}

// Reusable Telegram bot starter (used by both gateway and daemon commands)
async function startTelegramBot(
  botToken: string,
  channelId: string,
  gateway: GatewayConfig,
  apiUrl: string,
  apiKey: string,
  allowedUsers: string[],
  database: Database
): Promise<void> {
  const telegramApi = `https://api.telegram.org/bot${botToken}`;
  
  // Initialize routing manager
  const { getRoutingManager } = await import("./server/routing");
  const routingManager = getRoutingManager(database);
  
  async function sendMessage(chatId: number, text: string): Promise<void> {
    try {
      await fetch(`${telegramApi}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "Markdown",
        }),
      });
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }
  
  async function callAI(userMessage: string, targetGateway?: GatewayConfig, targetApiKey?: string): Promise<string> {
    const gw = targetGateway || gateway;
    const authKey = targetApiKey || apiKey;
    try {
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authKey}`,
        },
        body: JSON.stringify({
          model: gw.default_model,
          messages: [{ role: "user", content: userMessage }],
          stream: false,
        }),
      });
      
      if (!response.ok) return `❌ API Error: ${response.status}`;
      
      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      
      return data.choices?.[0]?.message?.content || "No response";
    } catch (error) {
      return `❌ Error: ${error}`;
    }
  }
  
  // Get gateway config by ID with decrypted API key
  function getGatewayById(gatewayId: string): { gateway: GatewayConfig; apiKey: string } | null {
    const gw = database.query<{
      id: string;
      provider: string;
      default_model: string;
      endpoint: string | null;
      api_key_encrypted: string | null;
    }, [string]>(`
      SELECT id, provider, default_model, endpoint, api_key_encrypted FROM gateways WHERE id = ?
    `).get(gatewayId);
    
    if (!gw) return null;
    
    // Decrypt API key
    let decryptedKey = "";
    try {
      decryptedKey = gw.api_key_encrypted ? decrypt(gw.api_key_encrypted) : "";
    } catch {
      // Backward compatibility: try plain text if decryption fails
      decryptedKey = gw.api_key_encrypted || "";
    }
    
    return { gateway: gw, apiKey: decryptedKey };
  }
  
  // Update channel status
  database.run(`UPDATE channels SET status = 'running', updated_at = ? WHERE id = ?`, [Date.now(), channelId]);
  
  console.log(`   ✅ Telegram bot started`);
  console.log(`   Allowed users: ${allowedUsers.length > 0 ? allowedUsers.join(", ") : "All users"}`);
  console.log(`   Send /init to pair!\n`);
  
  // Polling loop
  let lastUpdateId = 0;
  const pendingPairings = new Map<string, { chatId: number; timestamp: number }>();
  
  while (true) {
    try {
      const response = await fetch(`${telegramApi}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
      const data = await response.json() as { ok: boolean; result?: TelegramUpdate[] };
      
      if (!data.ok || !data.result) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        
        if (!update.message?.text) continue;
        
        const chatId = update.message.chat.id;
        const userId = update.message.from?.id.toString() || "unknown";
        const userName = update.message.from?.first_name || "User";
        const text = update.message.text.trim();
        
        console.log(`📩 [${userName}] ${text}`);
        
        // Handle /init command - Start pairing flow
        if (text === "/init" || text === "/start") {
          if (allowedUsers.includes(userId)) {
            await sendMessage(chatId, `✅ You're already paired!\n\nSend me a message to chat with AI.`);
            continue;
          }
          
          const pairingStatus = await securityManager.getPairingStatus(gateway.id);
          
          if (pairingStatus.pairingCode) {
            pendingPairings.set(userId, { chatId, timestamp: Date.now() });
            await sendMessage(chatId, `🔐 *Pairing Required*\n\nYour User ID: \`${userId}\`\n\nEnter the pairing code to continue.\n\nPairing Code: \`${pairingStatus.pairingCode}\`\n\n_Type the 6-digit code to pair your account._`);
          } else {
            const result = await securityManager.createPairing(gateway.id);
            if (result.success && result.pairingCode) {
              pendingPairings.set(userId, { chatId, timestamp: Date.now() });
              await sendMessage(chatId, `🔐 *Pairing Required*\n\nYour User ID: \`${userId}\`\n\nEnter the pairing code to continue.\n\nPairing Code: \`${result.pairingCode}\`\n\n_Type the 6-digit code to pair your account._`);
            } else {
              await sendMessage(chatId, "❌ Failed to create pairing code. Please try again.");
            }
          }
          continue;
        }
        
        // Handle pairing code input
        const pendingPairing = pendingPairings.get(userId);
        if (pendingPairing && /^\d{6}$/.test(text)) {
          const pairingStatus = await securityManager.getPairingStatus(gateway.id);
          
          if (pairingStatus.pairingCode === text) {
            const result = await securityManager.completePairing(gateway.id, text, { 
              ip: "telegram", 
              userAgent: `telegram:${userId}` 
            });
            
            if (result.success) {
              await securityManager.addToAllowlist(channelId, userId);
              allowedUsers.push(userId);
              pendingPairings.delete(userId);
              
              await sendMessage(pendingPairing.chatId, `✅ *Pairing Successful!*\n\nYour Telegram account is now paired with KendaliAI.\n\nYou can now chat with me! Send any message to start.`);
              console.log(`   ✅ User ${userId} paired successfully`);
            } else {
              await sendMessage(pendingPairing.chatId, `❌ Pairing failed: ${result.error}\n\nTry /init again.`);
              pendingPairings.delete(userId);
            }
          } else {
            await sendMessage(pendingPairing.chatId, "❌ Invalid pairing code. Try again or use /init for a new code.");
          }
          continue;
        }
        
        // Check allowlist
        if (allowedUsers.length > 0 && !allowedUsers.includes(userId)) {
          console.log(`   ⛔ User ${userId} not in allowlist`);
          await sendMessage(chatId, "⛔ You are not authorized.\n\nUse /init to pair your account first.");
          continue;
        }
        
        // Handle /status command
        if (text === "/status") {
          await sendMessage(chatId, `📊 *KendaliAI Status*\n\nProvider: ${gateway.provider}\nModel: ${gateway.default_model}\nStatus: Running\n\nYour ID: \`${userId}\``);
          continue;
        }
        
        // Handle /gateways command - show available gateways
        if (text === "/gateways") {
          const availableGateways = database.query<{ name: string; description: string | null; status: string }, []>(`
            SELECT name, description, status FROM gateways ORDER BY name
          `).all();
          
          let gwList = "🤖 *Available Gateways:*\n\n";
          for (const gw of availableGateways) {
            const status = gw.status === "running" ? "●" : "○";
            const desc = gw.description ? ` - ${gw.description}` : "";
            gwList += `${status} ${gw.name}${desc}\n`;
          }
          gwList += "\n_Use prefix commands like /dev, /support to route to specific gateways._";
          await sendMessage(chatId, gwList);
          continue;
        }
        
        // Route message to appropriate gateway
        const routingResult = routingManager.routeMessage(channelId, text, userId);
        
        // Handle interactive mode - show gateway selection
        if (routingResult.matchType === "interactive" && routingResult.interactiveOptions) {
          const interactiveMsg = routingManager.generateInteractiveMessage(routingResult.interactiveOptions);
          await sendMessage(chatId, interactiveMsg);
          continue;
        }
        
        // No gateway matched
        if (!routingResult.matched || !routingResult.gatewayId) {
          await sendMessage(chatId, "❌ No gateway available to handle your message.\n\nUse /gateways to see available gateways.");
          continue;
        }
        
        // Get the target gateway and its API key
        let targetGw: GatewayConfig;
        let targetApiKey: string;
        
        if (routingResult.gatewayId === gateway.id) {
          targetGw = gateway;
          targetApiKey = apiKey;
        } else {
          const gwResult = getGatewayById(routingResult.gatewayId);
          if (!gwResult) {
            await sendMessage(chatId, `❌ Gateway '${routingResult.gatewayName}' not found.`);
            continue;
          }
          targetGw = gwResult.gateway;
          targetApiKey = gwResult.apiKey;
        }
        
        // Use stripped message for prefix-based routing
        const messageToProcess = routingResult.strippedMessage || text;
        
        // Call AI with routed gateway
        console.log(`   🔄 Routing to ${routingResult.gatewayName} (${routingResult.matchType})...`);
        const aiResponse = await callAI(messageToProcess, targetGw, targetApiKey);
        console.log(`   🤖 Response sent`);
        
        // Send response
        const maxLen = 4000;
        const truncated = aiResponse.length > maxLen ? aiResponse.slice(0, maxLen) + "..." : aiResponse;
        await sendMessage(chatId, truncated);
        
        // Store message in database
        database.run(`
          INSERT INTO messages (gateway_id, channel_id, role, content, sender_id, sender_name, created_at)
          VALUES (?, ?, 'user', ?, ?, ?, ?)
        `, [targetGw.id, channelId, text, userId, userName, Date.now()]);
        
        database.run(`
          INSERT INTO messages (gateway_id, channel_id, role, content, created_at)
          VALUES (?, ?, 'assistant', ?, ?)
        `, [targetGw.id, channelId, aiResponse, Date.now()]);
      }
      
      // Clean up expired pending pairings
      const now = Date.now();
      for (const [uid, data] of pendingPairings) {
        if (now - data.timestamp > 5 * 60 * 1000) {
          pendingPairings.delete(uid);
        }
      }
    } catch (error) {
      console.error("Polling error:", error);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function handleDaemon(): Promise<void> {
  const dbPath = getString("db-path", ".kendaliai/data.db");
  const database = getDb(dbPath);
  
  console.log("🤖 Starting KendaliAI Daemon (Telegram Bot Only)\n");
  
  // Get gateway configuration
  const gateway = database.query<{ 
    id: string; 
    provider: string; 
    default_model: string; 
    endpoint: string | null;
    api_key_encrypted: string | null;
  }, []>(`
    SELECT id, provider, default_model, endpoint, api_key_encrypted FROM gateways LIMIT 1
  `).get();
  
  if (!gateway) {
    console.error("❌ No gateway found. Run 'kendaliai onboard' first.");
    return;
  }
  
  // Get Telegram channel
  const channel = database.query<{ 
    id: string; 
    config: string; 
    allowed_users: string; 
  }, []>(`
    SELECT id, config, allowed_users FROM channels WHERE type = 'telegram' AND enabled = 1 LIMIT 1
  `).get();
  
  if (!channel) {
    console.error("❌ No Telegram channel configured.");
    console.log("   Run: kendaliai channel add-telegram --bot-token <token>");
    return;
  }
  
  // Parse channel config
  let botToken: string;
  try {
    const config = JSON.parse(channel.config);
    botToken = config.botToken;
    if (!botToken) throw new Error("No botToken in config");
  } catch {
    console.error("❌ Invalid Telegram channel config");
    return;
  }
  
  // Parse allowed users
  let allowedUsers: string[] = [];
  try {
    allowedUsers = JSON.parse(channel.allowed_users || "[]");
  } catch {
    allowedUsers = [];
  }
  
  // Determine API endpoint
  let apiUrl = gateway.endpoint;
  if (!apiUrl) {
    const defaultEndpoints: Record<string, string> = {
      openai: "https://api.openai.com/v1",
      deepseek: "https://api.deepseek.com/v1",
      zai: "https://api.z.ai/api/coding/paas/v4",
      openrouter: "https://openrouter.ai/api/v1",
    };
    apiUrl = defaultEndpoints[gateway.provider] || "https://api.openai.com/v1";
  }
  
  console.log(`📡 Provider: ${gateway.provider} (${gateway.default_model})`);
  console.log(`📱 Telegram Bot: Starting...\n`);
  
  // Update gateway status
  database.run(`UPDATE gateways SET status = 'running', updated_at = ? WHERE id = ?`, [Date.now(), gateway.id]);
  
  // Decrypt API key
  let apiKey: string;
  try {
    apiKey = gateway.api_key_encrypted ? decrypt(gateway.api_key_encrypted) : "";
  } catch {
    // Backward compatibility
    apiKey = gateway.api_key_encrypted || "";
  }
  
  // Start the bot
  await startTelegramBot(botToken, channel.id, gateway, apiUrl, apiKey, allowedUsers, database);
}

// ============================================
// Database Initialization
// ============================================

async function initTables(db: Database): Promise<void> {
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
    
    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_pairings_gateway ON pairings(gateway_id);
    CREATE INDEX IF NOT EXISTS idx_pairings_code ON pairings(pairing_code);
    CREATE INDEX IF NOT EXISTS idx_channels_gateway ON channels(gateway_id);
    CREATE INDEX IF NOT EXISTS idx_memories_gateway ON memories(gateway_id);
    CREATE INDEX IF NOT EXISTS idx_messages_gateway ON messages(gateway_id);
  `;
  
  const statements = createTablesSQL.split(";").filter(s => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      db.run(stmt);
    }
  }
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  const command = positionals[0];
  
  if (values.help || !command) {
    return handleHelp();
  }
  
  if (values.version) {
    return handleVersion();
  }
  
  switch (command) {
    case "onboard":
      await handleOnboard();
      break;
    case "gateway":
    case "gw": {
      // Multi-gateway management
      const subCommand = positionals[1];
      const subArgs = positionals.slice(2);
      const database = getDb(getString("db-path", ".kendaliai/data.db"));
      await initTables(database);
      
      // Get options from values object
      const provider = getString("provider");
      const model = getString("model");
      const apiKey = getString("api-key");
      const apiUrl = getString("api-url");
      
      // Build combined args array that includes both positional args and options
      const fullArgs = [...subArgs];
      if (provider) {
        fullArgs.push("--provider", provider);
      }
      if (model) {
        fullArgs.push("--model", model);
      }
      if (apiKey) {
        fullArgs.push("--api-key", apiKey);
      }
      if (apiUrl) {
        fullArgs.push("--api-url", apiUrl);
      }
      
      const { handleGatewayCommand } = await import("./cli/gateway");
      await handleGatewayCommand(database, subCommand || "list", fullArgs);
      break;
    }
    case "daemon": {
      // Daemon management
      const subCommand = positionals[1];
      const subArgs = positionals.slice(2);
      const database = getDb(getString("db-path", ".kendaliai/data.db"));
      await initTables(database);
      
      const { handleDaemonCommand } = await import("./cli/daemon");
      await handleDaemonCommand(database, subCommand || "status", subArgs);
      break;
    }
    case "skills": {
      // Skills management
      const subArgs = positionals.slice(1);
      const { handleSkillsCommand } = await import("./cli/skills");
      await handleSkillsCommand(subArgs);
      break;
    }
    case "status":
      await handleStatus();
      break;
    case "agent":
      await handleAgent();
      break;
    case "pairing":
      await handlePairing();
      break;
    case "channel":
      await handleChannel();
      break;
    case "routing": {
      // Channel routing management
      const subCommand = positionals[1] || "help";
      const subArgs = positionals.slice(2);
      const database = getDb(getString("db-path", ".kendaliai/data.db"));
      await initTables(database);
      
      const { handleRoutingCommand } = await import("./cli/routing");
      await handleRoutingCommand(database, subCommand, subArgs);
      break;
    }
    case "doctor":
      await handleDoctor();
      break;
    case "reset":
      await handleReset();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log("Run --help for usage information");
      process.exit(1);
  }
}

// Run main
main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
