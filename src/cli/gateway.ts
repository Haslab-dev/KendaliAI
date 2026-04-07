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
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import { getSkillsManager } from "../server/skills";
import { initTables } from "./db-init";

// Directory paths - use root system (~/.kendaliai) by default
const HOME_DIR = homedir();
const KENDALIAI_DIR =
  process.env.KENDALIAI_DATA_DIR || join(HOME_DIR, ".kendaliai");

/**
 * Get the workspace directory for a specific gateway
 */
export function getGatewayDir(name: string): string {
  return join(KENDALIAI_DIR, name);
}

/**
 * Get paths for gateway-specific files
 */
export function getGatewayPaths(name: string) {
  const base = getGatewayDir(name);
  return {
    base,
    config: join(base, "gateway.json"),
    data: join(base, "data"),
    db: join(base, "data", "kendaliai.db"),
    logs: join(base, "logs"),
    logFile: join(base, "logs", "gateway.log"),
    run: join(base, "run"),
    pidFile: join(base, "run", "gateway.pid"),
    // Workspace files
    identity: join(base, "IDENTITY.md"),
    user: join(base, "USER.md"),
    agents: join(base, "AGENTS.md"),
    tools: join(base, "TOOLS.md"),
    memory: join(base, "MEMORY.md"),
    memoryDir: join(base, "memory"),
    boot: join(base, "BOOT.md"),
  };
}

/**
 * Load gateway context from markdown files
 */
export function loadGatewayContext(name: string): string {
  const paths = getGatewayPaths(name);
  let context = "";

  // Load core files
  const files = [
    { name: "Identity", path: paths.identity },
    { name: "User", path: paths.user },
    { name: "LongTermMemory", path: paths.memory },
  ];

  // Load today's memory log
  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayLogPath = join(paths.memoryDir, `${todayDate}.md`);

  // Load yesterday's memory log
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const yesterdayLogPath = join(paths.memoryDir, `${yesterdayDate}.md`);

  for (const file of files) {
    if (existsSync(file.path)) {
      try {
        const content = readFileSync(file.path, "utf-8").trim();
        if (content) {
          context += `\n--- [${file.name}] ---\n${content}\n`;
        }
      } catch (err) {
        console.warn(
          `[Gateway] Failed to read ${file.name} for ${name}: ${err}`,
        );
      }
    }
  }

  // Add recent memory logs
  if (existsSync(yesterdayLogPath)) {
    try {
      const content = readFileSync(yesterdayLogPath, "utf-8").trim();
      if (content) {
        context += `\n--- [Yesterday's Memory] ---\n${content}\n`;
      }
    } catch {}
  }

  if (existsSync(todayLogPath)) {
    try {
      const content = readFileSync(todayLogPath, "utf-8").trim();
      if (content) {
        context += `\n--- [Today's Memory] ---\n${content}\n`;
      }
    } catch {}
  }

  return context;
}

/**
 * Load behavioral rules (agents.md) - loaded when needed
 */
export function loadBehavioralRules(name: string): string {
  const paths = getGatewayPaths(name);
  if (existsSync(paths.agents)) {
    try {
      return readFileSync(paths.agents, "utf-8").trim();
    } catch {}
  }
  return "";
}

// Regex for valid gateway names: alphanumeric, underscores, hyphens only
const GATEWAY_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate gateway name to prevent path traversal and command injection
 */
export function validateGatewayName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || name.length === 0) {
    return { valid: false, error: "Gateway name cannot be empty" };
  }

  if (name.length > 64) {
    return { valid: false, error: "Gateway name too long (max 64 characters)" };
  }

  if (!GATEWAY_NAME_REGEX.test(name)) {
    return {
      valid: false,
      error:
        "Gateway name can only contain letters, numbers, underscores, and hyphens",
    };
  }

  // Check for path traversal attempts
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return { valid: false, error: "Invalid gateway name" };
  }

  return { valid: true };
}

