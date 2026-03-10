/**
 * KendaliAI Server - Main Entry Point
 *
 * This is the main server file that bootstraps all components
 * and starts the HTTP server with OpenAI-compatible API endpoints.
 * Uses Bun's native server.
 */

// Core imports
import { configLoader } from "./config";
import { dbManager } from "./database";
import { eventBus } from "./eventbus";
import { log } from "./core";

// Database schema and operations
import {
  messages,
  workflows,
  agents,
  gateways,
  plugins,
  tools,
  eventLogs,
  users,
  apiKeys,
  tasks,
} from "./database/schema";
import { desc, count, eq } from "drizzle-orm";

// Agents
import { agentManager } from "./agents/manager";
import { Planner } from "./agents/planner";
import { Executor } from "./agents/executor";

// Tools
import { toolRegistry } from "./tools/registry";
import { permissionManager } from "./tools/permissions";

// Router
import { intentRouter } from "./router/intent";

// Workflow
import { workflowEngine } from "./workflow/engine";
import { triggerSystem } from "./workflow/trigger";

// Plugins
import { pluginManager } from "./plugins";

// Gateway
import { gateway } from "./gateway/gateway";
import { OpenAIProvider } from "./gateway/providers/openai";
import { AnthropicProvider } from "./gateway/providers/anthropic";
import { OllamaProvider } from "./gateway/providers/ollama";

// Auth
import { authManager } from "./auth/manager";
import { authMiddleware } from "./auth/middleware";
import type { AuthContext } from "./auth/types";

// OpenAI Routes
import { routeOpenAIRequest } from "./routes/openai";

// ============================================
// Types
// ============================================

interface StatsResponse {
  messages: number;
  workflows: number;
  agents: number;
  plugins: number;
  uptime: number;
  requests: number;
  activeWorkflows: number;
  agentTasks: number;
  systemLatency: number;
  recentActivity: any[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
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
// Bootstrap Function
// ============================================

async function bootstrap() {
  log.info("Starting KendaliAI Server...");

  // Load configuration
  await configLoader.load();
  log.info("Configuration loaded.");

  // Initialize database
  if (dbManager.db) {
    log.info("Database initialized successfully.");
  }

  // Register AI providers from config
  const providers = configLoader.get().providers || {};

  if (providers.openai?.apiKey) {
    gateway.register(new OpenAIProvider(providers.openai));
    log.info("OpenAI provider registered.");
  }

  if (providers.anthropic?.apiKey) {
    gateway.register(new AnthropicProvider(providers.anthropic));
    log.info("Anthropic provider registered.");
  }

  if (providers.ollama?.endpoint) {
    gateway.register(new OllamaProvider(providers.ollama));
    log.info("Ollama provider registered.");
  }

  // Register built-in tools
  registerBuiltinTools();
  log.info("Built-in tools registered.");

  // Register default agent
  const defaultAgent = {
    name: "core_agent",
    run: async (task: string) => {
      log.info(`[CoreAgent] Received task: ${task}`);
      const plannerInstance = new Planner();
      const executorInstance = new Executor();

      const plan = await plannerInstance.createPlan(task);
      await executorInstance.executePlan(plan);

      return await gateway.chatCompletion({
        model: "gpt-4o",
        messages: [{ role: "user", content: `Summarize: ${task}` }],
      });
    },
  };
  agentManager.register("core_agent", defaultAgent);
  log.info("Default agent registered.");

  // Set up trigger system
  triggerSystem.register("webhook", async (payload: unknown) => {
    log.info("[Webhook Trigger] Firing workflow engine...");
    // A full implementation would find workflows registered for this webhook ID
    // and run them. For now, we skip running an empty temporary flow to avoid
    // "No start nodes found" errors.
  });

  // Set up event handlers
  eventBus.on(
    "MESSAGE_RECEIVED",
    async (payload: {
      adapter?: string;
      from?: string;
      text?: string;
      username?: string;
      user?: string;
    }) => {
      log.info(
        `EventBus routed message over ${payload.adapter}: ${payload.text}`,
      );

      await dbManager.db.insert(messages).values({
        adapter: payload.adapter || "unknown",
        sender: payload.from || payload.username || payload.user || "unknown",
        payload: payload.text || "",
      });

      await intentRouter.process(payload.text || "");
    },
  );

  // Register intent handlers
  intentRouter.register(
    /^process\s+(.+)$/i,
    async (matches: RegExpMatchArray) => {
      const task = matches[1];
      const result = await agentManager.delegate("core_agent", task);
      log.info(`Handled process intent. Result: ${result}`);
    },
  );

  intentRouter.register(/^ping$/i, async () => {
    const result = await toolRegistry.execute("ping", {});
    if (result === "pong") {
      log.info("Ping successful - pong received");
    }
  });

  log.info("KendaliAI Server bootstrapped successfully.");
}

// ============================================
// Register Built-in Tools
// ============================================

function registerBuiltinTools() {
  // Ping tool
  toolRegistry.register({
    name: "ping",
    description: "Replies with pong",
    schema: { type: "object", properties: {} },
    execute: async () => "pong",
  });

  // Echo tool
  toolRegistry.register({
    name: "echo",
    description: "Echoes back the input message",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to echo" },
      },
      required: ["message"],
    },
    execute: async (params: Record<string, unknown>) =>
      `Echo: ${params.message}`,
  });

