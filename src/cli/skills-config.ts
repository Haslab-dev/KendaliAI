/**
 * KendaliAI Skills & Tools CLI Module
 * 
 * CLI commands for managing skills and tools:
 * - skills list
 * - skills install <source>
 * - skills uninstall <name>
 * - skills enable <gateway> <skill>
 * - skills disable <gateway> <skill>
 * - skills audit <source_or_name>
 * - skills new <name>
 * - tools list
 * - tools enable <gateway> <tool>
 * - tools disable <gateway> <tool>
 * - security show <gateway>
 * - security update <gateway> <key> <value>
 */

import { Database } from "bun:sqlite";
import {
  SkillsManager,
  getSkillsManager,
  BUILTIN_SKILLS,
  BUILTIN_TOOLS,
  DEFAULT_SECURITY_POLICY,
  type SecurityPolicy,
  type SkillConfig,
  type ToolConfig,
} from "../server/skills";
import {
  SkillRegistry,
  getSkillRegistry,
  type InstalledSkill,
  type SkillSource,
} from "../server/skills/registry";

// ============================================
// Helper Functions
// ============================================

function printSkillsHelp(): void {
  console.log(`
KendaliAI Skills & Tools Commands

Usage: kendaliai skills <command> [options]
       kendaliai tools <command> [options]
       kendaliai security <command> [options]

SKILLS COMMANDS:
  list                          List all available skills
  installed                     List installed skills
  install <source>              Install a skill from source
    Sources:
      namespace/name            From ZeroMarket registry
      clawhub:name              From ClawHub
      https://...               From Git remote
      ~/path/to/skill.zip       From local zip
      zip:https://.../skill.zip From direct zip URL
  uninstall <name>              Uninstall a skill
  show <gateway>                Show skills for a gateway
  enable <gateway> <skill>      Enable a skill for a gateway
  disable <gateway> <skill>     Disable a skill for a gateway
  config <gateway> <skill> <json>  Configure skill options
  audit <source_or_name>        Audit a skill for security
  new <name>                    Scaffold a new skill project

TOOLS COMMANDS:
  list                          List all available tools
  show <gateway>                Show tools for a gateway
  enable <gateway> <tool>       Enable a tool for a gateway
  disable <gateway> <tool>      Disable a tool for a gateway
  config <gateway> <tool> <json>   Configure tool options

SECURITY COMMANDS:
  show <gateway>                Show security policy for a gateway
  update <gateway> <key> <value>  Update a security policy setting
  reset <gateway>               Reset security policy to defaults

EXAMPLES:
  # List available skills
  kendaliai skills list

  # Install skill from ZeroMarket
  kendaliai skills install namespace/code-review

  # Install skill from ClawHub
  kendaliai skills install clawhub:summarize

  # Install skill from Git
  kendaliai skills install https://github.com/user/kendaliai-skill

  # Install skill from local zip
  kendaliai skills install ~/Downloads/my-skill.zip

  # Audit a skill for security
  kendaliai skills audit code-review

  # Create a new skill scaffold
  kendaliai skills new my-custom-skill

  # Enable code-analysis skill for dev-assistant gateway
  kendaliai skills enable dev-assistant code-analysis

  # Enable shell tool with custom config
  kendaliai tools enable dev-assistant shell --config '{"timeout":60000}'

  # Update security policy
  kendaliai security update dev-assistant workspaceOnly false
`);
}

// ============================================
// Skills Commands
// ============================================