// Ensure directories exist for a specific gateway
function ensureDirectories(name?: string): void {
  if (!existsSync(KENDALIAI_DIR)) {
    mkdirSync(KENDALIAI_DIR, { recursive: true });
  }

  if (name) {
    const paths = getGatewayPaths(name);
    [paths.base, paths.data, paths.logs, paths.run].forEach((dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }
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
  autonomous_enabled: number;
  autonomous_interval: string | null;
  autonomous_max_iterations: number;
  reflection_enabled: number;
  routing_config: string | null;
  config: string | null;
  status: string;
  last_error: string | null;
  started_at: number | null;
  created_at: number;
  updated_at: number;
}

// Get gateway by name
export function getGatewayByName(
  db: Database,
  name: string,
): Gateway | undefined {
  const result = db
    .query<Gateway, [string]>(`SELECT * FROM gateways WHERE name = ?`)
    .get(name);

  if (result) return result;

  // Fallback: try to load from gateway.json if it exists
  const paths = getGatewayPaths(name);
  if (existsSync(paths.config)) {
    try {
      const config = JSON.parse(readFileSync(paths.config, "utf-8"));
      return {
        id: config.id,
        name: config.name,
        description: config.description,
        provider: config.provider,
        default_model: config.defaultModel,
        status: "stopped", // Default if just loading from file
        // ... fill other fields as needed or leave null
      } as Gateway;
    } catch {}
  }

  return undefined;
}

/**
 * Update gateway configuration in database
 */
export async function updateGateway(
  db: Database,
  name: string,
  options: {
    autonomous_enabled?: number;
    autonomous_interval?: string;
    autonomous_max_iterations?: number;
    reflection_enabled?: number;
    description?: string;
    model?: string;
  },
): Promise<void> {
  const gateway = getGatewayByName(db, name);
  if (!gateway) throw new Error(`Gateway '${name}' not found`);

  const now = Date.now();
  const updates: string[] = [];
  const params: any[] = [];

  if (options.autonomous_enabled !== undefined) {
    updates.push("autonomous_enabled = ?");
    params.push(options.autonomous_enabled);
  }
  if (options.autonomous_interval !== undefined) {
    updates.push("autonomous_interval = ?");
    params.push(options.autonomous_interval);
  }
  if (options.autonomous_max_iterations !== undefined) {
    updates.push("autonomous_max_iterations = ?");
    params.push(options.autonomous_max_iterations);
  }
  if (options.reflection_enabled !== undefined) {
    updates.push("reflection_enabled = ?");
    params.push(options.reflection_enabled);
  }
  if (options.description !== undefined) {
    updates.push("description = ?");
    params.push(options.description);
  }
  if (options.model !== undefined) {
    updates.push("default_model = ?");
    params.push(options.model);
  }

  if (updates.length === 0) return;

  updates.push("updated_at = ?");
  params.push(now);

  // WHERE clause param
  params.push(gateway.id);

  db.run(`UPDATE gateways SET ${updates.join(", ")} WHERE id = ?`, params);

  // Sync changes
  updateGatewayConfigFile(db, name);
}

/**
 * Update the gateway configuration file with current database state
 */
export function updateGatewayConfigFile(db: Database, name: string): void {
  const gateway = getGatewayByName(db, name);
  if (!gateway) return;

  const paths = getGatewayPaths(name);
  ensureDirectories(name);

  // Fetch latest skills and tools from SkillsManager
  const skillsManager = getSkillsManager(db);
  const skillsConfig = skillsManager.getGatewaySkillsConfig(gateway.id);

  const gatewayConfig = {
    id: gateway.id,
    name: gateway.name,
    description: gateway.description,
    provider: gateway.provider,
    endpoint: gateway.endpoint,
    defaultModel: gateway.default_model,
    requirePairing: !!gateway.require_pairing,
    allowPublicBind: !!gateway.allow_public_bind,
    workspaceOnly: !!gateway.workspace_only,
    agentConfig: gateway.agent_config ? JSON.parse(gateway.agent_config) : null,
    skills: skillsConfig
      ? skillsConfig.skills
      : gateway.skills
        ? JSON.parse(gateway.skills)
        : null,
    tools: skillsConfig
      ? skillsConfig.tools
      : gateway.tools
        ? JSON.parse(gateway.tools)
        : null,
    securityPolicy: skillsConfig ? skillsConfig.securityPolicy : null,
    daemonEnabled: !!gateway.daemon_enabled,
    daemonAutoRestart: !!gateway.daemon_auto_restart,
    daemonPort: gateway.daemon_port,
    createdAt: gateway.created_at,
    updatedAt: gateway.updated_at,
  };
  writeFileSync(paths.config, JSON.stringify(gatewayConfig, null, 2));
}

// List all gateways
export function listGateways(db: Database): Gateway[] {
  const gateways: Gateway[] = [];

  // 1. Scan .kendaliai directory for folders
  if (existsSync(KENDALIAI_DIR)) {
    const { readdirSync, statSync } = require("fs");
    const entries = readdirSync(KENDALIAI_DIR);

    for (const entry of entries) {
      if (
        entry === "data" ||
        entry === "logs" ||
        entry === "run" ||
        entry === "gateways" ||
        entry === "skills" ||
        entry.startsWith("kendaliai.db")
      )
        continue;

      const fullPath = join(KENDALIAI_DIR, entry);
      if (statSync(fullPath).isDirectory()) {
        const paths = getGatewayPaths(entry);
        if (existsSync(paths.config)) {
          try {
            const config = JSON.parse(readFileSync(paths.config, "utf-8"));
            gateways.push({
              id: config.id,
              name: config.name,
              provider: config.provider,
              default_model: config.defaultModel,
              daemon_port: config.daemonPort,
              status: "unknown", // Will be checked in handleGatewayCommand
            } as Gateway);
          } catch {}
        }
      }
    }
  }

  // If no folders found, fallback to database (backward compatibility)
  if (gateways.length === 0) {
    try {
      return db
        .query<Gateway, []>(`SELECT * FROM gateways ORDER BY created_at DESC`)
        .all();
    } catch {
      return [];
    }
  }

  return gateways;
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
  },
): Promise<Gateway> {
  // Validate gateway name
  const validation = validateGatewayName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  ensureDirectories(name);
  const paths = getGatewayPaths(name);

  const gatewayId = `gw_${randomUUID().slice(0, 8)}`;
  const now = Date.now();

  // Check if gateway already exists
  const existing = getGatewayByName(db, name);
  if (existing) {
    throw new Error(`Gateway '${name}' already exists`);
  }

  // Insert new gateway
  const provider = options.provider || "openai";
  db.run(
    `
    INSERT INTO gateways (
      id, name, description, provider, endpoint, default_model, api_key_encrypted,
      require_pairing, allow_public_bind, workspace_only,
      agent_config, skills, tools,
      daemon_enabled, daemon_auto_restart,
      autonomous_enabled, autonomous_interval, autonomous_max_iterations, reflection_enabled,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      gatewayId,
      name,
      options.description || null,
      provider,
      options.apiUrl || null,
      options.model || "default",
      options.apiKey || null,
      1, // require_pairing
      0, // allow_public_bind
      1, // workspace_only
      options.agentConfig ? JSON.stringify(options.agentConfig) : null,
      options.skills ? JSON.stringify(options.skills) : null,
      options.tools ? JSON.stringify(options.tools) : null,
      0, // daemon_enabled
      1, // daemon_auto_restart
      0, // autonomous_enabled
      "30s", // autonomous_interval
      10, // autonomous_max_iterations
      1, // reflection_enabled
      "stopped",
      now,
      now,
    ],
  );

  const gateway = getGatewayByName(db, name);
  if (!gateway) throw new Error("Failed to create gateway");

  // Initialize local gateway database
  const localDb = new Database(paths.db);
  await initTables(localDb);

  // Mirror the gateway entry in the local database
  localDb.run(
    `INSERT INTO gateways (id, name, provider, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [gateway.id, gateway.name, gateway.provider, "stopped", now, now],
  );

  // Write config
  updateGatewayConfigFile(db, name);

  // Initialize markdown files
  const templates = {
    agents: `# Agent Guidelines\nThis workspace is your home. Manage memory and continuity here.\n- Use MEMORY.md for long-term insight.\n- Use memory/YYYY-MM-DD.md for daily context.`,
    boot: `# Startup Instructions\n- Check for BOOTSTRAP.md for first-run setup.\n- Read identity.md and user.md on boot.\n- Verify workspace state before acting.`,
    identity: `# Identity\n\nName: ${name}\nRole: AI Assistant\nVibe: Helpful and Precise\n\n## Core Values\n- Be genuinely helpful.\n- Have opinions and be resourceful.\n- Earn trust through competence.\n\n## When asked who you are\nState your name is **${name}** and offer to help. Keep it brief.`,
    user: `# User Profile\nName: User\nNotes: Learning projects and preferences...`,
    tools: `# Environment Tools\nLocal configuration for cameras, SSH hosts, and voice preferences.`,
  };

  writeFileSync(paths.agents, templates.agents);
  writeFileSync(paths.boot, templates.boot);
  writeFileSync(paths.identity, templates.identity);
  writeFileSync(paths.user, templates.user);
  writeFileSync(paths.tools, templates.tools);

  return gateway;
}

// Delete gateway
export function deleteGateway(db: Database, name: string): void {
  const gateway = getGatewayByName(db, name);
  if (!gateway) throw new Error(`Gateway '${name}' not found`);

  const paths = getGatewayPaths(name);

  // Stop daemon if running
  if (gateway.daemon_pid) {
    try {
      process.kill(gateway.daemon_pid, "SIGTERM");
    } catch {}
  }

  // Delete gateway directory and all contents
  try {
    const fs = require("fs");
    if (existsSync(paths.base)) {
      fs.rmSync(paths.base, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Warning: Could not delete gateway directory: ${err}`);
  }

  // Delete from database
  db.run(`DELETE FROM gateways WHERE id = ?`, [gateway.id]);
}

// Start gateway
export async function startGateway(
  db: Database,
  name: string,
  options: { daemon?: boolean; port?: number; host?: string },
): Promise<void> {
  ensureDirectories();

  const gateway = getGatewayByName(db, name);
  if (!gateway) {
    throw new Error(`Gateway '${name}' not found`);
  }

  if (gateway.status === "running") {
    console.log(
      `Gateway '${name}' is already running (PID: ${gateway.daemon_pid})`,
    );
    return;
  }

  const validation = validateGatewayName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const port =
    options.port ||
    gateway.daemon_port ||
    42617 + Math.floor(Math.random() * 1000);
  const host = options.host || "127.0.0.1";

  if (options.daemon) {
    // Start as background daemon
    const paths = getGatewayPaths(name);

    // Check if already running
    if (gateway.daemon_pid) {
      try {
        process.kill(gateway.daemon_pid, 0);
        console.log(
          `Gateway '${name}' is already running (PID: ${gateway.daemon_pid})`,
        );
        return;
      } catch {}
    }

    // Open log file for appending (creates if doesn't exist)
    const logFd = openSync(paths.logFile, "a");

    // Start the process using Bun.spawn - run the server directly
    const child = Bun.spawn(
      [
        "bun",
        "run",
        "src/server/index.ts",
        "--port",
        port.toString(),
        "--host",
        host,
        "--gateway",
        name,
      ],
      {
        stdout: logFd,
        stderr: logFd,
        cwd: process.cwd(),
        detached: true,
      },
    );

    // Get PID
    const pid = child.pid;
    if (!pid) throw new Error("Failed to get PID of spawned process");

    // Save PID and update logs
    writeFileSync(paths.pidFile, pid.toString());
    writeFileSync(
      paths.logFile,
      `\n[${new Date().toISOString()}] Gateway '${name}' started (PID: ${pid}, Port: ${port})\n`,
      { flag: "a" },
    );

    // Update database
    db.run(
      `
      UPDATE gateways SET
        status = 'running',
        daemon_enabled = 1,
        daemon_pid = ?,
        daemon_port = ?,
        started_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
      [pid, port, Date.now(), Date.now(), gateway.id],
    );

    console.log(
      `🚀 Gateway '${name}' started as daemon (PID: ${child.pid}, Port: ${port})`,
    );
    console.log(`   Logs: ${paths.logFile}`);
  } else {
    // Start in foreground
    console.log(`Starting gateway '${name}' in foreground...`);
    console.log(`   Port: ${port}, Host: ${host}`);

    // Start the process using Bun.spawn
    const child = Bun.spawn(
      [
        "bun",
        "run",
        "src/server/index.ts",
        "--port",
        port.toString(),
        "--host",
        host,
        "--gateway",
        name,
      ],
      {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
        cwd: process.cwd(),
      },
    );

    console.log(`   PID:  ${child.pid}`);

    // Update database
    db.run(
      `
      UPDATE gateways SET 
        status = 'running', 
        daemon_enabled = 0,
        daemon_pid = ?,
        daemon_port = ?,
        started_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
      [child.pid, port, Date.now(), Date.now(), gateway.id],
    );

    // Handle signals to ensure clean up
    const cleanup = () => {
      db.run(
        `UPDATE gateways SET status = 'stopped', daemon_pid = NULL WHERE id = ?`,
        [gateway.id],
      );
      child.kill();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Wait for the process to exit
    await child.exited;

    // Update database when finished
    db.run(
      `
      UPDATE gateways SET 
        status = 'stopped', 
        daemon_pid = NULL,
        updated_at = ?
      WHERE id = ?
    `,
      [Date.now(), gateway.id],
    );

    console.log(`\n✅ Gateway '${name}' stopped`);
  }
}

// Stop gateway
export function stopGateway(
  db: Database,
  name: string,
  force: boolean = false,
): void {
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
      console.log(
        `Sent stop signal to gateway '${name}' (PID: ${gateway.daemon_pid})`,
      );
    } catch (error: any) {
      if (error.code === "ESRCH") {
        // Process is already gone, this is fine
      } else {
        console.log(`Warning: Could not kill process: ${error}`);
      }
    }
  }

  // Clean up PID file
  const paths = getGatewayPaths(name);
  try {
    if (existsSync(paths.pidFile)) unlinkSync(paths.pidFile);
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
    [Date.now(), gateway.id],
  );

  console.log(`✅ Gateway '${name}' stopped`);
}

// Restart gateway
export async function restartGateway(
  db: Database,
  name: string,
  options: { daemon?: boolean; port?: number; host?: string },
): Promise<void> {
  const gateway = getGatewayByName(db, name);
  if (!gateway) {
    throw new Error(`Gateway '${name}' not found`);
  }

  if (gateway.status === "running") {
    stopGateway(db, name, true);
    // Wait a bit for the process to stop
    await new Promise((r) => setTimeout(r, 1000));
  }

  await startGateway(db, name, options);
}

// Get gateway logs
export function getGatewayLogs(
  name: string,
  lines: number = 50,
  follow: boolean = false,
): void {
  const validation = validateGatewayName(name);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}`);
    return;
  }

  const paths = getGatewayPaths(name);

  if (!existsSync(paths.logFile)) {
    console.log(`No logs found for gateway '${name}'`);
    return;
  }

  if (follow) {
    // Follow mode - watch the file
    let position = statSync(paths.logFile).size;

    const watcher = setInterval(() => {
      const stats = statSync(paths.logFile);
      if (stats.size > position) {
        const stream = require("fs").createReadStream(paths.logFile, {
          start: position,
        });
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
    const content = readFileSync(paths.logFile, "utf-8");
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
  args: string[],
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
        } else if (
          arg === "--description" &&
          nextArg &&
          !nextArg.startsWith("-")
        ) {
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

    case "update": {
      const name = args[0];
      if (!name) {
        console.error("Error: Gateway name required");
        console.log("Usage: kendaliai gateway update <name> [options]");
        return;
      }

      const options: any = {};
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        if (arg === "--autonomous" && nextArg) {
          options.autonomous_enabled = parseInt(nextArg, 10);
          i++;
        } else if (arg === "--interval" && nextArg) {
          options.autonomous_interval = nextArg;
          i++;
        } else if (arg === "--max-iterations" && nextArg) {
          options.autonomous_max_iterations = parseInt(nextArg, 10);
          i++;
        } else if (arg === "--reflection" && nextArg) {
          options.reflection_enabled = parseInt(nextArg, 10);
          i++;
        } else if (arg === "--model" && nextArg) {
          options.model = nextArg;
          i++;
        } else if (arg === "--description" && nextArg) {
          options.description = nextArg;
          i++;
        }
      }

      try {
        await updateGateway(db, name, options);
        console.log(`✅ Gateway '${name}' updated successfully!`);
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

      console.log(
        "╔══════════════════════════════════════════════════════════════════════════╗",
      );
      console.log(
        "║                        KendaliAI Gateways                              ║",
      );
      console.log(
        "╠══════════════════════════════════════════════════════════════════════════╣",
      );
      console.log(
        "║ Name          Status    PID      Provider    Model           Port      ║",
      );
      console.log(
        "╠══════════════════════════════════════════════════════════════════════════╣",
      );

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
            db.run(
              `UPDATE gateways SET status = 'stopped', daemon_pid = NULL WHERE id = ?`,
              [gw.id],
            );
          }
        }

        const statusText =
          currentStatus === "running" ? "● Running" : "○ Stopped";
        const pidText = currentPid || "-";
        const model = gw.default_model || "-";
        const port = gw.daemon_port || "-";
        console.log(
          `║ ${gw.name.padEnd(14)} ${statusText.padEnd(9)} ${String(pidText).padEnd(7)} ${gw.provider.padEnd(10)} ${model.padEnd(16)} ${String(port).padEnd(9)}║`,
        );
      }

      console.log(
        "╚══════════════════════════════════════════════════════════════════════════╝",
      );
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
      console.log(
        `Daemon:        ${gateway.daemon_enabled ? "Enabled" : "Disabled"}`,
      );
      console.log(`PID:           ${gateway.daemon_pid || "-"}`);
      console.log(`Port:          ${gateway.daemon_port || "-"}`);
      console.log(
        `Auto-restart:  ${gateway.daemon_auto_restart ? "Yes" : "No"}`,
      );
      console.log(
        `Started:       ${gateway.started_at ? new Date(gateway.started_at).toISOString() : "-"}`,
      );
      console.log(
        `Created:       ${new Date(gateway.created_at).toISOString()}`,
      );
      console.log(
        `Updated:       ${new Date(gateway.updated_at).toISOString()}`,
      );

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
        console.log(
          "Usage: kendaliai gateway logs <name> [--follow] [--lines N]",
        );
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
      console.log("  update <name>   Update gateway configuration");
      console.log("  start <name>    Start gateway");
      console.log("  stop <name>     Stop gateway");
      console.log("  restart <name>  Restart gateway");
      console.log("  list            List all gateways");
      console.log("  show <name>     Show gateway details");
      console.log("  delete <name>   Delete gateway");
      console.log("  logs <name>     View gateway logs");
  }
}
