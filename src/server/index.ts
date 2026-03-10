import { log, runtime } from "./core";
import { dbManager } from "./database";
import { eventBus } from "./eventbus";
import { toolRegistry } from "./tools";
import { intentRouter } from "./router";

async function bootstrap() {
  log.info("Starting KendaliAI Server...");

  // Initialize Core Runtime
  await runtime.initialize();

  // Init Database (already initialized in constructor, but can add async checks here)
  if (dbManager.db) {
    log.info("Database initialized successfully.");
  }

  // Register a dummy tool
  toolRegistry.register({
    name: "ping",
    description: "Replies with pong",
    schema: {},
    execute: async () => "pong",
  });

  // Register simple intent
  intentRouter.register(/^ping$/i, async () => {
    const result = await toolRegistry.execute("ping", {});
    log.info(`Handled ping intent. Result: ${result}`);
  });

  // Listen on a port if this is an API
  log.info("KendaliAI Server Phase 1 Bootstrapped Successfully.");

  // Simulated test
  await intentRouter.process("ping");
}

bootstrap().catch((err) => {
  log.error("Failed to bootstrap server", err);
  process.exit(1);
});
