/**
 * KendaliAI Gateway Management Module
 * 
 * Handles all gateway-related CLI commands:
 * - gateway create <name>
 * - gateway start <name>
 * - gateway stop <name>
 * - gateway restart <name>
 * - gateway list
 * - gateway show <name>
 * - gateway delete <name>
 * - gateway logs <name>
 */

import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

// Directory paths - use project-local directory by default
const PROJECT_DIR = process.cwd();
const KENDALIAI_DIR = join(PROJECT_DIR, ".kendaliai");
const GATEWAYS_DIR = join(KENDALIAI_DIR, "gateways");
const RUN_DIR = join(KENDALIAI_DIR, "run");
const LOGS_DIR = join(KENDALIAI_DIR, "logs");
const DATA_DIR = join(KENDALIAI_DIR, "data");

// Regex for valid gateway names: alphanumeric, underscores, hyphens only
const GATEWAY_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate gateway name to prevent path traversal and command injection
 */
export function validateGatewayName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: "Gateway name cannot be empty" };
  }
  
  if (name.length > 64) {
    return { valid: false, error: "Gateway name too long (max 64 characters)" };
  }
  
  if (!GATEWAY_NAME_REGEX.test(name)) {
    return { valid: false, error: "Gateway name can only contain letters, numbers, underscores, and hyphens" };
  }
  
  // Check for path traversal attempts
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return { valid: false, error: "Invalid gateway name" };
  }
  
  return { valid: true };
}

// Ensure directories exist
function ensureDirectories(): void {
  [KENDALIAI_DIR, GATEWAYS_DIR, RUN_DIR, LOGS_DIR].forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });
}

// Gateway interface (matches database schema)
export interface Gateway {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  endpoint: string | null;
  api_key_encrypted: string | null;
  default_model: string | null;
  models: string | null;
  require_pairing: number;
  allow_public_bind: number;
  workspace_only: number;
  agent_config: string | null;
  skills: string | null;
  tools: string | null;
  daemon_enabled: number;
  daemon_pid: number | null;
  daemon_auto_restart: number;
  daemon_port: number;
  routing_config: string | null;
  config: string | null;
  status: string;
  last_error: string | null;
  started_at: number | null;
  created_at: number;
  updated_at: number;
}

// Get gateway by name
export function getGatewayByName(db: Database, name: string): Gateway | undefined {
  const result = db.query<Gateway, [string]>(`
    SELECT * FROM gateways WHERE name = ?
  `).get(name);
  return result ?? undefined;
}

// List all gateways
export function listGateways(db: Database): Gateway[] {
  return db.query<Gateway, []>(`
    SELECT * FROM gateways ORDER BY created_at DESC
  `).all();
}

