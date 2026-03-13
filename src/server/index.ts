/**
 * KendaliAI Server - Main Entry Point
 *
 * This is the main server file that bootstraps all components
 * and starts the HTTP server with OpenAI-compatible API endpoints.
 * Uses Bun's native server.
 */

// Core imports
import { configLoader } from "./config";
import { getDatabase, initDatabase, dbManager } from "./database";
import { eventBus } from "./eventbus";
import { Database } from "bun:sqlite";
import os from "os";
import { join } from "path";
import { log } from "./core";

// Database schema
import {
  messages,
  gateways,
  tools,
  channels,
  memories,
  skills,
  pairings,
} from "./database/schema";
import { desc, count, eq } from "drizzle-orm";

// Providers
import {
  providerRegistry,
  OpenAIProvider,
  DeepSeekProvider,
  ZAIProvider,
  CustomProvider,
} from "./providers";
import type { AIProvider, GenerateOptions, StreamChunk, ChatMessage } from "./providers";

// Tools
import { toolRegistry } from "./tools/registry";
import { getSkillRegistry } from "./skills/registry";
import { getSkillsManager, BUILTIN_TOOLS } from "./skills";

// Routing
import { RoutingManager } from "./routing";

// RAG
import { createRAGEngine } from "./rag";
import type { RAGEngine } from "./rag";

// Security & Encryption
import { securityManager } from "./security";
import { decrypt } from "./security/encryption";

// Channels
import { channelManager, type SendMessageOptions, type ChannelMessage } from "./channels";

// Executors & Routing
import { autonomousPipeline } from "../executors";
import { Retriever } from "../rag/retriever";
import { loadGatewayContext } from "../cli/gateway";

// ============================================
// Types
// ============================================