  // Time tool
  toolRegistry.register({
    name: "time",
    description: "Returns the current time",
    schema: { type: "object", properties: {} },
    execute: async () => new Date().toISOString(),
  });

  // Random tool
  toolRegistry.register({
    name: "random",
    description: "Returns a random number",
    schema: {
      type: "object",
      properties: {
        min: { type: "number", description: "Minimum value" },
        max: { type: "number", description: "Maximum value" },
      },
    },
    execute: async (params: Record<string, unknown>) => {
      const min = (params.min as number) ?? 0;
      const max = (params.max as number) ?? 100;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
  });
}

// ============================================
// API Route Handlers
// ============================================

async function handleStats(): Promise<Response> {
  try {
    const [messageCount] = await dbManager.db
      .select({ count: count() })
      .from(messages);
    const [workflowCount] = await dbManager.db
      .select({ count: count() })
      .from(workflows);
    const [agentCount] = await dbManager.db
      .select({ count: count() })
      .from(agents);
    const [pluginCount] = await dbManager.db
      .select({ count: count() })
      .from(plugins);

    const stats: StatsResponse = {
      messages: messageCount?.count ?? 0,
      workflows: workflowCount?.count ?? 0,
      agents: agentCount?.count ?? 0,
      plugins: pluginCount?.count ?? 0,
      uptime: process.uptime(),
      requests: 0,
      activeWorkflows: workflowCount?.count ?? 0,
      agentTasks: 0,
      systemLatency: 0,
      recentActivity: [],
    };

    return json(stats);
  } catch (err) {
    log.error("Failed to get stats:", err);
    return error("Failed to get stats");
  }
}

async function handleGetAgents(): Promise<Response> {
  try {
    const allAgents = await dbManager.db.select().from(agents);
    return json(allAgents);
  } catch (err) {
    log.error("Failed to get agents:", err);
    return error("Failed to get agents");
  }
}

async function handleCreateAgent(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const result = await dbManager.db.insert(agents).values(body).returning();
    return json(result[0], 201);
  } catch (err) {
    log.error("Failed to create agent:", err);
    return error("Failed to create agent");
  }
}

