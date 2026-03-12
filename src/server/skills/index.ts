/**
 * KendaliAI Skills & Tools System
 * 
 * Phase 5: Skills configuration, tools configuration, security sandboxing, and permissions.
 * Provides per-gateway skill and tool management with security controls.
 */

import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from "fs";
import { join } from "path";

// ============================================
// Types
// ============================================

export type SkillStatus = "enabled" | "disabled" | "error";
export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

export interface SkillConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled: boolean;
  config: Record<string, unknown>;
  permissions: string[];
  dependencies: string[];
}

export interface ToolConfig {
  name: string;
  enabled: boolean;
  riskLevel: ToolRiskLevel;
  config: Record<string, unknown>;
  allowedOperations?: string[];
  forbiddenOperations?: string[];
}

export interface GatewaySkillsConfig {
  gatewayId: string;
  skills: SkillConfig[];
  tools: ToolConfig[];
  securityPolicy: SecurityPolicy;
  createdAt: number;
  updatedAt: number;
}

export interface SecurityPolicy {
  workspaceOnly: boolean;
  allowedRoots: string[];
  forbiddenPaths: string[];
  allowedCommands: string[];
  forbiddenCommands: string[];
  sandboxEnabled: boolean;
  sandboxType: "none" | "native" | "docker";
  maxExecutionTime: number;
  maxMemoryMB: number;
  networkEnabled: boolean;
  allowedDomains: string[];
}

// ============================================
// Default Security Policy
// ============================================

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  workspaceOnly: true,
  allowedRoots: ["~/projects", "~/documents"],
  forbiddenPaths: ["~/.ssh", "~/.aws", "~/.gnupg", "/etc", "/root", "/var"],
  allowedCommands: ["git", "npm", "bun", "cargo", "ls", "cat", "grep", "find", "mkdir", "touch"],
  forbiddenCommands: ["rm -rf", "sudo", "su", "chmod 777", "dd", "mkfs", "fdisk"],
  sandboxEnabled: false,
  sandboxType: "none",
  maxExecutionTime: 30000,
  maxMemoryMB: 512,
  networkEnabled: true,
  allowedDomains: ["api.github.com", "api.openai.com", "api.deepseek.com"],
};

// ============================================
// Built-in Skills
// ============================================

export const BUILTIN_SKILLS: Record<string, Partial<SkillConfig>> = {
  "code-analysis": {
    name: "code-analysis",
    version: "1.0.0",
    description: "Analyze and review code for quality, security, and best practices",
    enabled: true,
    config: {
      languages: ["typescript", "python", "javascript", "rust", "go"],
      maxFileSize: 100000,
      checkSecurity: true,
      checkStyle: true,
    },
    permissions: ["file:read", "shell:execute"],
  },
  "git-operations": {
    name: "git-operations",
    version: "1.0.0",
    description: "Git repository operations (status, log, diff, branch)",
    enabled: true,
    config: {
      allowedCommands: ["status", "log", "diff", "branch", "show", "stash"],
    },
    permissions: ["shell:execute"],
  },
  "web-search": {
    name: "web-search",
    version: "1.0.0",
    description: "Search the web for information",
    enabled: true,
    config: {
      provider: "duckduckgo",
      maxResults: 5,
      timeout: 10000,
    },
    permissions: ["http:fetch"],
  },
  "data-processing": {
    name: "data-processing",
    version: "1.0.0",
    description: "Process and analyze data files",
    enabled: true,
    config: {
      supportedFormats: ["csv", "json", "yaml", "xml"],
      maxFileSize: 10000000,
    },
    permissions: ["file:read", "file:write"],
  },
  "debugging": {
    name: "debugging",
    version: "1.0.0",
    description: "Help debug code and troubleshoot issues",
    enabled: true,
    config: {
      analyzeStackTraces: true,
      suggestFixes: true,
    },
    permissions: ["file:read", "shell:execute"],
  },
  "faq-lookup": {
    name: "faq-lookup",
    version: "1.0.0",
    description: "Look up answers from FAQ database",
    enabled: true,
    config: {
      faqPath: "./data/faq.json",
      fuzzyMatch: true,
    },
    permissions: ["file:read"],
  },
};

