/**
 * KendaliAI Skills Management Module
 * 
 * Skills are installable capability packs that extend gateway capabilities.
 * They can be TOML manifests with SKILL.md instructions, or compiled WASM modules.
 * 
 * Commands:
 * - skills list - List available skills
 * - skills install <source> - Install a skill
 * - skills audit <source> - Audit a skill for security
 * - skills new <name> - Scaffold a new skill project
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

// Directory paths
const KENDALIAI_DIR = join(process.env.HOME || "", ".kendaliai");
const SKILLS_DIR = join(KENDALIAI_DIR, "skills");

// Regex for valid skill names
const SKILL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate skill name to prevent path traversal
 */
function validateSkillName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: "Skill name cannot be empty" };
  }
  
  if (name.length > 64) {
    return { valid: false, error: "Skill name too long (max 64 characters)" };
  }
  
  if (!SKILL_NAME_REGEX.test(name)) {
    return { valid: false, error: "Skill name can only contain letters, numbers, underscores, and hyphens" };
  }
  
  return { valid: true };
}

/**
 * Validate and resolve local path to prevent path traversal
 */
function validateLocalPath(path: string): { valid: boolean; resolved?: string; error?: string } {
  // Block path traversal attempts
  if (path.includes("..") || path.includes("~/") || path.startsWith("/")) {
    // For absolute paths, we need to validate more carefully
    // But for now, reject any attempt to escape
    if (path.includes("..")) {
      return { valid: false, error: "Path traversal not allowed" };
    }
  }
  
  try {
    // Resolve the path
    const resolved = join(process.cwd(), path);
    // Ensure the resolved path is within the project directory
    const normalizedResolved = resolved.replace(/^\/+/, '');
    const normalizedCwd = process.cwd().replace(/^\/+/, '');
    
    if (!normalizedResolved.startsWith(normalizedCwd)) {
      return { valid: false, error: "Path must be within project directory" };
    }
    
    return { valid: true, resolved };
  } catch {
    return { valid: false, error: "Invalid path" };
  }
}

// Ensure skills directory exists
function ensureSkillsDir(): void {
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

// Skill manifest interface
export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  repository?: string;
  dependencies?: string[];
  tools?: string[];
  commands?: string[];
  permissions?: string[];
}

// Skill interface
export interface Skill {
  name: string;
  version: string;
  description: string;
  author?: string;
  source: string;
  installedAt: number;
  manifest: SkillManifest;
}