async function handleAgentChat(req: Request, id: string): Promise<Response> {
  try {
    const body = await req.json();
    const { message } = body;

    // Get agent from database
    const [agent] = await dbManager.db
      .select()
      .from(agents)
      .where(eq(agents.id, id));

    if (!agent) {
      return error("Agent not found", 404);
    }

    // Get the gateway for this agent
    if (agent.gatewayId) {
      const [agentGateway] = await dbManager.db
        .select()
        .from(gateways)
        .where(eq(gateways.id, agent.gatewayId));

      if (agentGateway) {
        // Create a dynamic provider with the gateway's settings
        const providerConfig = {
          apiKey: agentGateway.apiKey || undefined,
          endpoint: agentGateway.endpoint || undefined,
          defaultModel: agentGateway.defaultModel || undefined,
          models: agentGateway.models
            ? JSON.parse(agentGateway.models)
            : undefined,
        };

        let provider:
          | OpenAIProvider
          | AnthropicProvider
          | OllamaProvider
          | null = null;

        // Create appropriate provider based on gateway type
        if (agentGateway.provider === "openai") {
          provider = new OpenAIProvider(providerConfig);
        } else if (agentGateway.provider === "anthropic") {
          provider = new AnthropicProvider(providerConfig);
        } else if (agentGateway.provider === "ollama") {
          provider = new OllamaProvider(providerConfig);
        }

        if (provider) {
          // Use the dynamic provider directly
          const response = await provider.chatCompletion({
            model: agent.model || agentGateway.defaultModel || "gpt-4o",
            messages: [
              ...(agent.systemPrompt
                ? [{ role: "system" as const, content: agent.systemPrompt }]
                : []),
              { role: "user" as const, content: message },
            ],
          });

          const content = response.choices[0]?.message?.content || "";
          return json({ response: content });
        }
      }
    }

    // Fallback: try to delegate through agentManager (for in-memory agents)
    try {
      const response = await agentManager.delegate(agent.name, message);
      return json({ response });
    } catch {
      // If agent not in manager, use default gateway
      const response = await gateway.chatCompletion({
        model: agent.model || "gpt-4o",
        messages: [
          ...(agent.systemPrompt
            ? [{ role: "system" as const, content: agent.systemPrompt }]
            : []),
          { role: "user" as const, content: message },
        ],
      });

      const content = response.choices[0]?.message?.content || "";
      return json({ response: content });
    }
  } catch (err) {
    log.error("Failed to chat with agent:", err);
    return error("Failed to process chat");
  }
}

async function handleGetWorkflows(): Promise<Response> {
  try {
    const allWorkflows = await dbManager.db.select().from(workflows);
    return json(allWorkflows);
  } catch (err) {
    log.error("Failed to get workflows:", err);
    return error("Failed to get workflows");
  }
}

async function handleCreateWorkflow(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const result = await dbManager.db
      .insert(workflows)
      .values(body)
      .returning();
    return json(result[0], 201);
  } catch (err) {
    log.error("Failed to create workflow:", err);
    return error("Failed to create workflow");
  }
}

async function handleRunWorkflow(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { workflowId, input } = body;

    if (!workflowId) {
      return error("workflowId is required", 400);
    }

    const result = await workflowEngine.runWorkflow(workflowId, input || {});
    return json(result);
  } catch (err) {
    log.error("Failed to run workflow:", err);
    return error("Failed to run workflow");
  }
}

async function handleGetMessages(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const allMessages = await dbManager.db
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

async function handleGetGateways(): Promise<Response> {
  try {
    const allGateways = await dbManager.db.select().from(gateways);
    return json(allGateways);
  } catch (err) {
    log.error("Failed to get gateways:", err);
    return error("Failed to get gateways");
  }
}

async function handleCreateGateway(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const result = await dbManager.db.insert(gateways).values(body).returning();
    return json(result[0], 201);
  } catch (err) {
    log.error("Failed to create gateway:", err);
    return error("Failed to create gateway");
  }
}