interface StatsResponse {
  messages: number;
  gateways: number;
  uptime: number;
  requests: number;
  systemLatency: number;
  recentActivity: any[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface GatewayConfig {
  id: string;
  name: string;
  description?: string;
  provider: {
    type: "openai" | "deepseek" | "zai" | "custom";
    apiKey?: string;
    model?: string;
    endpoint?: string;
  };
  agent: {
    name: string;
    personality?: string;
    instructions?: string;
    traits?: string[];
    systemPrompt?: string;
  };
  skills?: string[];
  tools?: string[];
  channels?: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
  status: "stopped" | "running";
  createdAt: string;
}

// ============================================
// CORS Headers
// ============================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

// ============================================
// Helper Functions
// ============================================

function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function error(message: string, status = 500): Response {
  return json({ success: false, error: message }, status);
}

// ============================================
// In-Memory Gateway Store
// ============================================

const gatewayInstances: Map<string, {
  config: GatewayConfig;
  provider: AIProvider;
  status: "stopped" | "running";
}> = new Map();

// Routing manager instance (initialized in bootstrap)
let routingManager: RoutingManager | null = null;

// RAG engine instance (initialized in bootstrap)
let ragEngineInstance: RAGEngine | null = null;

// ============================================
// Bootstrap Function
// ============================================

async function bootstrap() {
  log.info("Starting KendaliAI Server...");

  // Parse command line arguments early to determine database path
  const cmdArgs = parseArgs();
  let dbPath = ".kendaliai/kendaliai.db";
  
  if (cmdArgs.gateway) {
      dbPath = join(".kendaliai", cmdArgs.gateway, "data", "kendaliai.db");
  }

  // Initialize database
  const db = initDatabase(dbPath);
  log.info(`Database initialized: ${dbPath}`);

  // Get raw database for routing manager
  const rawDb = dbManager.getRaw();
  if (rawDb) {
    routingManager = new RoutingManager(rawDb);
    log.info("Routing manager initialized.");
  }

  // Load configuration
  await configLoader.load();
  log.info("Configuration loaded.");

  // Register built-in tools
  registerBuiltinTools(db);
  log.info("Built-in tools registered.");

  // Load and register skill-based tools
  if (rawDb) {
    await loadSkillTools(rawDb);
  }

  // Initialize RAG engine
  try {
    if (rawDb) {
      ragEngineInstance = await createRAGEngine(rawDb, {});
      log.info("RAG engine initialized.");
    }
  } catch (err) {
    log.warn("RAG engine initialization skipped:", err);
  }

  // Load gateways and channels
  await loadGatewayAndChannels(db, cmdArgs.gateway);

  // Set up event handlers
  setupChannelEvents(db);

  log.info("KendaliAI Server bootstrapped successfully.");
}

/**
 * Handle events coming from messaging channels
 */
function setupChannelEvents(db: any) {
  // 0. Register global bot commands (for UI discoverability)
  for (const [id, channel] of channelManager.getAll()) {
    if (channel.type === 'telegram') {
        channel.setCommands([
            { command: 'start', description: 'Initialize and pair your account' },
            { command: 'ask', description: 'Ask a question using RAG knowledge base' },
            { command: 'ingest', description: 'Save information to knowledge base' },
            { command: 'skills', description: 'List installed skills' },
            { command: 'tools', description: 'List equipped tools' },
            { command: 'help', description: 'Show help and usage' }
        ]).then(() => log.info(`✅ Commands registered for Telegram channel: ${id}`))
          .catch(err => log.error(`❌ Failed to set commands for ${id}:`, err));

        // Add tools command handler
        channel.onCommand('tools', async (ctx) => {
            let toolsText = "⚒️ *Equipped Tools*\n\n";
            try {
                const channelId = ctx.channel.name;
                const [dbChannel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
                const gatewayId = dbChannel?.gatewayId;

                const manager = getSkillsManager(dbManager.getRaw()!);
                let toolsList = [];
                
                if (gatewayId) {
                    toolsList = manager.getEnabledTools(gatewayId);
                    toolsText = `⚒️ *Equipped Tools* (Gateway: \`${gatewayId}\`)\n\n`;
                } else {
                    // Fallback to registry if no gateway link found
                    toolsList = toolRegistry.list();
                }

                if (toolsList.length > 0) {
                    toolsText += toolsList.map((t: any) => {
                        const description = t.description || BUILTIN_TOOLS[t.name]?.description || "No description";
                        return `⚡ \`${t.name}\`: ${description}`;
                    }).join('\n');
                } else {
                    toolsText += "_No tools equipped for this gateway._";
                }
            } catch (err) {
                log.warn("Failed to fetch tools for Telegram:", err);
                toolsText += "❌ _Failed to fetch tools._";
            }
            await ctx.channel.sendMessage(toolsText, { chatId: ctx.message.chatId, parseMode: 'markdown' });
        });

        // Add skills command handler
        channel.onCommand('skills', async (ctx) => {
            let skillsText = "🧩 *Active Skills*\n\n";
            try {
                const channelId = ctx.channel.name; // Internal ID
                const [dbChannel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
                const gatewayId = dbChannel?.gatewayId;

                const manager = getSkillsManager(dbManager.getRaw()!);
                let active = [];
                
                if (gatewayId) {
                    active = manager.getEnabledSkills(gatewayId);
                    skillsText = `🧩 *Active Skills* (Gateway: \`${gatewayId}\`)\n\n`;
                } else {
                    active = manager.listAvailableSkills();
                }

                if (active.length > 0) {
                    skillsText += active.map((s: any) => `• **${s.name}**: ${s.description}`).join('\n');
                } else {
                    skillsText += "_No skills enabled for this gateway._";
                }
            } catch (err) {
                log.warn("Failed to fetch skills for Telegram:", err);
                skillsText += "❌ _Failed to fetch skills._";
            }
            await ctx.channel.sendMessage(skillsText, { chatId: ctx.message.chatId, parseMode: 'markdown' });
        });

        // Add help command handler
        channel.onCommand('help', async (ctx) => {
            // Get enabled skills for this channel's gateway
            let skillsList = "None";
            try {
                const channelId = ctx.channel.name;
                const [dbChannel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
                const gatewayId = dbChannel?.gatewayId;

                const manager = getSkillsManager(dbManager.getRaw()!);
                let active = [];
                if (gatewayId) {
                    active = manager.getEnabledSkills(gatewayId);
                } else {
                    active = manager.listAvailableSkills();
                }

                if (active.length > 0) {
                    skillsList = active.map((s: any) => `\`${s.name}\``).join(', ');
                }
            } catch (err) {
                log.warn("Failed to fetch skills for help:", err);
            }

            const helpText = `🛠 *KendaliAI Help*\n\n` +
                `Autonomous AI Gateway & Agent Loop\n\n` +
                `⚡ *Skills:* ${skillsList}\n\n` +
                `*Commands:*\n` +
                `• \`/start\` - Initialize and pair your account\n` +
                `• \`/ask <query>\` - Explicit RAG search\n` +
                `• \`/ingest <text>\` - Save to long-term memory\n` +
                `• \`/skills\` - List all installed skills\n` +
                `• \`/tools\` - List equipped tools\n\n` +
                `_Normal messages are automatically routed between Chat, RAG, and Agent Loop._`;
            await ctx.channel.sendMessage(helpText, { chatId: ctx.message.chatId, parseMode: 'markdown' });
        });
    }
  }

  channelManager.onEvent(async (event) => {
    if (event.type === 'message_received' && event.data) {
      const message = event.data as ChannelMessage;
      const channelId = event.channel; // This is now the ID (e.g. ch_...)
      const text = message.text.trim();
      const chatId = message.chatId;
      const userId = message.userId;
      const userName = message.displayName || message.username || "User";

      log.info(`📩 [${channelId}/${userName}] ${text}`);
      
      const commandsToSkip = ['/skills', '/tools', '/help', '/start', '/init'];
      if (commandsToSkip.some(cmd => text.startsWith(cmd))) {
          // 1. Handle pairing commands (/init, /start) explicitly if needed
          if (text === "/init" || text === "/start") {
              // Find gateway for this channel - use first one or default
              const gatewayId = gatewayInstances.keys().next().value || "default";
              
              try {
                  const result = await securityManager.createPairing(gatewayId);
                  if (result.success && result.pairingCode) {
                      const reply = `🔐 *Pairing Required*\n\nYour User ID: \`${userId}\`\n\nEnter the pairing code to continue.\n\nPairing Code: \`${result.pairingCode}\`\n\n_Type the 6-digit code to pair your account._`;
                      
                      const channel = channelManager.get(event.channel);
                      if (channel) {
                          await channel.sendMessage(reply, { chatId, parseMode: 'markdown' } as SendMessageOptions);
                      }
                  }
              } catch (err) {
                  log.error("Failed to handle pairing command:", err);
              }
          }
          // Manual commands handled by individual handlers, skip autonomous routing
          return;
      }

      // 2. Handle pairing code (6 digits)
      if (/^\d{6}$/.test(text)) {
          // Try to pair for all gateways (multi-gateway support)
          for (const [gatewayId, instance] of gatewayInstances.entries()) {
              const pairingStatus = await securityManager.getPairingStatus(gatewayId);
              if (pairingStatus.pairingCode === text) {
                  const result = await securityManager.completePairing(gatewayId, text, {
                      ip: event.channelType || "unknown",
                      userAgent: `channel:${event.channel}:${userId}`
                  });
                  
                  if (result.success) {
                      await securityManager.addToAllowlist(event.channel, userId);
                      
                      const reply = `✅ *Pairing Successful!*\n\nYour account is now paired with gateway: **${instance.config.name}**.\n\nYou can now chat with me!`;
                      const channel = channelManager.get(event.channel);
                      if (channel) {
                          await channel.sendMessage(reply, { chatId, parseMode: 'markdown' } as SendMessageOptions);
                      }
                      log.info(`✅ User ${userId} paired successfully with gateway ${gatewayId}`);
                      return;
                  }
              }
          }
      }

      // 3. Check if user is allowed
      const allowCheck = await securityManager.checkAllowlist(channelId, userId);
      if (!allowCheck.allowed) {
          log.warn(`⛔ Unauthorized access attempt from user ${userId} on channel ${channelId}: ${allowCheck.reason}`);
          const channel = channelManager.get(channelId);
          if (channel) {
              await channel.sendMessage(`⛔ *Unauthorized Access*\n\nYour User ID (\`${userId}\`) is not on the allowlist for this channel.\n\nUse \`/init\` to pair your account.`, { chatId, parseMode: 'markdown' } as SendMessageOptions);
          }
          return;
      }

      // 4. Route message and call AI
      if (routingManager) {
        const route = routingManager.routeMessage(channelId, text, userId);
        
        if (route.matched && route.gatewayId) {
            const instance = gatewayInstances.get(route.gatewayId);
            const channel = channelManager.get(channelId);
            
            if (instance && channel) {
                try {
                    // Show typing indicator
                    await channel.setTyping(chatId);
                    
                    const queryText = route.strippedMessage || text;

                    // 1. Handle Explicit RAG Ingest Command
                    if (queryText.startsWith('/ingest ')) {
                        if (!ragEngineInstance) {
                            await channel.sendMessage("⚠️ RAG engine is not initialized.", { chatId } as SendMessageOptions);
                            return;
                        }
                        const content = queryText.slice(8).trim();
                        if (!content) {
                            await channel.sendMessage("ℹ️ Please provide content to ingest. Usage: `/ingest <text>`", { chatId, parseMode: 'markdown' } as SendMessageOptions);
                            return;
                        }
                        const doc = await ragEngineInstance.ingestDocument(content, { 
                            source: 'text', 
                            gatewayId: route.gatewayId,
                            title: `Chat Ingest - ${new Date().toISOString()}`
                        });
                        await channel.sendMessage(`✅ *Content Ingested*\n\nID: \`${doc.id}\`\nStatus: ${doc.status}`, { chatId, parseMode: 'markdown' } as SendMessageOptions);
                        return;
                    }

                    // 2. Call Autonomous Pipeline
                    if (!ragEngineInstance) {
                        const rawDb = dbManager.getRaw();
                        if (rawDb) {
                            ragEngineInstance = await createRAGEngine(rawDb, {});
                        }
                    }

                    if (!ragEngineInstance) {
                        await channel.sendMessage("⚠️ AI Engine (RAG) is not ready.", { chatId } as SendMessageOptions);
                        return;
                    }
                    
                    const rawDb = dbManager.getRaw()!;
                    const retriever = new Retriever(ragEngineInstance);
                    
                    // Strip optional /ask or /rag prefixes
                    let cleanMessage = queryText;
                    if (queryText.startsWith('/ask ')) cleanMessage = queryText.slice(5).trim();
                    else if (queryText.startsWith('/rag ')) cleanMessage = queryText.slice(5).trim();
                    
                    log.info(`🔄 Routing through autonomous pipeline: ${cleanMessage.slice(0, 50)}...`);

                    const pipelineResult = await autonomousPipeline(cleanMessage, {
                        provider: instance.provider,
                        db: rawDb,
                        gatewayId: route.gatewayId,
                        model: instance.config.provider.model,
                        embedder: {
                             embed: (t) => ragEngineInstance!.embedText(t)
                        },
                        retriever,
                        agentSystemPrompt: instance.config.agent.systemPrompt
                    });
                    
                    log.info(`✅ Pipeline routed to [${pipelineResult.intent}]`);
                    
                    // 3. Send final response
                    await channel.sendMessage(pipelineResult.response, { chatId } as SendMessageOptions);
                } catch (err) {
                    log.error(`AI call failed for gateway ${route.gatewayId}:`, err);
                    await channel.sendMessage("⚠️ Sorry, I encountered an error while processing your request.", { chatId } as SendMessageOptions);
                }
            }
        }
      }
    }
  });

  // Also bridge MESSAGE_RECEIVED from eventBus if needed
  eventBus.on("MESSAGE_RECEIVED", async (payload: {
    adapter?: string;
    from?: string;
    text?: string;
    username?: string;
    user?: string;
  }) => {
    log.info(`EventBus received message from ${payload.adapter}: ${payload.text}`);
    
    try {
      await db.insert(messages).values({
        gatewayId: null,
        channelId: null,
        role: "user",
        content: payload.text || "",
        senderId: payload.from || payload.username || payload.user || "unknown",
        senderName: payload.username || payload.user || "unknown",
      });
    } catch (err) {
      log.error("Failed to save message:", err);
    }
  });
}

/**
 * Load tools from installed skills and register them
 */
async function loadSkillTools(rawDb: any) {
  try {
    const skillRegistry = getSkillRegistry(rawDb);
    const installedSkills = skillRegistry.listInstalled();
    
    for (const skill of installedSkills) {
      if (!skill.enabled) continue;
      
      log.info(`📦 Loading tools from skill: ${skill.name}`);
      
      if (skill.tools && Array.isArray(skill.tools)) {
        for (const toolDef of skill.tools) {
          log.info(`  - Registering tool: ${toolDef.name}`);
          
          toolRegistry.register({
            name: toolDef.name,
            description: toolDef.description,
            parameters: (toolDef.parameters && (toolDef.parameters as any).type) 
              ? toolDef.parameters 
              : { type: 'object', properties: {}, required: [] },
            handler: async (params) => {
              // Dynamic import of skill execution logic
              try {
                // Try src/index.ts first, fallback to src/main.ts or root index.ts
                const possiblePaths = [
                  join(skill.path, "src", "index.ts"),
                  join(skill.path, "src", "main.ts"),
                  join(skill.path, "index.ts")
                ];
                
                let entryPath = "";
                const fs = require("fs");
                for (const p of possiblePaths) {
                  if (fs.existsSync(p)) {
                    entryPath = p;
                    break;
                  }
                }

                if (!entryPath) {
                  throw new Error(`Execution entry point not found for skill: ${skill.name}`);
                }

                log.info(`🚀 Executing skill tool ${skill.name}/${toolDef.name}`);
                const module = await import(entryPath);
                const skillInstance = module.default || module;
                
                if (typeof skillInstance.execute !== 'function') {
                  throw new Error(`Skill ${skill.name} does not export an execute function`);
                }

                return await skillInstance.execute(toolDef.name, params);
              } catch (err) {
                log.error(`Failed to execute skill tool ${toolDef.name}:`, err);
                throw err;
              }
            }
          });
        }
      }
    }
  } catch (err) {
    log.error("Failed to load skill tools:", err);
  }
}

// ============================================
// Register Built-in Tools
// ============================================

function registerBuiltinTools(db?: any) {
  // Ping tool
  toolRegistry.register({
    name: "ping",
    description: "Replies with pong",
    parameters: { type: "object", properties: {} },
    handler: async () => "pong",
  });

  // Echo tool
  toolRegistry.register({
    name: "echo",
    description: "Echoes back the input message",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to echo" },
      },
      required: ["message"],
    },
    handler: async (params: Record<string, unknown>) =>
      `Echo: ${params.message}`,
  });

  // Time tool
  toolRegistry.register({
    name: "time",
    description: "Returns the current time",
    parameters: { type: "object", properties: {} },
    handler: async () => new Date().toISOString(),
  });

  // System info tool
  toolRegistry.register({
    name: "get_system_info",
    description: "Returns detailed information about the host system",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      const stats = {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpu: os.cpus()[0].model,
        cores: os.cpus().length,
        memory: {
          total: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + " GB",
          free: Math.round(os.freemem() / (1024 * 1024 * 1024)) + " GB",
        },
        uptime: Math.round(os.uptime() / 3600) + " hours",
        dbStatus: db ? "Connected" : "Not Connected",
      };
      return stats;
    },
  });

  // Random tool
  toolRegistry.register({
    name: "random",
    description: "Returns a random number",
    parameters: {
      type: "object",
      properties: {
        min: { type: "number", description: "Minimum value" },
        max: { type: "number", description: "Maximum value" },
      },
    },
    handler: async (params: Record<string, unknown>) => {
      const min = (params.min as number) ?? 0;
      const max = (params.max as number) ?? 100;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
  });

  // Shell tool
  toolRegistry.register({
    name: "shell",
    description: "Executes a shell command",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute" },
      },
      required: ["command"],
    },
    handler: async (params: { command: string }) => {
      const { execSync } = require("child_process");
      try {
        log.info(`Executing shell command: ${params.command}`);
        const output = execSync(params.command, { encoding: "utf8", timeout: 30000 });
        return output;
      } catch (err: any) {
        return `Error: ${err.message}\n${err.stderr || ""}`;
      }
    },
  });

  // File tool
  toolRegistry.register({
    name: "read_file",
    description: "Reads a file from the filesystem",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file" },
      },
      required: ["path"],
    },
    handler: async (params: { path: string }) => {
      const { readFileSync, existsSync } = require("fs");
      try {
        if (!existsSync(params.path)) {
          return `Error: File not found at ${params.path}`;
        }
        return readFileSync(params.path, "utf8");
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  });
}

/**
 * Load gateways and their associated channels from the database
 */
async function loadGatewayAndChannels(db: any, gatewayName?: string) {
  try {
    // 1. Load Gateway(s)
    let dbGateways;
    if (gatewayName) {
      dbGateways = await db.select().from(gateways).where(eq(gateways.name, gatewayName));
    } else {
      dbGateways = await db.select().from(gateways);
    }

    if (dbGateways.length === 0) {
      if (gatewayName) {
        log.warn(`Gateway '${gatewayName}' not found in database.`);
      }
      return;
    }

    for (const gw of dbGateways) {
      log.info(`Loading gateway: ${gw.name} (${gw.id})`);
      
      // Decrypt API key - Handle both camelCase and snake_case for robustness
      const encryptedKey = gw.apiKeyEncrypted || gw.api_key_encrypted;
      let apiKey = "";
      if (encryptedKey) {
        try {
          apiKey = decrypt(encryptedKey);
        } catch (e) {
          log.warn(`  - Failed to decrypt API key for gateway ${gw.name}, using as-is`);
          apiKey = encryptedKey;
        }
      }

      const agentConfigStr = gw.agentConfig || gw.agent_config;
      const agentConfigRaw = agentConfigStr ? JSON.parse(agentConfigStr) : {};
      
      // Load context from markdown files
      const mdContext = loadGatewayContext(gw.name);
      const baseSystemPrompt = agentConfigRaw.system_prompt || "You are KendaliAI, a powerful AI orchestrator.";
      const combinedPrompt = mdContext 
        ? `${mdContext}\n\n# Base Instructions\n${baseSystemPrompt}`
        : baseSystemPrompt;

      const config: GatewayConfig = {
        id: gw.id,
        name: gw.name,
        description: gw.description || undefined,
        provider: {
          type: gw.provider as any,
          apiKey,
          model: gw.defaultModel || gw.default_model || undefined,
          endpoint: gw.endpoint || undefined,
        },
        agent: {
          name: gw.name,
          systemPrompt: combinedPrompt,
          personality: agentConfigRaw.personality || undefined,
          instructions: agentConfigRaw.instructions || undefined,
        },
        status: "running",
        createdAt: gw.createdAt || gw.created_at || new Date().toISOString(),
      };

      // Initialize provider
      const provider = createProvider(config.provider);
      await provider.initialize();
      
      // Register in registry and memory
      providerRegistry.register(gw.name, provider);
      gatewayInstances.set(gw.id, {
        config,
        provider,
        status: "running",
      });

      // 2. Load associated channels
      const dbChannels = await db.select().from(channels).where(eq(channels.gatewayId, gw.id));
      
      for (const ch of dbChannels) {
        if (!ch.enabled) continue;
        
        log.info(`  Starting channel: ${ch.name} (${ch.type})`);
        
        try {
          const chConfig = ch.config ? JSON.parse(ch.config) : {};
          
          const channel = channelManager.create(ch.type as any, {
            type: ch.type as any,
            name: ch.id, // Use ID as the internal name for identification in events
            token: chConfig.botToken,
            ...chConfig,
          });
          
          await channel.initialize();
          await channel.connect();
          
          channelManager.register(ch.id, channel);
          
          // Update status in database
          await db.update(channels)
            .set({ status: 'running', updatedAt: new Date() })
            .where(eq(channels.id, ch.id));
            
          log.info(`  ✅ Channel ${ch.name} connected.`);
        } catch (err) {
          log.error(`  ❌ Failed to start channel ${ch.name}:`, err);
        }
      }
    }
  } catch (err) {
    log.error("Failed to load gateways and channels:", err);
  }
}

// ============================================
// Provider Factory
// ============================================

function createProvider(config: GatewayConfig["provider"]): AIProvider {
  switch (config.type) {
    case "openai":
      return new OpenAIProvider({
        type: "openai",
        apiKey: config.apiKey,
        defaultModel: config.model,
      });
    case "deepseek":
      return new DeepSeekProvider({
        type: "deepseek",
        apiKey: config.apiKey,
        defaultModel: config.model,
      });
    case "zai":
      return new ZAIProvider({
        type: "zai",
        apiKey: config.apiKey,
        defaultModel: config.model,
      });
    case "custom":
      return new CustomProvider({
        type: "custom",
        baseURL: config.endpoint || "http://localhost:11434/v1",
        apiKey: config.apiKey,
        defaultModel: config.model,
      });
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

// ============================================
// API Route Handlers
// ============================================

async function handleStats(): Promise<Response> {
  try {
    const db = getDatabase();
    const [messageCount] = await db
      .select({ count: count() })
      .from(messages);
    const [gatewayCount] = await db
      .select({ count: count() })
      .from(gateways);

    const stats: StatsResponse = {
      messages: messageCount?.count ?? 0,
      gateways: gatewayCount?.count ?? 0,
      uptime: process.uptime(),
      requests: 0,
      systemLatency: 0,
      recentActivity: [],
    };

    return json(stats);
  } catch (err) {
    log.error("Failed to get stats:", err);
    return error("Failed to get stats");
  }
}

async function handleGetGateways(): Promise<Response> {
  try {
    const db = getDatabase();
    // Return both database gateways and in-memory instances
    const dbGateways = await db.select().from(gateways);
    const memoryGateways = Array.from(gatewayInstances.values()).map((g) => ({
      ...g.config,
      status: g.status,
    }));

    return json({
      database: dbGateways,
      running: memoryGateways,
    });
  } catch (err) {
    log.error("Failed to get gateways:", err);
    return error("Failed to get gateways");
  }
}

async function handleCreateGateway(req: Request): Promise<Response> {
  try {
    const db = getDatabase();
    const body = await req.json();
    
    // Create gateway config
    const gatewayConfig: GatewayConfig = {
      id: body.id || `gw_${Date.now()}`,
      name: body.name,
      description: body.description,
      provider: body.provider || { type: "openai" },
      agent: body.agent || { name: body.name },
      skills: body.skills || [],
      tools: body.tools || [],
      channels: body.channels || [],
      status: "stopped",
      createdAt: new Date().toISOString(),
    };

    // Create provider instance
    const provider = createProvider(gatewayConfig.provider);

    // Store in memory
    gatewayInstances.set(gatewayConfig.id, {
      config: gatewayConfig,
      provider,
      status: "stopped",
    });

    // Also save to database
    const result = await db
      .insert(gateways)
      .values({
        id: gatewayConfig.id,
        name: gatewayConfig.name,
        provider: gatewayConfig.provider.type,
        endpoint: gatewayConfig.provider.endpoint,
        defaultModel: gatewayConfig.provider.model,
      })
      .returning();

    return json({ config: gatewayConfig, db: result[0] }, 201);
  } catch (err) {
    log.error("Failed to create gateway:", err);
    return error("Failed to create gateway");
  }
}

async function handleGetMessages(req: Request): Promise<Response> {
  try {
    const db = getDatabase();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const allMessages = await db
      .select()
      .from(messages)
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return json(allMessages);
  } catch (err) {
    log.error("Failed to get messages:", err);
    return error("Failed to get messages");
  }
}

async function handleGetTools(): Promise<Response> {
  try {
    const db = getDatabase();
    const allTools = await db.select().from(tools);
    const registeredTools = toolRegistry.list();
    
    return json({
      database: allTools,
      registered: registeredTools,
    });
  } catch (err) {
    log.error("Failed to get tools:", err);
    return error("Failed to get tools");
  }
}

async function handleExecuteTool(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { name, params } = body;

    const result = await toolRegistry.execute(name, params);
    return json({ result });
  } catch (err) {
    log.error("Failed to execute tool:", err);
    return error("Failed to execute tool");
  }
}

async function handleGetSkills(): Promise<Response> {
  try {
    const db = getDatabase();
    const allSkills = await db.select().from(skills);
    return json({ database: allSkills });
  } catch (err) {
    log.error("Failed to get skills:", err);
    return error("Failed to get skills");
  }
}

async function handleGetLogs(req: Request): Promise<Response> {
  try {
    const db = getDatabase();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");
    
    // Use messages as logs for now
    const logs = await db
      .select()
      .from(messages)
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    
    return json(logs);
  } catch (err) {
    log.error("Failed to get logs:", err);
    return error("Failed to get logs");
  }
}

async function handleGetSettings(): Promise<Response> {
  try {
    const config = configLoader.get();
    // Return safe config (without sensitive data)
    return json({
      server: config.server,
      database: config.database,
      providers: Object.keys(config.providers || {}),
    });
  } catch (err) {
    log.error("Failed to get settings:", err);
    return error("Failed to get settings");
  }
}

// ============================================
// OpenAI-Compatible API Handlers
// ============================================

async function handleOpenAIChat(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { model, messages: chatMessages, stream, tools } = body;

    // Find a provider for this model
    const providers = providerRegistry.getAll();
    let selectedProvider: AIProvider | null = null;
    let selectedProviderName: string | null = null;

    for (const [name, provider] of providers) {
      const models = await provider.listModels();
      if (models.some((m) => m.id === model || m.name === model)) {
        selectedProvider = provider;
        selectedProviderName = name;
        break;
      }
    }

    // If no provider found, try to use the first available one
    if (!selectedProvider && providers.size > 0) {
      const firstEntry = Array.from(providers.entries())[0];
      if (firstEntry) {
        selectedProvider = firstEntry[1];
        selectedProviderName = firstEntry[0];
      }
    }

    if (!selectedProvider) {
      return error("No AI provider available", 503);
    }

    const options: GenerateOptions = {
      messages: chatMessages,
      model,
      tools,
    };

    // Generate response
    if (stream) {
      // Handle streaming response
      const streamGenerator = selectedProvider.stream(options);

      // Create a ReadableStream for SSE
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamGenerator) {
              const data = JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: model || "unknown",
                choices: [
                  {
                    index: 0,
                    delta: { content: chunk.delta },
                    finish_reason: chunk.done ? chunk.finishReason : null,
                  },
                ],
              });
              controller.enqueue(`data: ${data}\n\n`);
            }
            controller.enqueue("data: [DONE]\n\n");
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          ...CORS_HEADERS,
        },
      });
    } else {
      // Non-streaming response
      const result = await selectedProvider.generate(options);

      // Get default model from config
      const defaultModel = configLoader.get().providers?.openai?.defaultModel || "gpt-4o";

      return json({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model || defaultModel,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: result.text,
            },
            finish_reason: result.finishReason || "stop",
          },
        ],
        usage: result.usage,
      });
    }
  } catch (err) {
    log.error("Failed to handle OpenAI chat:", err);
    return error("Failed to process chat completion");
  }
}