// ============================================
// Built-in Tools
// ============================================

export const BUILTIN_TOOLS: Record<string, Partial<ToolConfig>> = {
  shell: {
    name: "shell",
    enabled: true,
    riskLevel: "high",
    config: {
      timeout: 30000,
      shell: "/bin/bash",
    },
    allowedOperations: ["exec"],
    forbiddenOperations: [],
  },
  git: {
    name: "git",
    enabled: true,
    riskLevel: "medium",
    config: {},
    allowedOperations: ["status", "log", "diff", "branch", "show", "stash"],
    forbiddenOperations: ["push --force", "reset --hard"],
  },
  file: {
    name: "file",
    enabled: true,
    riskLevel: "medium",
    config: {
      maxFileSize: 10000000,
    },
    allowedOperations: ["read", "write", "list", "exists"],
    forbiddenOperations: [],
  },
  http: {
    name: "http",
    enabled: true,
    riskLevel: "low",
    config: {
      timeout: 30000,
      maxRedirects: 5,
    },
    allowedOperations: ["get", "post", "put", "delete"],
    forbiddenOperations: [],
  },
  memory: {
    name: "memory",
    enabled: true,
    riskLevel: "low",
    config: {
      backend: "sqlite",
      maxEntries: 1000,
    },
    allowedOperations: ["get", "set", "delete", "list"],
    forbiddenOperations: [],
  },
  browser: {
    name: "browser",
    enabled: false,
    riskLevel: "medium",
    config: {
      headless: true,
      timeout: 60000,
    },
    allowedOperations: ["navigate", "screenshot", "click", "type"],
    forbiddenOperations: [],
  },
  python: {
    name: "python",
    enabled: false,
    riskLevel: "high",
    config: {
      pythonPath: "python3",
      timeout: 60000,
    },
    allowedOperations: ["exec", "eval"],
    forbiddenOperations: [],
  },
};

// ============================================
// Skills Manager Class
// ============================================

export class SkillsManager {
  private db: Database;
  private skillsDir: string;

  constructor(db: Database, skillsDir?: string) {
    this.db = db;
    this.skillsDir = skillsDir || join(process.env.HOME || "", ".kendaliai", "skills");
    this.ensureSkillsDir();
  }