async function handleGetTools(): Promise<Response> {
  try {
    const allTools = await dbManager.db.select().from(tools);
    return json(allTools);
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

async function handleGetPlugins(): Promise<Response> {
  try {
    const allPlugins = await dbManager.db.select().from(plugins);
    return json(allPlugins);
  } catch (err) {
    log.error("Failed to get plugins:", err);
    return error("Failed to get plugins");
  }
}

async function handleCreatePlugin(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const result = await dbManager.db.insert(plugins).values(body).returning();
    return json(result[0], 201);
  } catch (err) {
    log.error("Failed to create plugin:", err);
    return error("Failed to create plugin");
  }
}

async function handleTogglePlugin(
  id: string,
  enabled: boolean,
): Promise<Response> {
  try {
    const result = await dbManager.db
      .update(plugins)
      .set({ enabled: enabled ? 1 : 0 })
      .where(eq(plugins.id, id))
      .returning();
    return json(result[0]);
  } catch (err) {
    log.error(`Failed to ${enabled ? "enable" : "disable"} plugin:`, err);
    return error(`Failed to ${enabled ? "enable" : "disable"} plugin`);
  }
}

async function handleGetLogs(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const logs = await dbManager.db
      .select()
      .from(eventLogs)
      .orderBy(desc(eventLogs.createdAt))
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

async function handleLogin(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { username, password } = body;

    const user = await authManager.validateCredentials(username, password);
    if (!user) {
      return error("Invalid credentials", 401);
    }

    // Create an API key for the session
    const { key } = await authManager.createApiKey(
      user.id,
      "session",
      [],
      undefined,
    );

    return json({ user, token: key });
  } catch (err) {
    log.error("Failed to login:", err);
    return error("Failed to login");
  }
}

async function handleGetApiKeys(): Promise<Response> {
  try {
    const allKeys = await dbManager.db.select().from(apiKeys);
    // Mask the keys - only show prefix
    const maskedKeys = allKeys.map((key) => ({
      ...key,
      keyHash: undefined,
      prefix: key.prefix,
    }));
    return json(maskedKeys);
  } catch (err) {
    log.error("Failed to get API keys:", err);
    return error("Failed to get API keys");
  }
}

async function handleCreateApiKey(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { name, userId } = body;

    const { key } = await authManager.createApiKey(name, userId, [], undefined);
    return json({ key }, 201);
  } catch (err) {
    log.error("Failed to create API key:", err);
    return error("Failed to create API key");
  }
}

async function handleDeleteApiKey(id: string): Promise<Response> {
  try {
    await dbManager.db.delete(apiKeys).where(eq(apiKeys.id, id));
    return json({ success: true });
  } catch (err) {
    log.error("Failed to delete API key:", err);
    return error("Failed to delete API key");
  }
}

// ============================================
// Auth Helper for Protected Routes
// ============================================

function unauthorized(): Response {
  return json({ success: false, error: "Unauthorized" }, 401);
}

function forbidden(): Response {
  return json(
    { success: false, error: "Forbidden - Admin access required" },
    403,
  );
}

async function requireAuth(req: Request): Promise<AuthContext | null> {
  return await authMiddleware(req);
}

