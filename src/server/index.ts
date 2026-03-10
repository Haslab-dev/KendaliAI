import { log, runtime } from "./core";
import { dbManager } from "./database";
import { eventBus } from "./eventbus";
import { toolRegistry } from "./tools";
import { intentRouter } from "./router";
import { gateway, OpenAIProvider } from "./gateway";
import { agentManager, Planner, Executor } from "./agents";
import { workflowEngine, triggerSystem, scheduler } from "./workflow";
import { pluginManager } from "./plugins";
import { definePlugin } from "./sdk";
import { MessagingAdapter } from "./adapters";

// Mock Telegram Adapter for bootstrap demo
class TelegramAdapter extends MessagingAdapter {
  name = "telegram";
  async connect() {
    log.info("[Telegram] Connected successfully.");
    // Simulate an incoming message to demonstrate Phase 6 integration
    setTimeout(() => {
      this.emitMessageReceived("user123", "ping");
    }, 1000);
  }
  async sendMessage(to: string, message: string) {
    log.info(`[Telegram] Sending message to ${to}: ${message}`);
  }
}

async function bootstrap() {
  log.info("Starting KendaliAI Server...");

  // Phase 1: Initialize Core Runtime
  await runtime.initialize();

  // Init Database
  if (dbManager.db) {
    log.info("Database initialized successfully.");
  }

  // Phase 2: Gateway Registration
  gateway.register(new OpenAIProvider());

  // Phase 2: Agent Registration
  agentManager.register("core_agent", {
    run: async (task: string) => {
      log.info(`[CoreAgent] Received task: ${task}`);
      const planner = new Planner();
      const executor = new Executor();

      const plan = await planner.createPlan(task);
      await executor.executePlan(plan);

      return await gateway.chatCompletion("openai", `Summarize: ${task}`);
    },
  });

  // Phase 3: Workflow Trigger System
  triggerSystem.register("webhook", async (payload: any) => {
    log.info("[Webhook Trigger] Firing workflow engine...");
    await workflowEngine.runFlow({});
  });

  // Phase 5: Plugin Registration
  const demoPlugin = definePlugin({
    id: "github",
    version: "1.0.0",
    setup: (plugin) => {
      plugin.defineTool({
        name: "fetchCommits",
        description: "Fetches recent github commits",
        schema: { repo: "string" },
        execute: async () => "Retrieved latest commits.",
      });
    },
  });
  pluginManager.load(demoPlugin);

  // Phase 6: Messaging Integration
  const tgAdapter = new TelegramAdapter();
  await tgAdapter.connect();

  // Listen to adapter messages on eventBus
  eventBus.on("MESSAGE_RECEIVED", async (payload: any) => {
    log.info(
      `EventBus routed message over ${payload.adapter}: ${payload.text}`,
    );
    await intentRouter.process(payload.text);
  });

  // Register a dummy tool
  toolRegistry.register({
    name: "ping",
    description: "Replies with pong",
    schema: {},
    execute: async () => "pong",
  });

  // Register intent mapping to agent delegates
  intentRouter.register(/^process\s+(.+)$/i, async (matches) => {
    const task = matches[1];
    const result = await agentManager.delegate("core_agent", task);
    log.info(`Handled process intent. Result: ${result}`);
  });

  intentRouter.register(/^ping$/i, async () => {
    const result = await toolRegistry.execute("ping", {});
    if (result === "pong") {
      tgAdapter.sendMessage("user123", "pong");
    }
  });

  log.info("KendaliAI Server All Phases Bootstrapped Successfully.");
}

bootstrap().catch((err) => {
  log.error("Failed to bootstrap server", err);
  process.exit(1);
});
