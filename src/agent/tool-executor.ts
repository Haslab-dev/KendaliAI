import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { toolRegistry } from "../server/tools/registry";
import { getSkillsManager } from "../server/skills";
import { Database } from "bun:sqlite";

/**
 * Unified Tool Executor with Security Validation
 */
export async function executeToolAction(
  actionName: string,
  command: string,
  gatewayId: string,
  db: Database
): Promise<string> {
  const skillsManager = getSkillsManager(db);
  const enabledTools = skillsManager.getEnabledTools(gatewayId);
  const enabledSkills = skillsManager.getEnabledSkills(gatewayId);

  // 1. Identify type
  const isSkill = enabledSkills.some(s => s.name === actionName);
  const isTool = enabledTools.some(t => t.name === actionName);
  const typeLabel = isSkill ? "skill" : (isTool ? "tool" : "action");

  if (!isSkill && !isTool) {
    throw new Error(`${typeLabel} '${actionName}' is not enabled for this gateway.`);
  }

  // 2. Validate security policy
  const validation = skillsManager.validateOperation(gatewayId, {
    type: actionName === "shell" ? "shell" : (actionName === "read_file" || actionName === "file" ? "file" : "shell"),
    action: command,
    target: (actionName === "read_file" || actionName === "file") ? command : undefined
  });

  if (!validation.allowed) {
    throw new Error(`Security Block: ${validation.reason}`);
  }

  // 3. Execute
  console.log(`\n⚙️  Processing ${typeLabel}: ${actionName}...`);
  
  try {
    if (actionName === "shell") {
      console.log(`🚀 Executing: ${command}`);
      return execSync(command, { encoding: "utf8", timeout: 30000 });
    } else if (actionName === "read_file" || actionName === "file") {
      if (existsSync(command)) {
        console.log(`📖 Reading: ${command}`);
        const output = readFileSync(command, "utf8");
        return output.length > 5000 ? output.slice(0, 5000) + "\n...(truncated)" : output;
      } else {
        throw new Error(`File not found: ${command}`);
      }
    } else {
      // Generic tool registry execution
      const result = await toolRegistry.execute(actionName, { command });
      return String(result);
    }
  } catch (err: any) {
    throw new Error(`Execution failed: ${err.message}`);
  }
}