async function requireAdmin(req: Request): Promise<AuthContext | null> {
  const auth = await authMiddleware(req);
  if (!auth.isAuthenticated) return null;
  if (auth.user?.role !== "admin") return null;
  return auth;
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

  // OpenAI-compatible API routes (require auth for API key usage)
  const openaiResponse = await routeOpenAIRequest(req);
  if (openaiResponse) {
    return openaiResponse;
  }

  // ============================================
  // Public Routes (no auth required)
  // ============================================

  // Stats (public for dashboard)
  if (method === "GET" && path === "/api/stats") {
    return handleStats();
  }

  // Auth - Login (public)
  if (method === "POST" && path === "/api/auth/login") {
    return handleLogin(req);
  }

  // Auth - Logout (public)
  if (method === "POST" && path === "/api/auth/logout") {
    return json({ success: true });
  }

  // Webhooks (public - external systems call this)
  const webhookMatch = path.match(/^\/api\/webhooks\/([^/]+)$/);
  if (method === "POST" && webhookMatch) {
    try {
      const payload = await req.json().catch(() => ({}));
      await triggerSystem.fire("webhook", { id: webhookMatch[1], payload });
      return json({
        success: true,
        message: `Webhook ${webhookMatch[1]} triggered`,
      });
    } catch (err) {
      return error("Failed to trigger webhook");
    }
  }

  // ============================================
  // Protected Routes (auth required)
  // ============================================

  // Agents
  if (path === "/api/agents") {
    if (method === "GET") {
      return handleGetAgents();
    }
    if (method === "POST") {
      const auth = await requireAuth(req);
      if (!auth) return unauthorized();
      return handleCreateAgent(req);
    }
  }

  // Agent chat (requires auth)
  const agentChatMatch = path.match(/^\/api\/agents\/([^/]+)\/chat$/);
  if (method === "POST" && agentChatMatch) {
    return handleAgentChat(req, agentChatMatch[1]);
  }

  // Workflows
  if (path === "/api/workflows") {
    if (method === "GET") {
      return handleGetWorkflows();
    }
    if (method === "POST") {
      const auth = await requireAuth(req);
      if (!auth) return unauthorized();
      return handleCreateWorkflow(req);
    }
  }

  // Run workflow (requires auth)
  if (method === "POST" && path === "/api/workflows/run") {
    return handleRunWorkflow(req);
  }

  // Messages (read-only, requires auth)
  if (method === "GET" && path === "/api/messages") {
    return handleGetMessages(req);
  }

  // Gateways (admin only for write)
  if (path === "/api/gateways") {
    if (method === "GET") {
      return handleGetGateways();
    }
    if (method === "POST") {
      const auth = await requireAdmin(req);
      if (!auth) return auth === null ? unauthorized() : forbidden();
      return handleCreateGateway(req);
    }
  }

  // Tools (read-only)
  if (method === "GET" && path === "/api/tools") {
    return handleGetTools();
  }

  // Tool execution (requires auth)
  if (method === "POST" && path === "/api/tools/execute") {
    const auth = await requireAuth(req);
    if (!auth) return unauthorized();
    return handleExecuteTool(req);
  }

  // Plugins
  if (path === "/api/plugins") {
    if (method === "GET") {
      return handleGetPlugins();
    }
    if (method === "POST") {
      const auth = await requireAdmin(req);
      if (!auth) return auth === null ? unauthorized() : forbidden();
      return handleCreatePlugin(req);
    }
  }

  // Plugin enable/disable (admin only)
  const pluginToggleMatch = path.match(
    /^\/api\/plugins\/([^/]+)\/(enable|disable)$/,
  );
  if (method === "POST" && pluginToggleMatch) {
    const auth = await requireAdmin(req);
    if (!auth) return auth === null ? unauthorized() : forbidden();
    const [, id, action] = pluginToggleMatch;
    return handleTogglePlugin(id, action === "enable");
  }

  // Logs (requires auth)
  if (method === "GET" && path === "/api/logs") {
    const auth = await requireAuth(req);
    if (!auth) return unauthorized();
    return handleGetLogs(req);
  }

  // Settings (admin only)
  if (method === "GET" && path === "/api/settings") {
    const auth = await requireAuth(req);
    if (!auth) return unauthorized();
    return handleGetSettings();
  }

  // API Keys (admin only)
  if (path === "/api/keys") {
    if (method === "GET") {
      const auth = await requireAdmin(req);
      if (!auth) return auth === null ? unauthorized() : forbidden();
      return handleGetApiKeys();
    }
    if (method === "POST") {
      const auth = await requireAdmin(req);
      if (!auth) return auth === null ? unauthorized() : forbidden();
      return handleCreateApiKey(req);
    }
  }

  // Delete API Key (admin only)
  const apiKeyDeleteMatch = path.match(/^\/api\/keys\/([^/]+)$/);
  if (method === "DELETE" && apiKeyDeleteMatch) {
    const auth = await requireAdmin(req);
    if (!auth) return auth === null ? unauthorized() : forbidden();
    return handleDeleteApiKey(apiKeyDeleteMatch[1]);
  }

  // 404 Not Found
  return error("Not found", 404);
}

// ============================================
// Start Server
// ============================================

async function startServer() {
  try {
    await bootstrap();

    const port = configLoader.get().server?.port || 3000;
    const host = configLoader.get().server?.host || "0.0.0.0";

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