// Create gateway
export async function createGateway(
  db: Database,
  name: string,
  options: {
    description?: string;
    provider?: string;
    model?: string;
    apiKey?: string;
    apiUrl?: string;
    agentConfig?: object;
    skills?: string[];
    tools?: string[];
  }
): Promise<Gateway> {
  // Validate gateway name
  const validation = validateGatewayName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  const gatewayId = `gw_${randomUUID().slice(0, 8)}`;
  const now = Date.now();
  
  // Check if gateway already exists
  const existing = getGatewayByName(db, name);
  if (existing) {
    throw new Error(`Gateway '${name}' already exists`);
  }
  
  // Auto-configure OpenAI-compatible providers
  let apiUrl = options.apiUrl;
  let model = options.model;
  const provider = options.provider || "openai";
  
  const openaiCompatibleProviders: Record<string, { endpoint: string; defaultModel: string }> = {
    deepseek: { endpoint: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" },
    zai: { endpoint: "https://api.z.ai/api/coding/paas/v4", defaultModel: "zai-1" },
    openrouter: { endpoint: "https://openrouter.ai/api/v1", defaultModel: "openrouter/auto" },
    together: { endpoint: "https://api.together.xyz/v1", defaultModel: "togethercomputer/CodeLlama-34b-Instruct" },
    groq: { endpoint: "https://api.groq.com/openai/v1", defaultModel: "llama-3.1-70b-versatile" },
  };
  
  if (provider in openaiCompatibleProviders) {
    const config = openaiCompatibleProviders[provider];
    if (!apiUrl) apiUrl = config.endpoint;
    if (!model) model = config.defaultModel;
  } else {
    if (!model) {
      if (provider === "openai") model = "gpt-4o";
      else if (provider === "anthropic") model = "claude-3-5-sonnet-20241022";
      else if (provider === "ollama") model = "llama3.2";
      else model = "default";
    }
  }
  
  // Insert new gateway
  db.run(`
    INSERT INTO gateways (
      id, name, description, provider, endpoint, default_model, api_key_encrypted,
      require_pairing, allow_public_bind, workspace_only,
      agent_config, skills, tools,
      daemon_enabled, daemon_auto_restart,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    gatewayId,
    name,
    options.description || null,
    provider,
    apiUrl || null,
    model,
    options.apiKey || null,
    1, // require_pairing
    0, // allow_public_bind
    1, // workspace_only
    options.agentConfig ? JSON.stringify(options.agentConfig) : null,
    options.skills ? JSON.stringify(options.skills) : null,
    options.tools ? JSON.stringify(options.tools) : null,
    0, // daemon_enabled
    1, // daemon_auto_restart
    "stopped",
    now,
    now,
  ]);
  
  const gateway = getGatewayByName(db, name);
  if (!gateway) {
    throw new Error("Failed to create gateway");
  }
  
  return gateway;
}

// Delete gateway
export function deleteGateway(db: Database, name: string): void {
  const gateway = getGatewayByName(db, name);
  if (!gateway) {
    throw new Error(`Gateway '${name}' not found`);
  }
  
  // Stop daemon if running
  if (gateway.daemon_pid) {
    try {
      process.kill(gateway.daemon_pid);
    } catch {
      // Process might not exist
    }
  }
  
  // Delete PID and log files
  const pidFile = join(RUN_DIR, `${name}.pid`);
  const logFile = join(LOGS_DIR, `${name}.log`);
  
  try { if (existsSync(pidFile)) unlinkSync(pidFile); } catch {}
  try { if (existsSync(logFile)) unlinkSync(logFile); } catch {}
  
  // Delete from database
  db.run(`DELETE FROM gateways WHERE id = ?`, [gateway.id]);
}

// Start gateway
export async function startGateway(
  db: Database,
  name: string,
  options: { daemon?: boolean; port?: number; host?: string }
): Promise<void> {
  ensureDirectories();
  
  const gateway = getGatewayByName(db, name);
  if (!gateway) {
    throw new Error(`Gateway '${name}' not found`);
  }
  
  if (gateway.status === "running") {
    console.log(`Gateway '${name}' is already running (PID: ${gateway.daemon_pid})`);
    return;
  }
  
  const validation = validateGatewayName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  const port = options.port || gateway.daemon_port || (42617 + Math.floor(Math.random() * 1000));
  const host = options.host || "127.0.0.1";
  
  if (options.daemon) {
    // Start as background daemon
    const pidFile = join(RUN_DIR, `${name}.pid`);
    const logFile = join(LOGS_DIR, `${name}.log`);
    
    // Check if already running
    if (gateway.daemon_pid) {
      try {
        process.kill(gateway.daemon_pid, 0);
        console.log(`Gateway '${name}' is already running (PID: ${gateway.daemon_pid})`);
        return;
      } catch {
        // Process doesn't exist
      }
    }
    
    // Start the process using Bun.spawn - run the server directly
    const child = Bun.spawn(
      ["bun", "run", "src/server/index.ts", "--port", port.toString(), "--host", host, "--gateway", name],
      {
        stdout: "inherit",
        stderr: "inherit",
        cwd: process.cwd(),
      }
    );
    
    // Get PID
    const pid = child.pid;
    if (!pid) {
      throw new Error("Failed to get PID of spawned process");
    }
    
    // Save PID
    writeFileSync(pidFile, pid.toString());
    
    // Update database
    db.run(`
      UPDATE gateways SET 
        status = 'running', 
        daemon_enabled = 1,
        daemon_pid = ?,
        daemon_port = ?,
        started_at = ?,
        updated_at = ?
      WHERE id = ?
    `, [pid, port, Date.now(), Date.now(), gateway.id]);
    
    console.log(`🚀 Gateway '${name}' started as daemon (PID: ${child.pid}, Port: ${port})`);
    console.log(`   Logs: ${logFile}`);
  } else {
    // Start in foreground
    console.log(`Starting gateway '${name}' in foreground...`);
    console.log(`   Port: ${port}, Host: ${host}`);
    
    // Start the process using Bun.spawn
    const child = Bun.spawn(
      ["bun", "run", "src/server/index.ts", "--port", port.toString(), "--host", host, "--gateway", name],
      {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
        cwd: process.cwd(),
      }
    );
    
    console.log(`   PID:  ${child.pid}`);
    
    // Update database
    db.run(`
      UPDATE gateways SET 
        status = 'running', 
        daemon_enabled = 0,
        daemon_pid = ?,
        daemon_port = ?,
        started_at = ?,
        updated_at = ?
      WHERE id = ?
    `, [child.pid, port, Date.now(), Date.now(), gateway.id]);

    // Handle signals to ensure clean up
    const cleanup = () => {
      db.run(`UPDATE gateways SET status = 'stopped', daemon_pid = NULL WHERE id = ?`, [gateway.id]);
      child.kill();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Wait for the process to exit
    await child.exited;
    
    // Update database when finished
    db.run(`
      UPDATE gateways SET 
        status = 'stopped', 
        daemon_pid = NULL,
        updated_at = ?
      WHERE id = ?
    `, [Date.now(), gateway.id]);
    
    console.log(`\n✅ Gateway '${name}' stopped`);
  }
}

// Stop gateway
export function stopGateway(db: Database, name: string, force: boolean = false): void {
  const validation = validateGatewayName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  const gateway = getGatewayByName(db, name);
  if (!gateway) {
    throw new Error(`Gateway '${name}' not found`);
  }
  
  if (gateway.status !== "running") {
    console.log(`Gateway '${name}' is not running`);
    return;
  }
  
  // Kill process
  if (gateway.daemon_pid) {
    try {
      process.kill(gateway.daemon_pid, force ? "SIGKILL" : "SIGTERM");
      console.log(`Sent stop signal to gateway '${name}' (PID: ${gateway.daemon_pid})`);
    } catch (error: any) {
      if (error.code === "ESRCH") {
        // Process is already gone, this is fine
      } else {
        console.log(`Warning: Could not kill process: ${error}`);
      }
    }
  }
  
  // Clean up PID file
  const pidFile = join(RUN_DIR, `${name}.pid`);
  try { if (existsSync(pidFile)) unlinkSync(pidFile); } catch {}
  
  // Update database
  db.run(`
    UPDATE gateways SET 
      status = 'stopped', 
      daemon_pid = NULL,
      updated_at = ?
    WHERE id = ?
  `, [Date.now(), gateway.id]);
  
  console.log(`✅ Gateway '${name}' stopped`);
}

// Restart gateway
export async function restartGateway(
  db: Database,
  name: string,
  options: { daemon?: boolean; port?: number; host?: string }
): Promise<void> {
  const gateway = getGatewayByName(db, name);
  if (!gateway) {
    throw new Error(`Gateway '${name}' not found`);
  }
  
  if (gateway.status === "running") {
    stopGateway(db, name, true);
    // Wait a bit for the process to stop
    await new Promise(r => setTimeout(r, 1000));
  }
  
  await startGateway(db, name, options);
}

// Get gateway logs
export function getGatewayLogs(name: string, lines: number = 50, follow: boolean = false): void {
  const validation = validateGatewayName(name);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}`);
    return;
  }
  
  const logFile = join(LOGS_DIR, `${name}.log`);
  
  if (!existsSync(logFile)) {
    console.log(`No logs found for gateway '${name}'`);
    return;
  }
  
  if (follow) {
    // Follow mode - watch the file
    let position = statSync(logFile).size;
    
    const watcher = setInterval(() => {
      const stats = statSync(logFile);
      if (stats.size > position) {
        const stream = require("fs").createReadStream(logFile, { start: position });
        stream.on("data", (chunk: Buffer) => {
          process.stdout.write(chunk.toString());
        });
        position = stats.size;
      }
    }, 1000);
    
    process.on("SIGINT", () => {
      clearInterval(watcher);
      process.exit(0);
    });
  } else {
    // Show last N lines
    const content = readFileSync(logFile, "utf-8");
    const allLines = content.split("\n");
    const lastLines = allLines.slice(-lines);
    console.log(lastLines.join("\n"));
  }
}