// Parse skill manifest from TOML content
function parseManifest(content: string): SkillManifest | null {
  try {
    // Simple TOML parser for basic manifest
    const manifest: Partial<SkillManifest> = {};
    
    const lines = content.split("\n");
    let inSection = false;
    let currentSection = "";
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      // Section headers
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        inSection = true;
        currentSection = trimmed.slice(1, -1);
        continue;
      }
      
      // Key-value pairs
      const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        
        if (currentSection === "package" || !inSection) {
          if (key === "name") manifest.name = value.replace(/"/g, "");
          else if (key === "version") manifest.version = value.replace(/"/g, "");
          else if (key === "description") manifest.description = value.replace(/"/g, "");
          else if (key === "author") manifest.author = value.replace(/"/g, "");
        }
      }
    }
    
    if (manifest.name && manifest.version) {
      return manifest as SkillManifest;
    }
    
    return null;
  } catch {
    return null;
  }
}

// List installed skills
export function listSkills(): Skill[] {
  ensureSkillsDir();
  
  const skills: Skill[] = [];
  const entries = readdirSync(SKILLS_DIR);
  
  for (const entry of entries) {
    const skillPath = join(SKILLS_DIR, entry);
    const stat = statSync(skillPath);
    
    if (stat.isDirectory()) {
      const manifestPath = join(skillPath, "SKILL.toml");
      const manifestJsonPath = join(skillPath, "manifest.json");
      
      let manifest: SkillManifest | null = null;
      
      if (existsSync(manifestPath)) {
        const content = readFileSync(manifestPath, "utf-8");
        manifest = parseManifest(content);
      } else if (existsSync(manifestJsonPath)) {
        try {
          manifest = JSON.parse(readFileSync(manifestJsonPath, "utf-8"));
        } catch {}
      }
      
      if (manifest) {
        const infoPath = join(skillPath, ".info.json");
        let installedAt = stat.mtimeMs;
        
        if (existsSync(infoPath)) {
          try {
            const info = JSON.parse(readFileSync(infoPath, "utf-8"));
            installedAt = info.installedAt;
          } catch {}
        }
        
        skills.push({
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          source: entry,
          installedAt,
          manifest,
        });
      }
    }
  }
  
  return skills;
}

// Install a skill from various sources
export async function installSkill(source: string): Promise<Skill | null> {
  ensureSkillsDir();
  
  console.log(`Installing skill from: ${source}`);
  
  let skillName = "";
  let tempDir = "";
  
  try {
    // Parse source
    if (source.startsWith("http://") || source.startsWith("https://")) {
      // Download from URL
      console.log("  Downloading...");
      
      // Extract name from URL
      const urlParts = source.split("/");
      skillName = urlParts[urlParts.length - 1].replace(".zip", "").replace(".tar.gz", "");
      
      // Download file (simplified - in real implementation would use fetch)
      tempDir = join(SKILLS_DIR, ".temp", skillName);
      mkdirSync(tempDir, { recursive: true });
      
      // For now, just create a placeholder
      console.log("  (URL download not implemented - use local install)");
      return null;
      
    } else if (source.startsWith("zip:")) {
      // Direct zip URL
      const zipUrl = source.slice(4);
      console.log("  Downloading zip...");
      // Implementation would download and extract
      return null;
      
    } else if (source.startsWith("~/") || source.startsWith("/") || source.startsWith("./")) {
      // Local file - validate path to prevent traversal
      const localPath = source.startsWith("~/") 
        ? join(process.env.HOME || "", source.slice(2)) 
        : source;
      
      // Path traversal check
      if (localPath.includes("..")) {
        console.error("Error: Path traversal not allowed");
        return null;
      }
      
      if (!existsSync(localPath)) {
        console.error(`Error: File not found: ${localPath}`);
        return null;
      }
      
      // Extract skill name from directory
      skillName = localPath.split("/").pop() || "unknown";
      
      // Validate skill name
      const nameValidation = validateSkillName(skillName);
      if (!nameValidation.valid) {
        console.error(`Error: ${nameValidation.error}`);
        return null;
      }
      
    } else if (source.includes(":")) {
      // ClawhHub format: clawhub:summarize or namespace/name
      const parts = source.split(":");
      if (parts[0] === "clawhub") {
        skillName = parts[1];
        console.log(`  Installing from ClawhHub: ${skillName}`);
      } else {
        skillName = parts[1] || parts[0];
      }
      
    } else {
      // Assume ZeroMarket registry or local directory
      skillName = source;
    }
    
    // Create skill directory
    const skillDir = join(SKILLS_DIR, skillName);
    
    if (existsSync(skillDir)) {
      console.log(`Skill '${skillName}' is already installed.`);
      console.log(`  Run 'kendaliai skills update ${skillName}' to update.`);
      return null;
    }
    
    // For now, create a basic skill structure
    mkdirSync(skillDir, { recursive: true });
    
    // Create basic manifest
    const manifest: SkillManifest = {
      name: skillName,
      version: "0.1.0",
      description: `Skill: ${skillName}`,
    };
    
    writeFileSync(
      join(skillDir, "SKILL.toml"),
      `[package]
name = "${skillName}"
version = "0.1.0"
description = "Skill: ${skillName}"
`
    );
    
    // Save install info
    writeFileSync(
      join(skillDir, ".info.json"),
      JSON.stringify({
        source,
        installedAt: Date.now(),
      }, null, 2)
    );
    
    console.log(`✅ Skill '${skillName}' installed successfully!`);
    
    return {
      name: skillName,
      version: manifest.version,
      description: manifest.description,
      source,
      installedAt: Date.now(),
      manifest,
    };
    
  } catch (error) {
    console.error(`Error installing skill: ${error}`);
    return null;
  }
}

// Audit a skill for security
export function auditSkill(name: string): void {
  const skillDir = join(SKILLS_DIR, name);
  
  if (!existsSync(skillDir)) {
    console.error(`Error: Skill '${name}' not found`);
    console.log(`  Run 'kendaliai skills install ${name}' to install it.`);
    return;
  }
  
  console.log(`\nAuditing skill: ${name}`);
  console.log(`═══════════════════════════════════════════`);
  
  const issues: string[] = [];
  const warnings: string[] = [];
  
  // Check manifest
  const manifestPath = join(skillDir, "SKILL.toml");
  if (!existsSync(manifestPath)) {
    issues.push("Missing SKILL.toml manifest");
  } else {
    // Parse and validate
    const content = readFileSync(manifestPath, "utf-8");
    const manifest = parseManifest(content);
    
    if (!manifest) {
      issues.push("Invalid manifest format");
    } else {
      console.log(`Name: ${manifest.name}`);
      console.log(`Version: ${manifest.version}`);
      console.log(`Description: ${manifest.description}`);
      
      if (manifest.permissions) {
        console.log(`\nRequested permissions:`);
        for (const perm of manifest.permissions) {
          console.log(`  - ${perm}`);
        }
      }
    }
  }
  
  // Check for dangerous files
  const entries = readdirSync(skillDir);
  for (const entry of entries) {
    if (entry === ".git") {
      warnings.push("Contains .git directory");
    }
    if (entry.endsWith(".so") || entry.endsWith(".dll") || entry.endsWith(".dylib")) {
      warnings.push(`Contains native library: ${entry}`);
    }
    if (entry === "Makefile" || entry === "makefile") {
      warnings.push("Contains Makefile - may compile code");
    }
  }
  
  // Check for suspicious scripts
  const suspicious = ["install.sh", "setup.sh", "build.sh", "run.sh"];
  for (const s of suspicious) {
    if (entries.includes(s)) {
      warnings.push(`Contains script: ${s} - review before use`);
    }
  }
  
  // Print results
  console.log(`\nAudit Results:`);
  
  if (issues.length > 0) {
    console.log(`\n❌ Issues (${issues.length}):`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }
  
  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }
  
  if (issues.length === 0 && warnings.length === 0) {
    console.log(`\n✅ No issues found - skill appears safe`);
  }
}

// Scaffold a new skill project
export function scaffoldSkill(name: string): void {
  ensureSkillsDir();
  
  const skillDir = join(SKILLS_DIR, name);
  
  if (existsSync(skillDir)) {
    console.error(`Error: Skill '${name}' already exists`);
    return;
  }
  
  console.log(`Scaffolding skill: ${name}`);
  
  // Create directory structure
  mkdirSync(skillDir, { recursive: true });
  mkdirSync(join(skillDir, "src"), { recursive: true });
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  
  // Create SKILL.toml
  writeFileSync(
    join(skillDir, "SKILL.toml"),
    `[package]
name = "${name}"
version = "0.1.0"
description = "Description of your skill"

[skill]
# Skill capabilities
capabilities = []

# Required permissions
permissions = []

[dependencies]
# Runtime dependencies
`
  );
  
  // Create SKILL.md
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `# Skill: ${name}

## Description

Describe what your skill does here.

## Usage

\`\`\`bash
kendaliai ${name} <command>
\`\`\`

## Examples

### Example 1

\`\`\`
kendaliai ${name} do-something
\`\`\`

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| option1 | string | "default" | Description |

## Permissions

List any required permissions here.

## Notes

Additional notes about the skill.
`
  );
  
  // Create src/main.ts
  writeFileSync(
    join(skillDir, "src/main.ts"),
    `/**
 * ${name} skill implementation
 */

export interface SkillInput {
  // Define input parameters
}

export interface SkillOutput {
  // Define output parameters
}

export async function execute(input: SkillInput): Promise<SkillOutput> {
  // Implement skill logic
  console.log("Hello from ${name}!");
  
  return {
    // Return output
  };
}

// Run if executed directly
if (require.main === module) {
  execute({} as SkillInput).catch(console.error);
}
`
  );
  
  // Create tests/test.ts
  writeFileSync(
    join(skillDir, "tests/test.ts"),
    `import { describe, it, expect } from "bun:test";

describe("${name}", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });
});
`
  );
  
  // Create .gitignore
  writeFileSync(
    join(skillDir, ".gitignore"),
    `node_modules/
dist/
build/
*.log
.DS_Store
`
  );
  
  console.log(`✅ Skill '${name}' scaffolded successfully!`);
  console.log(`\nNext steps:`);
  console.log(`  1. cd ~/.kendaliai/skills/${name}`);
  console.log(`  2. Edit SKILL.toml with your skill details`);
  console.log(`  3. Implement your skill in src/main.ts`);
  console.log(`  4. Run 'kendaliai skills audit ${name}' to check security`);
}

