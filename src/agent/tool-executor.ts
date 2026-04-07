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
  args: any,
  gatewayId: string,
  db: Database,
): Promise<string> {
  const normalizedAction =
    actionName === "shell" || actionName === "bash" ? "terminal" : actionName;

  console.log(`\n⚙️  Processing action: ${normalizedAction}...`);

  try {
    const result = await toolRegistry.execute(normalizedAction, args);

    if (typeof result === "object") {
      if ((result as any).status === "PENDING_APPROVAL") {
        return `[SAFETY_PAUSE]: Approval required for command: ${args.command || JSON.stringify(args)}`;
      }
      return JSON.stringify(result, null, 2);
    }
    return String(result);
  } catch (err: any) {
    throw new Error(
      `Tool execution [${normalizedAction}] failed: ${err.message}`,
    );
  }
}