export async function handleSkillsCommand(
  db: Database,
  subCommand: string,
  args: string[]
): Promise<void> {
  const skillsManager = getSkillsManager(db);
  const skillRegistry = getSkillRegistry(db);

  switch (subCommand) {
    case "list": {
      console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
      console.log("║                        Available Skills                                   ║");
      console.log("╠══════════════════════════════════════════════════════════════════════════╣");

      const skills = skillsManager.listAvailableSkills();

      if (skills.length === 0) {
        console.log("║ No skills available                                                      ║");
      } else {
        for (const skill of skills) {
          const builtin = skill.builtin ? "[builtin]" : "[custom]";
          console.log(`║ ${skill.name.padEnd(20)} ${builtin.padEnd(10)} ${skill.description.slice(0, 35).padEnd(35)} ║`);
        }
      }

      console.log("╚══════════════════════════════════════════════════════════════════════════╝");
      console.log(`\nTotal: ${skills.length} skill(s)`);
      break;
    }

    case "installed": {
      const installed = skillRegistry.listInstalled();

      if (installed.length === 0) {
        console.log("\nNo skills installed.");
        console.log("\nTo install a skill:");
        console.log("  kendaliai skills install <source>");
        console.log("\nExamples:");
        console.log("  kendaliai skills install namespace/name");
        console.log("  kendaliai skills install clawhub:summarize");
        console.log("  kendaliai skills install https://github.com/user/skill");
        return;
      }

      console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
      console.log("║                        Installed Skills                                   ║");
      console.log("╠══════════════════════════════════════════════════════════════════════════╣");

      for (const skill of installed) {
        const status = skill.enabled ? "●" : "○";
        const source = skill.source.padEnd(10);
        const version = `v${skill.version}`.padEnd(10);
        console.log(`║ ${status} ${skill.name.padEnd(18)} ${source} ${version} ${skill.description.slice(0, 25).padEnd(25)} ║`);
      }

      console.log("╚══════════════════════════════════════════════════════════════════════════╝");
      console.log(`\nTotal: ${installed.length} skill(s) installed`);
      break;
    }

    case "install": {
      const source = args[0];
      if (!source) {
        console.error("❌ Error: Skill source required");
        console.log("Usage: kendaliai skills install <source>");
        console.log("\nSources:");
        console.log("  namespace/name            ZeroMarket registry");
        console.log("  clawhub:name              ClawHub");
        console.log("  https://github.com/...    Git remote");
        console.log("  ~/path/to/skill.zip       Local zip");
        console.log("  zip:https://.../skill.zip Direct zip URL");
        return;
      }

      try {
        console.log(`\n📥 Installing skill from: ${source}`);
        const skill = await skillRegistry.install(source, { enable: true });
        console.log(`\n✅ Successfully installed: ${skill.name} v${skill.version}`);
        console.log(`   Source: ${skill.source}`);
        console.log(`   Path: ${skill.path}`);
        if (skill.description) {
          console.log(`   Description: ${skill.description}`);
        }
      } catch (error) {
        console.error(`❌ Failed to install skill: ${error}`);
      }
      break;
    }

    case "uninstall": {
      const name = args[0];
      if (!name) {
        console.error("❌ Error: Skill name required");
        console.log("Usage: kendaliai skills uninstall <name>");
        return;
      }

      const success = await skillRegistry.uninstall(name);
      if (success) {
        console.log(`✅ Uninstalled skill: ${name}`);
      } else {
        console.error(`❌ Failed to uninstall skill: ${name}`);
      }
      break;
    }

    case "audit": {
      const sourceOrName = args[0];
      if (!sourceOrName) {
        console.error("❌ Error: Skill source or name required");
        console.log("Usage: kendaliai skills audit <source_or_name>");
        return;
      }

      try {
        const result = await skillRegistry.audit(sourceOrName);

        console.log(`\n📊 Security Audit for: ${sourceOrName}`);
        console.log(`   Status: ${result.passed ? "✅ PASSED" : "❌ FAILED"}`);

        if (result.permissions.length > 0) {
          console.log("\n🔐 Permissions requested:");
          for (const perm of result.permissions) {
            console.log(`   - ${perm.type}:${perm.access}${perm.target ? ` (${perm.target})` : ""}`);
          }
        }

        if (result.warnings.length > 0) {
          console.log("\n⚠️  Warnings:");
          for (const warning of result.warnings) {
            console.log(`   - ${warning}`);
          }
        }

        if (result.risks.length > 0) {
          console.log("\n⚠️  Risks:");
          for (const risk of result.risks) {
            console.log(`   - ${risk}`);
          }
        }

        if (result.errors.length > 0) {
          console.log("\n❌ Errors:");
          for (const error of result.errors) {
            console.log(`   - ${error}`);
          }
        }
      } catch (error) {
        console.error(`❌ Failed to audit skill: ${error}`);
      }
      break;
    }

    case "new": {
      const name = args[0];
      if (!name) {
        console.error("❌ Error: Skill name required");
        console.log("Usage: kendaliai skills new <name>");
        return;
      }

      try {
        const path = await skillRegistry.scaffold(name);
        console.log(`✅ Created new skill scaffold: ${name}`);
        console.log(`   Path: ${path}`);
        console.log("\nFiles created:");
        console.log("   - SKILL.toml    (skill manifest)");
        console.log("   - SKILL.md      (documentation)");
        console.log("   - src/index.ts  (entry point)");
        console.log("\nNext steps:");
        console.log("   1. Edit SKILL.toml to configure your skill");
        console.log("   2. Implement your skill in src/index.ts");
        console.log("   3. Test with: kendaliai skills install ~/path/to/skill");
      } catch (error) {
        console.error(`❌ Failed to create skill scaffold: ${error}`);
      }
      break;
    }

    case "show": {
      const gatewayName = args[0];
      if (!gatewayName) {
        console.error("❌ Error: Gateway name required");
        console.log("Usage: kendaliai skills show <gateway-name>");
        return;
      }

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const enabledSkills = skillsManager.getEnabledSkills(gateway.id);

      if (enabledSkills.length === 0) {
        console.log(`\nNo skills enabled for gateway '${gatewayName}'`);
        console.log("\nTo enable a skill:");
        console.log(`  kendaliai skills enable ${gatewayName} <skill-name>`);
        return;
      }

      console.log(`\nSkills for gateway '${gatewayName}':\n`);

      for (const skill of enabledSkills) {
        console.log(`  📦 ${skill.name} (v${skill.version})`);
        console.log(`     ${skill.description}`);
        if (skill.config && Object.keys(skill.config).length > 0) {
          console.log(`     Config: ${JSON.stringify(skill.config)}`);
        }
      }
      break;
    }

    case "enable": {
      const gatewayName = args[0];
      const skillName = args[1];

      if (!gatewayName || !skillName) {
        console.error("❌ Error: Gateway name and skill name required");
        console.log("Usage: kendaliai skills enable <gateway> <skill>");
        return;
      }

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      try {
        skillsManager.enableSkill(gateway.id, skillName);
        console.log(`✅ Enabled skill '${skillName}' for gateway '${gatewayName}'`);
      } catch (error) {
        console.error(`❌ Failed to enable skill: ${error}`);
      }
      break;
    }

    case "disable": {
      const gatewayName = args[0];
      const skillName = args[1];

      if (!gatewayName || !skillName) {
        console.error("❌ Error: Gateway name and skill name required");
        console.log("Usage: kendaliai skills disable <gateway> <skill>");
        return;
      }

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const success = skillsManager.disableSkill(gateway.id, skillName);
      if (success) {
        console.log(`✅ Disabled skill '${skillName}' for gateway '${gatewayName}'`);
      } else {
        console.error(`❌ Failed to disable skill`);
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
      printSkillsHelp();
      break

    default:
      console.error(`Unknown skills command: ${subCommand}`);
      printSkillsHelp();
  }
}

// ============================================
// Tools Commands
// ============================================

export async function handleToolsCommand(
  db: Database,
  subCommand: string,
  args: string[]
): Promise<void> {
  const skillsManager = getSkillsManager(db);

  switch (subCommand) {
    case "list": {
      console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
      console.log("║                        Available Tools                                    ║");
      console.log("╠══════════════════════════════════════════════════════════════════════════╣");

      const tools = skillsManager.listAvailableTools();

      if (tools.length === 0) {
        console.log("║ No tools available                                                       ║");
      } else {
        for (const tool of tools) {
          const risk = `[${tool.riskLevel}]`.padEnd(10);
          console.log(`║ ${tool.name.padEnd(20)} ${risk} ${tool.description.slice(0, 35).padEnd(35)} ║`);
        }
      }

      console.log("╚══════════════════════════════════════════════════════════════════════════╝");
      console.log(`\nTotal: ${tools.length} tool(s)`);
      break;
    }

    case "show": {
      const gatewayName = args[0];
      if (!gatewayName) {
        console.error("❌ Error: Gateway name required");
        console.log("Usage: kendaliai tools show <gateway-name>");
        return;
      }

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const enabledTools = skillsManager.getEnabledTools(gateway.id);

      if (enabledTools.length === 0) {
        console.log(`\nNo tools enabled for gateway '${gatewayName}'`);
        console.log("\nTo enable a tool:");
        console.log(`  kendaliai tools enable ${gatewayName} <tool-name>`);
        return;
      }

      console.log(`\nTools for gateway '${gatewayName}':\n`);

      for (const tool of enabledTools) {
        const risk = `[${tool.riskLevel}]`;
        console.log(`  🔧 ${tool.name} ${risk}`);
        if (tool.config && Object.keys(tool.config).length > 0) {
          console.log(`     Config: ${JSON.stringify(tool.config)}`);
        }
        if (tool.allowedOperations && tool.allowedOperations.length > 0) {
          console.log(`     Allowed: ${tool.allowedOperations.join(", ")}`);
        }
        if (tool.forbiddenOperations && tool.forbiddenOperations.length > 0) {
          console.log(`     Forbidden: ${tool.forbiddenOperations.join(", ")}`);
        }
      }
      break;
    }

    case "enable": {
      const gatewayName = args[0];
      const toolName = args[1];

      if (!gatewayName || !toolName) {
        console.error("❌ Error: Gateway name and tool name required");
        console.log("Usage: kendaliai tools enable <gateway> <tool>");
        return;
      }

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      try {
        skillsManager.enableTool(gateway.id, toolName);
        console.log(`✅ Enabled tool '${toolName}' for gateway '${gatewayName}'`);
      } catch (error) {
        console.error(`❌ Failed to enable tool: ${error}`);
      }
      break;
    }

    case "disable": {
      const gatewayName = args[0];
      const toolName = args[1];

      if (!gatewayName || !toolName) {
        console.error("❌ Error: Gateway name and tool name required");
        console.log("Usage: kendaliai tools disable <gateway> <tool>");
        return;
      }

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const success = skillsManager.disableTool(gateway.id, toolName);
      if (success) {
        console.log(`✅ Disabled tool '${toolName}' for gateway '${gatewayName}'`);
      } else {
        console.error(`❌ Failed to disable tool`);
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
      printSkillsHelp();
      break;

    default:
      console.error(`❌ Unknown tools command: ${subCommand}`);
      printSkillsHelp();
  }
}

// ============================================
// Security Commands
// ============================================

export async function handleSecurityCommand(
  db: Database,
  subCommand: string,
  args: string[]
): Promise<void> {
  const skillsManager = getSkillsManager(db);

  switch (subCommand) {
    case "show": {
      const gatewayName = args[0];
      if (!gatewayName) {
        console.error("❌ Error: Gateway name required");
        console.log("Usage: kendaliai security show <gateway-name>");
        return;
      }

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const config = skillsManager.getGatewaySkillsConfig(gateway.id);
      const policy = config?.securityPolicy || DEFAULT_SECURITY_POLICY;

      console.log(`\nSecurity Policy for '${gatewayName}':\n`);
      console.log(`  workspaceOnly      - ${policy.workspaceOnly}`);
      console.log(`  sandboxEnabled     - ${policy.sandboxEnabled}`);
      console.log(`  sandboxType        - ${policy.sandboxType}`);
      console.log(`  maxExecutionTime   - ${policy.maxExecutionTime}ms`);
      console.log(`  maxMemoryMB        - ${policy.maxMemoryMB}MB`);
      console.log(`  networkEnabled     - ${policy.networkEnabled}`);
      console.log(`\n  Allowed Roots:`);
      policy.allowedRoots.forEach(d => console.log(`    - ${d}`));
      console.log(`\n  Forbidden Paths:`);
      policy.forbiddenPaths.forEach(p => console.log(`    - ${p}`));
      console.log(`\n  Allowed Commands:`);
      policy.allowedCommands.forEach(c => console.log(`    - ${c}`));
      console.log(`\n  Forbidden Commands:`);
      policy.forbiddenCommands.forEach(c => console.log(`    - ${c}`));
      console.log(`\n  Allowed Domains:`);
      policy.allowedDomains.forEach(d => console.log(`    - ${d}`));
      break;
    }

    case "update": {
      const gatewayName = args[0];
      const key = args[1];
      const value = args[2];

      if (!gatewayName || !key || !value) {
        console.error("❌ Error: Gateway name, key, and value required");
        console.log("Usage: kendaliai security update <gateway-name> <key> <value>");
        console.log("\nAvailable keys:");
        console.log("  workspaceOnly      - true/false");
        console.log("  sandboxEnabled     - true/false");
        console.log("  sandboxType        - none/native/docker");
        console.log("  maxExecutionTime   - milliseconds");
        console.log("  maxMemoryMB        - megabytes");
        console.log("  networkEnabled     - true/false");
        return;
      }

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      // Parse value based on key
      let parsedValue: unknown;
      if (["workspaceOnly", "sandboxEnabled", "networkEnabled"].includes(key)) {
        parsedValue = value === "true";
      } else if (["maxExecutionTime", "maxMemoryMB"].includes(key)) {
        parsedValue = parseInt(value);
      } else {
        parsedValue = value;
      }

      const newPolicy = skillsManager.updateSecurityPolicy(gateway.id, {
        [key]: parsedValue,
      });

      if (newPolicy) {
        console.log(`✅ Updated security policy for '${gatewayName}'`);
        console.log(`   ${key} = ${parsedValue}`);
      } else {
        console.error(`❌ Failed to update security policy`);
      }
      break;
    }

    case "reset": {
      const gatewayName = args[0];
      if (!gatewayName) {
        console.error("❌ Error: Gateway name required");
        console.log("Usage: kendaliai security reset <gateway-name>");
        return;
      }

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const newPolicy = skillsManager.updateSecurityPolicy(gateway.id, DEFAULT_SECURITY_POLICY);
      if (newPolicy) {
        console.log(`✅ Reset security policy for '${gatewayName}' to defaults`);
      } else {
        console.error(`❌ Failed to reset security policy`);
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
      printSkillsHelp();
      break;

    default:
      console.error(`❌ Unknown security command: ${subCommand}`);
      printSkillsHelp();
  }
}

// Export help function
export { printSkillsHelp };
