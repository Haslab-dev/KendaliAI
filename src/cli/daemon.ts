/**
 * KendaliAI Daemon Management Module
 *
 * Handles all daemon-related CLI commands:
 * - daemon status
 * - daemon stop-all
 * - daemon restart-all
 * - daemon health <name>
 */

import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import {
  getGatewayByName,
  listGateways,
  getGatewayPaths,
  type Gateway,
} from "./gateway";

// Check if process is running
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Get daemon status for all gateways
export function getDaemonStatus(db: Database): {
  gateway: Gateway;
  running: boolean;
  pid: number | null;
  uptime: number | null;
}[] {
  const gateways = listGateways(db);

  return gateways.map((gw) => {
    const isRunning: boolean =
      gw.status === "running" &&
      !!gw.daemon_pid &&
      isProcessRunning(gw.daemon_pid);
    const uptime: number | null =
      isRunning && gw.started_at ? Date.now() - gw.started_at : null;

    return {
      gateway: gw,
      running: isRunning,
      pid: gw.daemon_pid,
      uptime,
    };
  });
}

// Show daemon status
export function showDaemonStatus(db: Database): void {
  const statuses = getDaemonStatus(db);

  if (statuses.length === 0) {
    console.log("No gateways configured.");
    return;
  }

  console.log(
    "╔══════════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                        KendaliAI Daemon Status                           ║",
  );
  console.log(
    "╠══════════════════════════════════════════════════════════════════════════╣",
  );
  console.log(
    "║ Gateway          Status    PID      Uptime              Port            ║",
  );
  console.log(
    "╠══════════════════════════════════════════════════════════════════════════╣",
  );

  let runningCount = 0;

  for (const status of statuses) {
    const { gateway } = status;
    const statusStr = status.running ? "● Running" : "○ Stopped";
    const pidStr = status.pid ? String(status.pid) : "-";

    let uptimeStr = "-";
    if (status.uptime !== null) {
      const seconds = Math.floor(status.uptime / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        uptimeStr = `${hours}h ${minutes % 60}m`;
      } else if (minutes > 0) {
        uptimeStr = `${minutes}m ${seconds % 60}s`;
      } else {
        uptimeStr = `${seconds}s`;
      }
    }

    const portStr = gateway.daemon_port || "-";

    if (status.running) runningCount++;

    console.log(
      `║ ${gateway.name.padEnd(16)} ${statusStr.padEnd(9)} ${pidStr.padEnd(7)} ${uptimeStr.padEnd(19)} ${String(portStr).padEnd(14)}║`,
    );
  }

  console.log(
    "╚══════════════════════════════════════════════════════════════════════════╝",
  );
  console.log(`Total: ${statuses.length} gateway(s), ${runningCount} running`);
}

// Stop all daemons
export function stopAllDaemons(db: Database): void {
  const statuses = getDaemonStatus(db);

  let stopped = 0;

  for (const status of statuses) {
    if (status.running && status.pid) {
      try {
        process.kill(status.pid, "SIGTERM");
        console.log(`Stopped: ${status.gateway.name} (PID: ${status.pid})`);
        stopped++;

        // Clean up PID file
        const paths = getGatewayPaths(status.gateway.name);
        const pidFile = paths.pidFile;
        try {
          if (existsSync(pidFile)) unlinkSync(pidFile);
        } catch {}

        // Update database
        db.run(
          `
          UPDATE gateways SET 
            status = 'stopped', 
            daemon_pid = NULL,
            updated_at = ?
          WHERE id = ?
        `,
          [Date.now(), status.gateway.id],
        );
      } catch (error) {
        console.log(`Failed to stop ${status.gateway.name}: ${error}`);
      }
    }
  }

  console.log(`\n✅ Stopped ${stopped} daemon(s)`);
}

// Restart all daemons
export async function restartAllDaemons(db: Database): Promise<void> {
  const statuses = getDaemonStatus(db);

  console.log("Stopping all daemons...");
  stopAllDaemons(db);

  // Wait a bit
  await new Promise((r) => setTimeout(r, 2000));

  console.log("\nStarting all daemons...");

  let started = 0;

  for (const status of statuses) {
    if (status.gateway.daemon_enabled) {
      try {
        // Re-start the gateway
        const { startGateway } = await import("./gateway");
        await startGateway(db, status.gateway.name, { daemon: true });
        started++;
      } catch (error) {
        console.log(`Failed to start ${status.gateway.name}: ${error}`);
      }
    }
  }

  console.log(`\n✅ Started ${started} daemon(s)`);
}

// Health check for a gateway
export function healthCheck(db: Database, name: string): void {
  const gateway = getGatewayByName(db, name);

  if (!gateway) {
    console.error(`Error: Gateway '${name}' not found`);
    return;
  }

  console.log(`\nHealth Check: ${gateway.name}`);
  console.log(`═══════════════════════════════════════════`);

  if (gateway.status !== "running") {
    console.log("Status: ❌ STOPPED");
    return;
  }

  console.log("Status: ✅ RUNNING");

  if (gateway.daemon_pid) {
    const isRunning = isProcessRunning(gateway.daemon_pid);
    console.log(
      `Process: ${isRunning ? "✅ Running" : "❌ Dead"} (PID: ${gateway.daemon_pid})`,
    );

    if (!isRunning) {
      console.log("⚠️  Process is not running but status shows running!");
      console.log("   Run 'kendaliai gateway restart' to fix.");
    }
  }

  if (gateway.daemon_port) {
    // Check if port is listening (simple check)
    console.log(`Port: ${gateway.daemon_port}`);
  }

  if (gateway.started_at) {
    const uptime = Date.now() - gateway.started_at;
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    console.log(`Uptime: ${hours}h ${minutes % 60}m ${seconds % 60}s`);
  }

  // Check log file
  const paths = getGatewayPaths(name);
  const logFile = paths.logFile;
  if (existsSync(logFile)) {
    const stats = require("fs").statSync(logFile);
    console.log(`Log file: ${Math.round(stats.size / 1024)} KB`);

    // Check for errors in last 50 lines
    const content = require("fs").readFileSync(logFile, "utf-8");
    const lines = content.split("\n").slice(-50);
    const errorLines = lines.filter(
      (l: string) =>
        l.includes("ERROR") || l.includes("Error") || l.includes("error"),
    );

    if (errorLines.length > 0) {
      console.log(`⚠️  Found ${errorLines.length} error(s) in recent logs`);
    }
  } else {
    console.log("Log file: Not found");
  }

  console.log(`\nLast error: ${gateway.last_error || "None"}`);
}

// Handle daemon command
export async function handleDaemonCommand(
  db: Database,
  subCommand: string,
  args: string[],
): Promise<void> {
  switch (subCommand) {
    case "status": {
      showDaemonStatus(db);
      break;
    }

    case "stop-all": {
      stopAllDaemons(db);
      break;
    }

    case "restart-all": {
      await restartAllDaemons(db);
      break;
    }

    case "health": {
      const name = args[0];
      if (!name) {
        console.error("Error: Gateway name required");
        console.log("Usage: kendaliai daemon health <name>");
        return;
      }

      healthCheck(db, name);
      break;
    }

    default:
      console.log("Usage: kendaliai daemon <command> [options]");
      console.log("\nCommands:");
      console.log("  status          Show daemon status");
      console.log("  stop-all        Stop all daemons");
      console.log("  restart-all     Restart all daemons");
      console.log("  health <name>   Check daemon health");
  }
}
