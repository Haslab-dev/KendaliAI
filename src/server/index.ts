import { log, runtime } from "./core";
import { dbManager } from "./database";
import { eventBus } from "./eventbus";
import { toolRegistry } from "./tools";
import { intentRouter } from "./router";
import { gateway, OpenAIProvider } from "./gateway";
import { agentManager, Planner, Executor } from "./agents";
import { workflowEngine, triggerSystem, scheduler } from "./workflow";

async function bootstrap() {
  log.info("Starting KendaliAI Server...");

  // Initialize Core Runtime
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

  log.info("KendaliAI Server Phase 3 Bootstrapped Successfully.");

  // Simulated test
  await triggerSystem.fire("webhook", {});
}

bootstrap().catch((err) => {
  log.error("Failed to bootstrap server", err);
  process.exit(1);
});