async function handleOpenAIModels(): Promise<Response> {
  try {
    const providers = providerRegistry.getAll();
    const allModels: Array<{ id: string; object: string; created: number; owned_by: string }> = [];

    for (const [name, provider] of providers) {
      const models = await provider.listModels();
      for (const model of models) {
        allModels.push({
          id: model.id,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: name,
        });
      }
    }

    return json({
      object: "list",
      data: allModels,
    });
  } catch (err) {
    log.error("Failed to get models:", err);
    return error("Failed to get models");
  }
}

// ============================================
// Request Router
// ============================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Handle OPTIONS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Health check (public)
  if (method === "GET" && path === "/health") {
    return json({ status: "ok", timestamp: new Date().toISOString() });
  }

  // ============================================
  // OpenAI-Compatible API Routes
  // ============================================

  // Chat completions
  if (method === "POST" && path === "/v1/chat/completions") {
    return handleOpenAIChat(req);
  }

  // Models
  if (method === "GET" && path === "/v1/models") {
    return handleOpenAIModels();
  }

  // ============================================
  // Public Routes
  // ============================================

  // Stats (public for dashboard)
  if (method === "GET" && path === "/api/stats") {
    return handleStats();
  }

  // ============================================
  // API Routes
  // ============================================

  // Messages
  if (method === "GET" && path === "/api/messages") {
    return handleGetMessages(req);
  }

  // Gateways
  if (path === "/api/gateways") {
    if (method === "GET") {
      return handleGetGateways();
    }
    if (method === "POST") {
      return handleCreateGateway(req);
    }
  }

  // Tools
  if (method === "GET" && path === "/api/tools") {
    return handleGetTools();
  }

  // Tool execution
  if (method === "POST" && path === "/api/tools/execute") {
    return handleExecuteTool(req);
  }

  // Skills
  if (method === "GET" && path === "/api/skills") {
    return handleGetSkills();
  }

  // Logs
  if (method === "GET" && path === "/api/logs") {
    return handleGetLogs(req);
  }

  // Settings
  if (method === "GET" && path === "/api/settings") {
    return handleGetSettings();
  }

  // RAG endpoints
  if (method === "POST" && path === "/api/rag/index") {
    if (!ragEngineInstance) {
      return error("RAG engine not initialized", 503);
    }
    try {
      const body = await req.json();
      const { documents } = body;
      // Ingest documents one by one
      let indexed = 0;
      for (const doc of documents) {
        await ragEngineInstance.ingestDocument(doc.content, doc.metadata);
        indexed++;
      }
      return json({ success: true, indexed });
    } catch (err) {
      log.error("Failed to index documents:", err);
      return error("Failed to index documents");
    }
  }

  if (method === "POST" && path === "/api/rag/search") {
    if (!ragEngineInstance) {
      return error("RAG engine not initialized", 503);
    }
    try {
      const body = await req.json();
      const { query, topK } = body;
      const results = await ragEngineInstance.search(query, { topK: topK || 5 });
      return json({ results });
    } catch (err) {
      log.error("Failed to search documents:", err);
      return error("Failed to search documents");
    }
  }

  // 404 Not Found
  return error("Not found", 404);
}

// ============================================
// Parse Command Line Arguments
// ============================================

function parseArgs(): { port?: number; host?: string; gateway?: string } {
  const args = process.argv.slice(2);
  const result: { port?: number; host?: string; gateway?: string } = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      result.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--host" && args[i + 1]) {
      result.host = args[i + 1];
      i++;
    } else if (args[i] === "--gateway" && args[i + 1]) {
      result.gateway = args[i + 1];
      i++;
    }
  }
  
  return result;
}

// ============================================
// Start Server
// ============================================

async function startServer() {
  try {
    // bootstrap handles parseArgs and database init
    await bootstrap();

    const cmdArgs = parseArgs();
    const port = cmdArgs.port || configLoader.get().server?.port || 3000;
    const host = cmdArgs.host || configLoader.get().server?.host || "0.0.0.0";

    log.info(`KendaliAI API starting on http://${host}:${port}`);

    // Use Bun's native server
    Bun.serve({
      port,
      hostname: host,
      fetch: handleRequest,
      error(err) {
        log.error("Server error:", err);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          },
        );
      },
    });

    log.info(`KendaliAI API listening on http://${host}:${port}`);
  } catch (err) {
    log.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Start the server
startServer();