// Show gateway details
export function showGateway(db: Database, name: string): Gateway | undefined {
  return getGatewayByName(db, name);
}

// Handle gateway command
export async function handleGatewayCommand(
  db: Database,
  subCommand: string,
  args: string[]
): Promise<void> {
  ensureDirectories();
  
  switch (subCommand) {
    case "create": {
      const name = args[0];
      if (!name) {
        console.error("Error: Gateway name required");
        console.log("Usage: kendaliai gateway create <name> [options]");
        return;
      }
      
      // Validate gateway name
      const validation = validateGatewayName(name);
      if (!validation.valid) {
        console.error(`Error: ${validation.error}`);
        return;
      }
      
      // Parse options - start from index 1 (after gateway name)
      const options: {
        description?: string;
        provider?: string;
        model?: string;
        apiKey?: string;
        apiUrl?: string;
      } = {};
      
      // Skip index 0 (gateway name), start from index 1
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];
        
        if (arg === "--provider" && nextArg && !nextArg.startsWith("-")) {
          options.provider = nextArg;
          i++;
        } else if (arg === "--model" && nextArg && !nextArg.startsWith("-")) {
          options.model = nextArg;
          i++;
        } else if (arg === "--api-key" && nextArg && !nextArg.startsWith("-")) {
          options.apiKey = nextArg;
          i++;
        } else if (arg === "--api-url" && nextArg && !nextArg.startsWith("-")) {
          options.apiUrl = nextArg;
          i++;
        } else if (arg === "--description" && nextArg && !nextArg.startsWith("-")) {
          options.description = nextArg;
          i++;
        }
      }
      
          
      try {
        const gateway = await createGateway(db, name, options);
        console.log(`✅ Gateway '${name}' created successfully!`);
        console.log(`   ID: ${gateway.id}`);
        console.log(`   Provider: ${gateway.provider}`);
        console.log(`   Model: ${gateway.default_model}`);
        console.log(`\n   To start: kendaliai gateway start ${name}`);
      } catch (error) {
        console.error(`Error: ${error}`);
      }
      break;
    }
    
    case "list":
    case "ls": {
      const gateways = listGateways(db);
      if (gateways.length === 0) {
        console.log("No gateways found.");
        return;
      }
      
      console.log("╔══════════════════════════════════════════════════════════════════════════╗");
      console.log("║                        KendaliAI Gateways                              ║");
      console.log("╠══════════════════════════════════════════════════════════════════════════╣");
      console.log("║ Name          Status    PID      Provider    Model           Port      ║");
      console.log("╠══════════════════════════════════════════════════════════════════════════╣");
      
      for (const gw of gateways) {
        let currentStatus = gw.status;
        let currentPid = gw.daemon_pid;

        // Check if process is actually alive if marked as running
        if (currentStatus === "running" && currentPid) {
          try {
            process.kill(currentPid, 0);
          } catch (e) {
            // Process is not running
            currentStatus = "stopped";
            currentPid = null;
            
            // Update database for stale status
            db.run(`UPDATE gateways SET status = 'stopped', daemon_pid = NULL WHERE id = ?`, [gw.id]);
          }
        }

        const statusText = currentStatus === "running" ? "● Running" : "○ Stopped";
        const pidText = currentPid || "-";
        const model = gw.default_model || "-";
        const port = gw.daemon_port || "-";
        console.log(`║ ${gw.name.padEnd(14)} ${statusText.padEnd(9)} ${String(pidText).padEnd(7)} ${gw.provider.padEnd(10)} ${model.padEnd(16)} ${String(port).padEnd(9)}║`);
      }
      
      console.log("╚══════════════════════════════════════════════════════════════════════════╝");
      console.log(`Total: ${gateways.length} gateway(s)`);
      break;
    }
    
    case "show":
    case "info": {
      const name = args[0];
      if (!name) {
        console.error("Error: Gateway name required");
        console.log("Usage: kendaliai gateway show <name>");
        return;
      }
      
      const validation = validateGatewayName(name);
      if (!validation.valid) {
        console.error(`Error: ${validation.error}`);
        return;
      }
      
      const gateway = showGateway(db, name);
      if (!gateway) {
        console.error(`Error: Gateway '${name}' not found`);
        return;
      }
      
      console.log(`\nGateway: ${gateway.name}`);
      console.log(`═══════════════════════════════════════════`);
      console.log(`ID:            ${gateway.id}`);
      console.log(`Description:   ${gateway.description || "-"}`);
      console.log(`Provider:      ${gateway.provider}`);
      console.log(`Model:         ${gateway.default_model || "-"}`);
      console.log(`Endpoint:      ${gateway.endpoint || "-"}`);
      console.log(`Status:        ${gateway.status}`);
      console.log(`Daemon:        ${gateway.daemon_enabled ? "Enabled" : "Disabled"}`);
      console.log(`PID:           ${gateway.daemon_pid || "-"}`);
      console.log(`Port:          ${gateway.daemon_port || "-"}`);
      console.log(`Auto-restart:  ${gateway.daemon_auto_restart ? "Yes" : "No"}`);
      console.log(`Started:       ${gateway.started_at ? new Date(gateway.started_at).toISOString() : "-"}`);
      console.log(`Created:       ${new Date(gateway.created_at).toISOString()}`);
      console.log(`Updated:       ${new Date(gateway.updated_at).toISOString()}`);
      
      if (gateway.agent_config) {
        try {
          const agentConfig = JSON.parse(gateway.agent_config);
          console.log(`\nAgent Config:`);
          console.log(`  ${JSON.stringify(agentConfig, null, 2)}`);
        } catch {}
      }
      
      if (gateway.skills) {
        console.log(`\nSkills: ${gateway.skills}`);
      }
      
      if (gateway.tools) {
        console.log(`Tools: ${gateway.tools}`);
      }
      break;
    }
    
    case "start": {
      const name = args[0];
      if (!name) {
        console.error("Error: Gateway name required");
        console.log("Usage: kendaliai gateway start <name> [--daemon]");
        return;
      }
      
      const daemon = args.includes("--daemon") || args.includes("-d");
      
      try {
        await startGateway(db, name, { daemon });
      } catch (error) {
        console.error(`Error: ${error}`);
      }
      break;
    }
    
    case "stop": {
      const name = args[0];
      if (!name) {
        console.error("Error: Gateway name required");
        console.log("Usage: kendaliai gateway stop <name> [--force]");
        return;
      }
      
      const force = args.includes("--force") || args.includes("-f");
      
      try {
        stopGateway(db, name, force);
      } catch (error) {
        console.error(`Error: ${error}`);
      }
      break;
    }
    
    case "restart": {
      const name = args[0];
      if (!name) {
        console.error("Error: Gateway name required");
        console.log("Usage: kendaliai gateway restart <name> [--daemon]");
        return;
      }
      
      const daemon = args.includes("--daemon") || args.includes("-d");
      
      try {
        await restartGateway(db, name, { daemon });
      } catch (error) {
        console.error(`Error: ${error}`);
      }
      break;
    }
    
    case "delete":
    case "remove":
    case "rm": {
      const name = args[0];
      if (!name) {
        console.error("Error: Gateway name required");
        console.log("Usage: kendaliai gateway delete <name>");
        return;
      }
      
      try {
        deleteGateway(db, name);
        console.log(`✅ Gateway '${name}' deleted`);
      } catch (error) {
        console.error(`Error: ${error}`);
      }
      break;
    }
    
    case "logs": {
      const name = args[0];
      if (!name) {
        console.error("Error: Gateway name required");
        console.log("Usage: kendaliai gateway logs <name> [--follow] [--lines N]");
        return;
      }
      
      const follow = args.includes("--follow") || args.includes("-f");
      let lines = 50;
      
      const linesIndex = args.indexOf("--lines");
      if (linesIndex > 0 && args[linesIndex + 1]) {
        lines = parseInt(args[linesIndex + 1]);
      }
      
      getGatewayLogs(name, lines, follow);
      break;
    }
    
    default:
      console.log("Usage: kendaliai gateway <command> [options]");
      console.log("\nCommands:");
      console.log("  create <name>   Create new gateway");
      console.log("  start <name>     Start gateway");
      console.log("  stop <name>     Stop gateway");
      console.log("  restart <name>  Restart gateway");
      console.log("  list            List all gateways");
      console.log("  show <name>     Show gateway details");
      console.log("  delete <name>   Delete gateway");
      console.log("  logs <name>     View gateway logs");
  }
}
