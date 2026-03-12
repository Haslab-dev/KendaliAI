/**
 * KendaliAI Skill Registry & Installation System
 * 
 * Supports installing skills from various sources:
 * - ZeroMarket registry
 * - ClawHub
 * - Git remote
 * - Local zip
 * - Direct zip URL
 * 
 * Skills can include WASM modules for sandboxed execution.
 */

import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync, statSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { spawn } from "child_process";

// ============================================
// Types
// ============================================

export type SkillSource = "zeromarket" | "clawhub" | "git" | "local" | "url" | "directory";
export type SkillFormat = "toml" | "wasm" | "zip";

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  repository?: string;
  homepage?: string;
  keywords?: string[];
  
  // Dependencies
  dependencies?: string[];
  runtime?: "node" | "bun" | "wasm" | "python";
  
  // Permissions
  permissions?: SkillPermission[];
  
  // Tools provided
  tools?: SkillTool[];
  
  // Configuration schema
  configSchema?: Record<string, unknown>;
  defaultConfig?: Record<string, unknown>;
  
  // Entry points
  main?: string;
  wasmModule?: string;
  pythonModule?: string;
  
  // Metadata
  installedFrom?: string;
  installedAt?: number;
  checksum?: string;
}

export interface SkillPermission {
  type: "file" | "network" | "shell" | "env" | "memory";
  access: "read" | "write" | "execute" | "all";
  target?: string;
}

export interface SkillTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler?: string;
}

export interface InstalledSkill extends SkillManifest {
  id: string;
  source: SkillSource;
  path: string;
  enabled: boolean;
  status: "active" | "error" | "disabled";
  errorMessage?: string;
  installedAt: number;
  updatedAt: number;
}

export interface SkillInstallOptions {
  force?: boolean;
  enable?: boolean;
  targetPath?: string;
  config?: Record<string, unknown>;
}

export interface SkillAuditResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
  permissions: SkillPermission[];
  risks: string[];
}

// ============================================
// Skill Registry Class
// ============================================

export class SkillRegistry {
  private db: Database;
  private skillsDir: string;
  private openSkillsEnabled: boolean;

  constructor(db: Database, skillsDir?: string) {
    this.db = db;
    this.skillsDir = skillsDir || join(process.cwd(), ".kendaliai", "skills");
    this.openSkillsEnabled = true;
    this.ensureSkillsDir();
  }

  private ensureSkillsDir(): void {
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * Parse skill source from URL or identifier
   */
  parseSource(source: string): { type: SkillSource; url: string; name: string } {
    // ZeroMarket registry: namespace/name
    if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(source)) {
      return {
        type: "zeromarket",
        url: `https://registry.kendaliai.dev/skills/${source}`,
        name: source.split("/")[1],
      };
    }

    // ClawHub short prefix: clawhub:name
    if (source.startsWith("clawhub:")) {
      const name = source.slice(8);
      return {
        type: "clawhub",
        url: `https://clawhub.ai/kendaliai/${name}`,
        name,
      };
    }

    // Local zip file
    if (source.startsWith("~/") && source.endsWith(".zip")) {
      const expanded = source.replace("~", process.env.HOME || "");
      const name = basename(source, ".zip");
      return { type: "local", url: expanded, name };
    }

    // Direct zip URL prefix
    if (source.startsWith("zip:")) {
      const url = source.slice(4);
      const name = basename(url, ".zip");
      return { type: "url", url, name };
    }

    // Direct zip URL
    if (source.endsWith(".zip")) {
      const name = basename(source, ".zip");
      return { type: "url", url: source, name };
    }

    // Git remote (https://...)
    if (source.startsWith("https://") || source.startsWith("git@")) {
      const parts = source.split("/");
      const name = parts[parts.length - 1]?.replace(/\.git$/, "") || "unknown";
      return { type: "git", url: source, name };
    }

    // Local directory (absolute or relative)
    if (source.startsWith("/") || source.startsWith("./") || source.startsWith("../")) {
      const name = basename(source);
      return { type: "directory", url: source, name };
    }

    throw new Error(`Unknown skill source format: ${source}`);
  }

