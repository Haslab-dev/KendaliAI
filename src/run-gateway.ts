#!/usr/bin/env bun
/**
 * KendaliAI Gateway Runner
 *
 * Starts gateways that connect channels (Telegram) to AI providers.
 *
 * Usage:
 *   bun run src/run-gateway.ts              # Start all gateways with status "running"
 *   bun run src/run-gateway.ts <name>       # Start a specific gateway
 *   bun run src/run-gateway.ts --stop <name> # Stop a specific gateway
 */

import { gatewayRuntime } from "./gateway/runtime";

const args = process.argv.slice(2);

async function main() {
  console.log("\n🤖 KendaliAI Gateway Runner\n");

  // Handle stop command
  if (args[0] === "--stop") {
    const name = args[1];
    if (!name) {
      console.error("Please specify a gateway name to stop");
      process.exit(1);
    }
    await gatewayRuntime.stopGateway(name);
    process.exit(0);
  }

  // Handle start specific gateway
  if (args[0]) {
    const name = args[0];
    try {
      await gatewayRuntime.startGateway(name);
      console.log(`\n✅ Gateway "${name}" is now running.`);
      console.log(`   Chat with your bot on Telegram!\n`);
      console.log("Press Ctrl+C to stop.\n");

      // Keep the process running
      process.on("SIGINT", async () => {
        console.log("\n\nStopping gateway...");
        await gatewayRuntime.stopGateway(name);
        process.exit(0);
      });

      // Keep process alive
      setInterval(() => {}, 1000 * 60 * 60);
    } catch (error) {
      console.error(`\n❌ Failed to start gateway "${name}":`, error);
      process.exit(1);
    }
    return;
  }

  // Start all gateways with status "running"
  try {
    await gatewayRuntime.startAll();

    const running = gatewayRuntime.getRunningGateways();
    if (running.length === 0) {
      console.log("No gateways to start. Create a gateway first using:");
      console.log("  bun run src/cli.tsx\n");
      process.exit(0);
    }

    console.log(`\n✅ ${running.length} gateway(s) running.`);
    console.log(`   Chat with your bot(s) on Telegram!\n`);
    console.log("Running gateways:");
    for (const name of running) {
      console.log(`  - ${name}`);
    }
    console.log("\nPress Ctrl+C to stop all.\n");

    // Handle shutdown
    process.on("SIGINT", async () => {
      console.log("\n\nStopping all gateways...");
      await gatewayRuntime.stopAll();
      process.exit(0);
    });

    // Keep process alive
    setInterval(() => {}, 1000 * 60 * 60);
  } catch (error) {
    console.error("\n❌ Failed to start gateways:", error);
    process.exit(1);
  }
}

main();
