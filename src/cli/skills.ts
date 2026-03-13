/**
 * KendaliAI Skills Management Module (CLI)
 *
 * Deeply integrated with the server's SkillRegistry for database synchronization.
 */

import { Database } from "bun:sqlite";
import { getSkillRegistry } from "../server/skills/registry";

/**
 * Handle skills command
 */
export async function handleSkillsCommand(
  db: Database,
  args: string[],
): Promise<void> {
  const subCommand = args[0] || "list";
  const subArgs = args.slice(1);

  const registry = getSkillRegistry(db);

  switch (subCommand) {
    case "list":
    case "ls": {
      const skills = registry.listInstalled();

      if (skills.length === 0) {
        console.log("No skills installed.");
        console.log("\nTo install a skill:");
        console.log("  kendaliai skills install <source>");
        return;
      }

      console.log(
        "╔══════════════════════════════════════════════════════════════════════════╗",
      );
      console.log(
        "║                        KendaliAI Skills                              ║",
      );
      console.log(
        "╠══════════════════════════════════════════════════════════════════════════╣",
      );
      console.log(
        "║ Name          Version   Description                                  ║",
      );
      console.log(
        "╠══════════════════════════════════════════════════════════════════════════╣",
      );

      for (const skill of skills) {
        const desc = (skill.description || "No description")
          .slice(0, 45)
          .padEnd(45);
        console.log(
          `║ ${skill.name.padEnd(14)} ${skill.version.padEnd(9)} ${desc}║`,
        );
      }

      console.log(
        "╚══════════════════════════════════════════════════════════════════════════╝",
      );
      console.log(`\nTotal: ${skills.length} skill(s) installed`);
      break;
    }

    case "install":
    case "add": {
      const source = subArgs[0];
      if (!source) {
        console.error("Error: Skill source required");
        return;
      }

      try {
        console.log(`Installing skill from: ${source}...`);
        const skill = await registry.install(source);
        console.log(
          `✅ Skill '${skill.name}' installed and registered successfully!`,
        );
      } catch (err) {
        console.error(
          `❌ Failed to install skill: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      break;
    }

    case "new":
    case "create": {
      const name = subArgs[0];
      if (!name) {
        console.error("Error: Skill name required");
        return;
      }

      try {
        console.log(`Scaffolding new skill: ${name}...`);
        const skillPath = await registry.scaffold(name);

        // Auto-register after scaffold
        console.log(`Registering skill in database...`);
        await registry.install(skillPath, { force: true });

        console.log(`✅ Skill '${name}' created and registered successfully!`);
        console.log(`\nLocation: .kendaliai/skills/${name}`);
        console.log(`\nNext steps:`);
        console.log(
          `  1. Edit .kendaliai/skills/${name}/SKILL.toml to define tools`,
        );
        console.log(
          `  2. Implement tools in .kendaliai/skills/${name}/src/index.ts`,
        );
        console.log(`  3. Restart gateway to load new tools`);
      } catch (err) {
        console.error(
          `❌ Failed to create skill: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      break;
    }

    case "remove":
    case "uninstall": {
      const name = subArgs[0];
      if (!name) {
        console.error("Error: Skill name required");
        return;
      }

      try {
        await registry.uninstall(name);
        console.log(`✅ Skill '${name}' removed from system and database.`);
      } catch (err) {
        console.error(
          `❌ Failed to remove skill: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      break;
    }

    case "audit": {
      const name = subArgs[0];
      if (!name) {
        console.error("Error: Skill name required");
        return;
      }
      console.log(`Auditing skill: ${name}... (Security report incoming)`);
      // Future: implement registry-based auditing
      break;
    }

    default:
      console.log("Usage: kendaliai skills <command> [options]");
      console.log("\nCommands:");
      console.log("  list                 List installed skills");
      console.log("  install <source>    Install a skill (URL, Git, or Local)");
      console.log("  new <name>          Scaffold a new skill");
      console.log("  remove <name>       Remove a skill");
  }
}