  /**
   * Install a skill from a source
   */
  async install(
    source: string,
    options: SkillInstallOptions = {}
  ): Promise<InstalledSkill> {
    const { type, url, name } = this.parseSource(source);

    // Check if already installed
    const existing = this.getInstalledSkill(name);
    if (existing && !options.force) {
      throw new Error(`Skill '${name}' already installed. Use --force to reinstall.`);
    }

    const skillPath = join(this.skillsDir, name);

    // Remove existing if force, but ONLY if they are not the same path
    if (existing && options.force) {
      if (existing.path !== url || type !== 'directory') {
        await this.uninstall(name);
      } else {
        // Just remove from DB so we can re-save
        this.db.run(`DELETE FROM installed_skills WHERE name = ?`, [name]);
      }
    }

    let manifest: SkillManifest;

    try {
      switch (type) {
        case "zeromarket":
        case "clawhub":
        case "url":
          manifest = await this.installFromUrl(url, skillPath, name);
          break;
        case "local":
          manifest = await this.installFromLocalZip(url, skillPath, name);
          break;
        case "git":
          manifest = await this.installFromGit(url, skillPath, name);
          break;
        case "directory":
          manifest = await this.installFromDirectory(url, skillPath, name);
          break;
        default:
          throw new Error(`Unsupported source type: ${type}`);
      }

      // Mark source
      manifest.installedFrom = source;
      manifest.installedAt = Date.now();

      // Save to database
      const installed = this.saveInstalledSkill({
        ...manifest,
        id: `skill_${randomUUID().slice(0, 8)}`,
        source: type,
        path: skillPath,
        enabled: options.enable !== false,
        status: "active",
        installedAt: Date.now(),
        updatedAt: Date.now(),
      });

      return installed;
    } catch (error) {
      // Cleanup on failure
      if (existsSync(skillPath)) {
        try {
          rmSync(skillPath, { recursive: true });
        } catch {}
      }
      throw error;
    }
  }

  /**
   * Install from URL (download and extract zip)
   */
  private async installFromUrl(url: string, targetPath: string, name: string): Promise<SkillManifest> {
    console.log(`📥 Downloading skill from ${url}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download skill: ${response.status}`);
    }

    const zipPath = join(this.skillsDir, `${name}.zip`);
    const buffer = await response.arrayBuffer();
    writeFileSync(zipPath, Buffer.from(buffer));