  private ensureSkillsDir(): void {
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * Get skills configuration for a gateway
   */
  getGatewaySkillsConfig(gatewayId: string): GatewaySkillsConfig | null {
    try {
      const result = this.db.query<{
        gateway_id: string;
        skills: string;
        tools: string;
        security_policy: string;
        created_at: number;
        updated_at: number;
      }, [string]>(`
        SELECT * FROM gateway_skills WHERE gateway_id = ?
      `).get(gatewayId);

      if (!result) return null;

      return {
        gatewayId: result.gateway_id,
        skills: JSON.parse(result.skills || "[]"),
        tools: JSON.parse(result.tools || "[]"),
        securityPolicy: JSON.parse(result.security_policy || JSON.stringify(DEFAULT_SECURITY_POLICY)),
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Configure skills for a gateway
   */
  configureGatewaySkills(
    gatewayId: string,
    skills: SkillConfig[],
    tools: ToolConfig[],
    securityPolicy?: Partial<SecurityPolicy>
  ): GatewaySkillsConfig {
    const now = Date.now();
    const existing = this.getGatewaySkillsConfig(gatewayId);

    const finalPolicy: SecurityPolicy = {
      ...DEFAULT_SECURITY_POLICY,
      ...(existing?.securityPolicy || {}),
      ...(securityPolicy || {}),
    };

    const config: GatewaySkillsConfig = {
      gatewayId,
      skills,
      tools,
      securityPolicy: finalPolicy,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (existing) {
      this.db.run(`
        UPDATE gateway_skills SET 
          skills = ?,
          tools = ?,
          security_policy = ?,
          updated_at = ?
        WHERE gateway_id = ?
      `, [
        JSON.stringify(skills),
        JSON.stringify(tools),
        JSON.stringify(finalPolicy),
        now,
        gatewayId,
      ]);
    } else {
      const id = `gsk_${randomUUID().slice(0, 8)}`;
      this.db.run(`
        INSERT INTO gateway_skills (
          id, gateway_id, skills, tools, security_policy, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        gatewayId,
        JSON.stringify(skills),
        JSON.stringify(tools),
        JSON.stringify(finalPolicy),
        now,
        now,
      ]);
    }

    return config;
  }

  /**
   * Enable a skill for a gateway
   */
  enableSkill(gatewayId: string, skillName: string, config?: Record<string, unknown>): boolean {
    const gatewayConfig = this.getGatewaySkillsConfig(gatewayId);
    const builtinSkill = BUILTIN_SKILLS[skillName];

    if (!builtinSkill) {
      throw new Error(`Unknown skill: ${skillName}`);
    }

    const skills = gatewayConfig?.skills || [];
    const existingIndex = skills.findIndex(s => s.name === skillName);

    const newSkill: SkillConfig = {
      ...builtinSkill,
      ...config,
      name: skillName,
      enabled: true,
      config: { ...builtinSkill.config, ...config },
    } as SkillConfig;

    if (existingIndex >= 0) {
      skills[existingIndex] = newSkill;
    } else {
      skills.push(newSkill);
    }

    this.configureGatewaySkills(gatewayId, skills, gatewayConfig?.tools || []);
    return true;
  }

  /**
   * Disable a skill for a gateway
   */
  disableSkill(gatewayId: string, skillName: string): boolean {
    const gatewayConfig = this.getGatewaySkillsConfig(gatewayId);
    if (!gatewayConfig) return false;

    const skills = gatewayConfig.skills.filter(s => s.name !== skillName);
    this.configureGatewaySkills(gatewayId, skills, gatewayConfig.tools);
    return true;
  }

  /**
   * Enable a tool for a gateway
   */
  enableTool(gatewayId: string, toolName: string, config?: Record<string, unknown>): boolean {
    const gatewayConfig = this.getGatewaySkillsConfig(gatewayId);
    const builtinTool = BUILTIN_TOOLS[toolName];

    if (!builtinTool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const tools = gatewayConfig?.tools || [];
    const existingIndex = tools.findIndex(t => t.name === toolName);

    const newTool: ToolConfig = {
      ...builtinTool,
      ...config,
      name: toolName,
      enabled: true,
      config: { ...builtinTool.config, ...config },
    } as ToolConfig;

    if (existingIndex >= 0) {
      tools[existingIndex] = newTool;
    } else {
      tools.push(newTool);
    }

    this.configureGatewaySkills(gatewayId, gatewayConfig?.skills || [], tools);
    return true;
  }

  /**
   * Disable a tool for a gateway
   */
  disableTool(gatewayId: string, toolName: string): boolean {
    const gatewayConfig = this.getGatewaySkillsConfig(gatewayId);
    if (!gatewayConfig) return false;

    const tools = gatewayConfig.tools.filter(t => t.name !== toolName);
    this.configureGatewaySkills(gatewayId, gatewayConfig.skills, tools);
    return true;
  }

  /**
   * Check if a skill is enabled for a gateway
   */
  isSkillEnabled(gatewayId: string, skillName: string): boolean {
    const config = this.getGatewaySkillsConfig(gatewayId);
    if (!config) return false;
    return config.skills.some(s => s.name === skillName && s.enabled);
  }

  /**
   * Check if a tool is enabled for a gateway
   */
  isToolEnabled(gatewayId: string, toolName: string): boolean {
    const config = this.getGatewaySkillsConfig(gatewayId);
    if (!config) return false;
    return config.tools.some(t => t.name === toolName && t.enabled);
  }

  /**
   * Get enabled skills for a gateway
   */
  getEnabledSkills(gatewayId: string): SkillConfig[] {
    const config = this.getGatewaySkillsConfig(gatewayId);
    if (!config) return [];
    return config.skills.filter(s => s.enabled);
  }

  /**
   * Get enabled tools for a gateway
   */
  getEnabledTools(gatewayId: string): ToolConfig[] {
    const config = this.getGatewaySkillsConfig(gatewayId);
    if (!config) return [];
    return config.tools.filter(t => t.enabled);
  }

  /**
   * Validate security policy for an operation
   */
  validateOperation(
    gatewayId: string,
    operation: {
      type: "shell" | "file" | "http" | "memory";
      action: string;
      target?: string;
    }
  ): { allowed: boolean; reason?: string } {
    const config = this.getGatewaySkillsConfig(gatewayId);
    const policy = config?.securityPolicy || DEFAULT_SECURITY_POLICY;

    switch (operation.type) {
      case "shell": {
        // Check forbidden commands
        for (const forbidden of policy.forbiddenCommands) {
          if (operation.action.includes(forbidden)) {
            return { allowed: false, reason: `Forbidden command: ${forbidden}` };
          }
        }

        // Check allowed commands
        const cmdBase = operation.action.split(" ")[0];
        if (!policy.allowedCommands.includes(cmdBase)) {
          return { allowed: false, reason: `Command not in allowlist: ${cmdBase}` };
        }

        return { allowed: true };
      }

      case "file": {
        if (!operation.target) {
          return { allowed: false, reason: "No file path specified" };
        }

        // Check forbidden paths
        for (const forbidden of policy.forbiddenPaths) {
          const expanded = forbidden.replace("~", process.env.HOME || "");
          if (operation.target.includes(expanded)) {
            return { allowed: false, reason: `Access to path forbidden: ${forbidden}` };
          }
        }

        // Check workspace-only mode
        if (policy.workspaceOnly) {
          const inAllowedRoot = policy.allowedRoots.some(root => {
            const expanded = root.replace("~", process.env.HOME || "");
            return operation.target!.startsWith(expanded);
          });
          if (!inAllowedRoot) {
            return { allowed: false, reason: "File access restricted to workspace" };
          }
        }

        return { allowed: true };
      }

      case "http": {
        if (!policy.networkEnabled) {
          return { allowed: false, reason: "Network access disabled" };
        }

        if (operation.target && policy.allowedDomains.length > 0) {
          const url = new URL(operation.target);
          if (!policy.allowedDomains.includes(url.hostname)) {
            return { allowed: false, reason: `Domain not allowed: ${url.hostname}` };
          }
        }

        return { allowed: true };
      }

      case "memory":
        return { allowed: true };

      default:
        return { allowed: false, reason: "Unknown operation type" };
    }
  }

  /**
   * Update security policy for a gateway
   */
  updateSecurityPolicy(
    gatewayId: string,
    policy: Partial<SecurityPolicy>
  ): SecurityPolicy | null {
    const config = this.getGatewaySkillsConfig(gatewayId);
    if (!config) return null;

    const newPolicy: SecurityPolicy = {
      ...config.securityPolicy,
      ...policy,
    };

    this.configureGatewaySkills(gatewayId, config.skills, config.tools, newPolicy);
    return newPolicy;
  }

  /**
   * List available skills (built-in + custom)
   */
  listAvailableSkills(): Array<{ name: string; description: string; builtin: boolean }> {
    const skills = Object.entries(BUILTIN_SKILLS).map(([name, config]) => ({
      name,
      description: config.description || "",
      builtin: true,
    }));

    // TODO: Load custom skills from skills directory

    return skills;
  }

  /**
   * List available tools (built-in)
   */
  listAvailableTools(): Array<{ name: string; description: string; riskLevel: ToolRiskLevel }> {
    return Object.entries(BUILTIN_TOOLS).map(([name, config]) => ({
      name,
      description: `${name} tool`,
      riskLevel: config.riskLevel || "low",
    }));
  }
}

// ============================================
// Database Initialization
// ============================================

export function initSkillsTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS gateway_skills (
      id TEXT PRIMARY KEY,
      gateway_id TEXT NOT NULL UNIQUE,
      skills TEXT NOT NULL DEFAULT '[]',
      tools TEXT NOT NULL DEFAULT '[]',
      security_policy TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_gateway_skills_gateway ON gateway_skills(gateway_id)
  `);
}

// ============================================
// Singleton Instance
// ============================================

// Re-export from registry
export * from "./registry";

let skillsManagerInstance: SkillsManager | null = null;

export function getSkillsManager(db: Database): SkillsManager {
  if (!skillsManagerInstance) {
    skillsManagerInstance = new SkillsManager(db);
    initSkillsTables(db);
  }
  return skillsManagerInstance;
}

export { skillsManagerInstance as skillsManager };