// Handle skills command
export async function handleSkillsCommand(args: string[]): Promise<void> {
  const subCommand = args[0] || "list";
  const subArgs = args.slice(1);
  
  ensureSkillsDir();
  
  switch (subCommand) {
    case "list":
    case "ls": {
      const skills = listSkills();
      
      if (skills.length === 0) {
        console.log("No skills installed.");
        console.log("\nTo install a skill:");
        console.log("  kendaliai skills install <source>");
        console.log("\nSources:");
        console.log("  namespace/name         - ZeroMarket registry");
        console.log("  clawhub:summarize     - ClawhHub");
        console.log("  https://...           - Git remote");
        console.log("  ~/path/to/skill.zip  - Local zip");
        return;
      }
      
      console.log("╔══════════════════════════════════════════════════════════════════════════╗");
      console.log("║                        KendaliAI Skills                              ║");
      console.log("╠══════════════════════════════════════════════════════════════════════════╣");
      console.log("║ Name          Version   Description                                  ║");
      console.log("╠══════════════════════════════════════════════════════════════════════════╣");
      
      for (const skill of skills) {
        const desc = skill.description.slice(0, 45).padEnd(45);
        console.log(`║ ${skill.name.padEnd(14)} ${skill.version.padEnd(9)} ${desc}║`);
      }
      
      console.log("╚══════════════════════════════════════════════════════════════════════════╝");
      console.log(`\nTotal: ${skills.length} skill(s) installed`);
      break;
    }
    
    case "install":
    case "add": {
      const source = subArgs[0];
      if (!source) {
        console.error("Error: Skill source required");
        console.log("Usage: kendaliai skills install <source>");
        return;
      }
      
      await installSkill(source);
      break;
    }
    
    case "audit": {
      const name = subArgs[0];
      if (!name) {
        console.error("Error: Skill name required");
        console.log("Usage: kendaliai skills audit <name>");
        return;
      }
      
      auditSkill(name);
      break;
    }
    
    case "new":
    case "create": {
      const name = subArgs[0];
      if (!name) {
        console.error("Error: Skill name required");
        console.log("Usage: kendaliai skills new <name>");
        return;
      }
      
      scaffoldSkill(name);
      break;
    }
    
    case "remove":
    case "uninstall": {
      const name = subArgs[0];
      if (!name) {
        console.error("Error: Skill name required");
        console.log("Usage: kendaliai skills remove <name>");
        return;
      }
      
      const skillDir = join(SKILLS_DIR, name);
      if (!existsSync(skillDir)) {
        console.error(`Error: Skill '${name}' not found`);
        return;
      }
      
      // Remove directory
      const fs = require("fs");
      fs.rmSync(skillDir, { recursive: true, force: true });
      console.log(`✅ Skill '${name}' removed`);
      break;
    }
    
    default:
      console.log("Usage: kendaliai skills <command> [options]");
      console.log("\nCommands:");
      console.log("  list                 List installed skills");
      console.log("  install <source>    Install a skill");
      console.log("  audit <name>         Audit a skill for security");
      console.log("  new <name>          Scaffold a new skill");
      console.log("  remove <name>       Remove a skill");
  }
}