    try {
      return await this.installFromLocalZip(zipPath, targetPath, name);
    } finally {
      // Cleanup zip
      try { unlinkSync(zipPath); } catch {}
    }
  }

  /**
   * Install from local zip file
   */
  private async installFromLocalZip(zipPath: string, targetPath: string, name: string): Promise<SkillManifest> {
    console.log(`📦 Extracting skill from ${zipPath}...`);

    // Create target directory
    mkdirSync(targetPath, { recursive: true });

    // Extract using unzip command
    const result = await this.runCommand("unzip", ["-o", zipPath, "-d", targetPath]);
    if (!result.success) {
      throw new Error(`Failed to extract skill: ${result.error}`);
    }

    return this.loadManifest(targetPath, name);
  }

  /**
   * Install from Git repository
   */
  private async installFromGit(url: string, targetPath: string, name: string): Promise<SkillManifest> {
    console.log(`📥 Cloning skill from ${url}...`);

    const result = await this.runCommand("git", ["clone", "--depth", "1", url, targetPath]);
    if (!result.success) {
      throw new Error(`Failed to clone skill: ${result.error}`);
    }

    return this.loadManifest(targetPath, name);
  }

  /**
   * Install from a local directory
   */
  private async installFromDirectory(sourcePath: string, targetPath: string, name: string): Promise<SkillManifest> {
    // If it's already in the target path, just load manifest
    if (sourcePath === targetPath) {
      return this.loadManifest(targetPath, name);
    }

    console.log(`📂 Registering skill from directory: ${sourcePath}...`);
    
    // Create target directory
    if (!existsSync(targetPath)) {
      mkdirSync(targetPath, { recursive: true });
    }

    // Simple copy for now (recursive)
    const { execSync } = require("child_process");
    try {
      execSync(`cp -R "${sourcePath}/"* "${targetPath}/"`);
    } catch (err) {
      throw new Error(`Failed to copy skill directory: ${err instanceof Error ? err.message : String(err)}`);
    }

    return this.loadManifest(targetPath, name);
  }

  /**
   * Load skill manifest from directory
   */
  private loadManifest(skillPath: string, name: string): SkillManifest {
    // Look for SKILL.toml or skill.toml
    const tomlPath = existsSync(join(skillPath, "SKILL.toml"))
      ? join(skillPath, "SKILL.toml")
      : join(skillPath, "skill.toml");

    if (existsSync(tomlPath)) {
      return this.parseTomlManifest(tomlPath, name);
    }

    // Look for SKILL.md
    const mdPath = join(skillPath, "SKILL.md");
    if (existsSync(mdPath)) {
      return this.parseMdManifest(mdPath, name);
    }

    // Look for package.json (npm-style skills)
    const pkgPath = join(skillPath, "package.json");
    if (existsSync(pkgPath)) {
      return this.parsePackageManifest(pkgPath, name);
    }

    // Create default manifest
    return {
      name,
      version: "0.0.1",
      description: "No description provided",
      installedFrom: "unknown",
    };
  }

  /**
   * Parse TOML manifest
   */
  private parseTomlManifest(path: string, name: string): SkillManifest {
    const content = readFileSync(path, "utf-8");
    return this.parseToml(content, name);
  }

  /**
   * Simple TOML parser
   */
  private parseToml(content: string, name: string): SkillManifest {
    const manifest: SkillManifest = {
      name,
      version: "0.0.1",
      description: "",
    };

    const lines = content.split("\n");
    let currentSection = "";

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith("#") || !trimmed) continue;

      // Section header
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        currentSection = trimmed.slice(1, -1);
        continue;
      }

      // Key-value pair
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value: any = trimmed.slice(eqIndex + 1).trim();

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // Parse arrays
        if (value.startsWith("[") && value.endsWith("]")) {
          value = value.slice(1, -1)
            .split(",")
            .map((v: string) => v.trim().replace(/^["']|["']$/g, ""))
            .filter((v: string) => v);
        }

        // Parse booleans
        if (value === "true") value = true;
        if (value === "false") value = false;

        // Assign to manifest
        if (currentSection === "") {
          (manifest as any)[key] = value;
        } else if (currentSection === "skill") {
          (manifest as any)[key] = value;
        } else if (currentSection === "permissions") {
          manifest.permissions = manifest.permissions || [];
          manifest.permissions.push({
            type: key as any,
            access: value as any,
          });
        } else if (currentSection === "tools") {
          manifest.tools = manifest.tools || [];
          manifest.tools.push({
            name: key,
            description: typeof value === "string" ? value : value.description || "",
            parameters: typeof value === "object" ? value : {},
          });
        }
      }
    }

    return manifest;
  }

  /**
   * Parse Markdown manifest (SKILL.md)
   */
  private parseMdManifest(path: string, name: string): SkillManifest {
    const content = readFileSync(path, "utf-8");
    const manifest: SkillManifest = {
      name,
      version: "0.0.1",
      description: "",
    };

    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      manifest.name = titleMatch[1].trim();
    }

    // Extract description
    const descMatch = content.match(/^>\s+(.+)$/m);
    if (descMatch) {
      manifest.description = descMatch[1].trim();
    }

    // Extract metadata from code blocks
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
    if (yamlMatch) {
      const yaml = yamlMatch[1];
      const versionMatch = yaml.match(/version:\s*"?([^"\n]+)"?/);
      if (versionMatch) manifest.version = versionMatch[1].trim();
      
      const authorMatch = yaml.match(/author:\s*"?([^"\n]+)"?/);
      if (authorMatch) manifest.author = authorMatch[1].trim();
    }

    return manifest;
  }

  /**
   * Parse package.json manifest
   */
  private parsePackageManifest(path: string, name: string): SkillManifest {
    const content = readFileSync(path, "utf-8");
    const pkg = JSON.parse(content);

    return {
      name: pkg.name || name,
      version: pkg.version || "0.0.1",
      description: pkg.description || "",
      author: pkg.author,
      license: pkg.license,
      repository: pkg.repository?.url || pkg.repository,
      keywords: pkg.keywords,
      main: pkg.main,
      dependencies: Object.keys(pkg.dependencies || {}),
    };
  }

  /**
   * Run a command
   */
  private runCommand(cmd: string, args: string[]): Promise<{ success: boolean; error?: string }> {
    return new Promise(resolve => {
      const proc = spawn(cmd, args, { stdio: "pipe" });
      let error = "";

      proc.stderr?.on("data", (data) => {
        error += data.toString();
      });

      proc.on("close", (code) => {
        resolve({ success: code === 0, error: code !== 0 ? error : undefined });
      });

      proc.on("error", (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Save installed skill to database
   */
  private saveInstalledSkill(skill: InstalledSkill): InstalledSkill {
    this.db.run(`
      INSERT OR REPLACE INTO installed_skills (
        id, name, version, description, author, license, source, path,
        manifest, enabled, status, error_message, installed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      skill.id,
      skill.name,
      skill.version,
      skill.description,
      skill.author || null,
      skill.license || null,
      skill.source,
      skill.path,
      JSON.stringify(skill),
      skill.enabled ? 1 : 0,
      skill.status,
      skill.errorMessage || null,
      skill.installedAt,
      skill.updatedAt,
    ]);

    return skill;
  }

  /**
   * Get installed skill by name
   */
  getInstalledSkill(name: string): InstalledSkill | null {
    try {
      const result = this.db.query<{
        id: string;
        name: string;
        version: string;
        description: string;
        author: string | null;
        license: string | null;
        source: string;
        path: string;
        manifest: string;
        enabled: number;
        status: string;
        error_message: string | null;
        installed_at: number;
        updated_at: number;
      }, [string]>(`
        SELECT * FROM installed_skills WHERE name = ?
      `).get(name);

      if (!result) return null;

      return {
        id: result.id,
        name: result.name,
        version: result.version,
        description: result.description,
        author: result.author || undefined,
        license: result.license || undefined,
        source: result.source as SkillSource,
        path: result.path,
        enabled: result.enabled === 1,
        status: result.status as "active" | "error" | "disabled",
        errorMessage: result.error_message || undefined,
        installedAt: result.installed_at,
        updatedAt: result.updated_at,
        ...JSON.parse(result.manifest),
      };
    } catch {
      return null;
    }
  }

  /**
   * List all installed skills
   */
  listInstalled(): InstalledSkill[] {
    try {
      const results = this.db.query<{
        id: string;
        name: string;
        version: string;
        description: string;
        source: string;
        path: string;
        manifest: string;
        enabled: number;
        status: string;
        installed_at: number;
      }, []>(`
        SELECT id, name, version, description, source, path, manifest, enabled, status, installed_at
        FROM installed_skills
        ORDER BY installed_at DESC
      `).all();

      return results.map(r => ({
        id: r.id,
        name: r.name,
        version: r.version,
        description: r.description,
        source: r.source as SkillSource,
        path: r.path,
        enabled: r.enabled === 1,
        status: r.status as "active" | "error" | "disabled",
        installedAt: r.installed_at,
        updatedAt: r.installed_at,
        ...JSON.parse(r.manifest),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Uninstall a skill
   */
  async uninstall(name: string): Promise<boolean> {
    const skill = this.getInstalledSkill(name);
    if (!skill) return false;

    // Remove directory
    if (existsSync(skill.path)) {
      try {
        rmSync(skill.path, { recursive: true });
      } catch {}
    }

    // Remove from database
    this.db.run(`DELETE FROM installed_skills WHERE name = ?`, [name]);

    return true;
  }

  /**
   * Enable a skill
   */
  enable(name: string): boolean {
    const skill = this.getInstalledSkill(name);
    if (!skill) return false;

    this.db.run(`
      UPDATE installed_skills SET enabled = 1, status = 'active', updated_at = ? WHERE name = ?
    `, [Date.now(), name]);

    return true;
  }

  /**
   * Disable a skill
   */
  disable(name: string): boolean {
    const skill = this.getInstalledSkill(name);
    if (!skill) return false;

    this.db.run(`
      UPDATE installed_skills SET enabled = 0, status = 'disabled', updated_at = ? WHERE name = ?
    `, [Date.now(), name]);

    return true;
  }

  /**
   * Audit a skill for security
   */
  async audit(sourceOrName: string): Promise<SkillAuditResult> {
    const result: SkillAuditResult = {
      passed: true,
      warnings: [],
      errors: [],
      permissions: [],
      risks: [],
    };

    let manifest: SkillManifest;

    // Check if it's an installed skill
    const installed = this.getInstalledSkill(sourceOrName);
    if (installed) {
      manifest = installed;
    } else {
      // Try to parse as source and fetch manifest
      try {
        const { type, url, name } = this.parseSource(sourceOrName);
        // For now, just return a placeholder
        result.warnings.push("Remote audit not yet implemented. Install the skill first.");
        return result;
      } catch {
        result.errors.push(`Unknown skill: ${sourceOrName}`);
        result.passed = false;
        return result;
      }
    }

    // Check permissions
    if (manifest.permissions) {
      result.permissions = manifest.permissions;

      for (const perm of manifest.permissions) {
        if (perm.type === "shell" && perm.access === "execute") {
          result.risks.push("HIGH: Skill requests shell execution permission");
        }
        if (perm.type === "file" && perm.access === "write") {
          result.risks.push("MEDIUM: Skill requests file write permission");
        }
        if (perm.type === "network" && perm.access === "all") {
          result.risks.push("MEDIUM: Skill requests unrestricted network access");
        }
      }
    }

    // Check for WASM module
    if (manifest.wasmModule) {
      result.warnings.push("Skill includes WASM module - runs in sandboxed environment");
    }

    // Check for Python module
    if (manifest.pythonModule) {
      result.risks.push("MEDIUM: Skill includes Python module - runs with Python permissions");
    }

    // Determine pass/fail
    if (result.risks.some(r => r.startsWith("HIGH:"))) {
      result.passed = false;
    }

    return result;
  }

  /**
   * Create a new skill scaffold
   */
  async scaffold(name: string, targetPath?: string): Promise<string> {
    const skillPath = targetPath || join(this.skillsDir, name);
    
    if (existsSync(skillPath)) {
      throw new Error(`Directory already exists: ${skillPath}`);
    }

    mkdirSync(skillPath, { recursive: true });

    // Create SKILL.toml
    const toml = `# ${name} Skill
name = "${name}"
version = "0.1.0"
description = "A custom skill for KendaliAI"
author = ""
license = "MIT"

[permissions]
# file = "read"
# network = "read"

[tools]
calculate_area = "Calculate the area of a rectangle"
`;

    writeFileSync(join(skillPath, "SKILL.toml"), toml);

    // Create SKILL.md
    const md = `# ${name}

> A custom skill for KendaliAI

## Description

Describe what this skill does here.

## Usage

\`\`\`
kendaliai skill install ./${name}
\`\`\`

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| \`example\` | string | "" | Example configuration option |

## Tools

### example_tool

Description of the example tool.

**Parameters:**
- \`param1\` (string): Description of parameter

## Permissions

- \`file:read\` - Read files
- \`network:read\` - Make HTTP requests
`;

    writeFileSync(join(skillPath, "SKILL.md"), md);

    // Create src directory
    mkdirSync(join(skillPath, "src"), { recursive: true });

    // Create main entry point
    const main = `/**
 * ${name} - KendaliAI Skill
 */

export default {
  name: "${name}",
  version: "0.1.0",
  
  async initialize(config) {
    console.log("${name} initialized");
  },
  
  async execute(tool, params) {
    switch (tool) {
      case "calculate_area":
        const { width, height } = params;
        return { area: (width || 0) * (height || 0), unit: "sq units" };
      default:
        throw new Error(\`Unknown tool: \${tool}\`);
    }
  },
};
`;

    writeFileSync(join(skillPath, "src", "index.ts"), main);

    return skillPath;
  }
}

// ============================================
// Database Initialization
// ============================================

export function initSkillRegistryTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS installed_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      version TEXT NOT NULL,
      description TEXT,
      author TEXT,
      license TEXT,
      source TEXT NOT NULL,
      path TEXT NOT NULL,
      manifest TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      error_message TEXT,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_installed_skills_name ON installed_skills(name)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_installed_skills_source ON installed_skills(source)
  `);
}

// ============================================
// Singleton
// ============================================

let skillRegistryInstance: SkillRegistry | null = null;

export function getSkillRegistry(db: Database): SkillRegistry {
  if (!skillRegistryInstance) {
    skillRegistryInstance = new SkillRegistry(db);
    initSkillRegistryTables(db);
  }
  return skillRegistryInstance;
}

export { skillRegistryInstance as skillRegistry };
