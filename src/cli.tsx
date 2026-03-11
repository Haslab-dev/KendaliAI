#!/usr/bin/env bun
/**
 * KendaliAI CLI Entry Point
 *
 * This is the main entry point for the KendaliAI CLI.
 * Supports both TUI mode and direct commands.
 */

import { startTUI } from "./tui";
import { listGateways, loadGateway } from "./gateway/storage";
import { gatewayRuntime } from "./gateway/runtime";

const args = process.argv.slice(2);

// Parse command
const command = args[0];
const subCommand = args[1];
const target = args[2];

/**
 * Print usage help
 */
function printHelp(): void {
  console.log(`
KendaliAI - AI Gateway Manager

Usage:
  kendaliai                    Start TUI interface
  kendaliai <command>          Run a command

Commands:
  gateway list                 List all configured gateways
  gateway status [name]        Show gateway status
  gateway start <name>         Start a gateway
  gateway stop <name>          Stop a gateway
  gateway logs <name>          Follow gateway logs (start if not running)

Examples:
  bun run src/cli.tsx                    # Start TUI
  bun run src/cli.tsx gateway list       # List gateways
  bun run src/cli.tsx gateway start bot1 # Start gateway named "bot1"
`);
}

/**
 * List all gateways
 */
async function listGatewaysCmd(): Promise<void> {
  const gateways = await listGateways();
  
  if (gateways.length === 0) {
    console.log("No gateways configured.");
    console.log("\nRun 'bun run src/cli.tsx' to create a gateway using the TUI.");
    return;
  }

  console.log("\nConfigured Gateways:\n");
  console.log("  Name                Channel     Provider      Status");
  console.log("  " + "-".repeat(55));
  
  for (const gw of gateways) {
    const running = gatewayRuntime.isRunning(gw.name) ? "running" : gw.status;
    const statusIcon = running === "running" ? "🟢" : "⚪";
    console.log(`  ${statusIcon} ${gw.name.padEnd(18)} ${(gw.channel.type || "unknown").padEnd(11)} ${(gw.provider.type || "unknown").padEnd(13)} ${running}`);
  }
  
  console.log("");
}

/**
 * Show gateway status
 */
async function gatewayStatusCmd(name?: string): Promise<void> {
  if (!name) {
    // Show all gateways status
    await listGatewaysCmd();
    return;
  }

  const gw = await loadGateway(name);
  if (!gw) {
    console.error(`Gateway "${name}" not found.`);
    process.exit(1);
  }

  const running = gatewayRuntime.isRunning(name);
  const statusIcon = running ? "🟢" : "⚪";
  
  console.log(`\nGateway: ${name}`);
  console.log("-".repeat(40));
  console.log(`  Status:   ${statusIcon} ${running ? "running" : gw.status}`);
  console.log(`  Channel:  ${gw.channel.type}`);
  console.log(`  Provider: ${gw.provider.type}`);
  console.log(`  Model:    ${gw.provider.model || "default"}`);
  console.log(`  Created:  ${gw.createdAt || "unknown"}`);
  console.log("");
}

/**
 * Start a gateway
 */
async function startGatewayCmd(name: string): Promise<void> {
  const gw = await loadGateway(name);
  if (!gw) {
    console.error(`Gateway "${name}" not found.`);
    process.exit(1);
  }

  if (gatewayRuntime.isRunning(name)) {
    console.log(`Gateway "${name}" is already running.`);
    return;
  }

  console.log(`Starting gateway "${name}"...`);
  
  try {
    await gatewayRuntime.startGateway(name);
    console.log(`✅ Gateway "${name}" started successfully.`);
    console.log("\nPress Ctrl+C to stop.");
    
    // Keep process alive
    process.on("SIGINT", async () => {
      console.log("\nStopping gateway...");
      await gatewayRuntime.stopGateway(name);
      process.exit(0);
    });
    
    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    console.error(`Failed to start gateway: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * Stop a gateway
 */
async function stopGatewayCmd(name: string): Promise<void> {
  if (!gatewayRuntime.isRunning(name)) {
    console.log(`Gateway "${name}" is not running.`);
    return;
  }

  console.log(`Stopping gateway "${name}"...`);
  await gatewayRuntime.stopGateway(name);
  console.log(`✅ Gateway "${name}" stopped.`);
}

/**
 * Follow gateway logs (starts gateway if not running)
 */
async function gatewayLogsCmd(name: string): Promise<void> {
  const gw = await loadGateway(name);
  if (!gw) {
    console.error(`Gateway "${name}" not found.`);
    process.exit(1);
  }

  // Start if not running
  if (!gatewayRuntime.isRunning(name)) {
    console.log(`Gateway "${name}" is not running. Starting...`);
    await gatewayRuntime.startGateway(name);
  }

  console.log(`\n📋 Following logs for gateway "${name}"...`);
  console.log("Press Ctrl+C to stop.\n");

  // Keep process alive and show logs
  process.on("SIGINT", async () => {
    console.log("\n\nStopping gateway...");
    await gatewayRuntime.stopGateway(name);
    process.exit(0);
  });

  // Keep the process running - logs are already printed by the gateway runtime
  await new Promise(() => {});
}

/**
 * Main CLI handler
 */
async function main(): Promise<void> {
  // No command - start TUI
  if (!command) {
    console.log("\nStarting KendaliAI TUI...\n");
    await startTUI();
    console.log("\nGoodbye!\n");
    process.exit(0);
    return;
  }

  // Help command
  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    process.exit(0);
    return;
  }

  // Gateway commands
  if (command === "gateway" || command === "gw") {
    // If subCommand looks like a gateway name (not a known command), default to start/logs
    const knownCommands = ["list", "ls", "status", "info", "start", "stop", "logs", "log"];
    
    if (!subCommand) {
      // No subcommand - show list
      await listGatewaysCmd();
      return;
    }
    
    if (!knownCommands.includes(subCommand)) {
      // subCommand is likely a gateway name - default to logs (which starts if not running)
      console.log(`No command specified, starting gateway "${subCommand}"...`);
      await gatewayLogsCmd(subCommand);
      return;
    }
    
    switch (subCommand) {
      case "list":
      case "ls":
        await listGatewaysCmd();
        break;
      
      case "status":
      case "info":
        await gatewayStatusCmd(target);
        break;
      
      case "start":
        if (!target) {
          console.error("Error: Gateway name required.");
          console.log("Usage: kendaliai gateway start <name>");
          process.exit(1);
        }
        await startGatewayCmd(target);
        break;
      
      case "stop":
        if (!target) {
          console.error("Error: Gateway name required.");
          console.log("Usage: kendaliai gateway stop <name>");
          process.exit(1);
        }
        await stopGatewayCmd(target);
        break;
      
      case "logs":
      case "log":
        if (!target) {
          console.error("Error: Gateway name required.");
          console.log("Usage: kendaliai gateway logs <name>");
          process.exit(1);
        }
        await gatewayLogsCmd(target);
        break;
    }
    return;
  }

  // Unknown command
  console.error(`Unknown command: ${command}`);
  console.log("Run 'kendaliai --help' for usage.");
  process.exit(1);
}

// Run main
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
