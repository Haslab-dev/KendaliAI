import { log } from "../core";
import { configLoader } from "../config";
import { dbManager } from "../database";
import { tools } from "../database/schema";
import { eq } from "drizzle-orm";

export type PermissionLevel = "allowed" | "restricted" | "disabled";

export interface ToolPermissionContext {
  userId?: string;
  agentId?: string;
  workflowId?: string;
  source?: "api" | "agent" | "workflow" | "dashboard";
}

export class PermissionManager {
  private permissionCache: Map<string, PermissionLevel> = new Map();

  /**
   * Check if a tool can be executed
   */
  async canExecute(
    toolName: string,
    context: ToolPermissionContext,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Get permission level
    const level = await this.getPermissionLevel(toolName);

    switch (level) {
      case "disabled":
        return { allowed: false, reason: `Tool '${toolName}' is disabled` };

      case "restricted":
        // Restricted tools require specific permissions
        if (context.source === "agent") {
          // Agents can use restricted tools if explicitly permitted
          const agentPermitted = await this.checkAgentPermission(
            toolName,
            context.agentId,
          );
          if (!agentPermitted) {
            return {
              allowed: false,
              reason: `Agent not permitted to use '${toolName}'`,
            };
          }
        } else if (context.source === "workflow") {
          // Workflows need explicit permission for restricted tools
          const workflowPermitted = await this.checkWorkflowPermission(
            toolName,
            context.workflowId,
          );
          if (!workflowPermitted) {
            return {
              allowed: false,
              reason: `Workflow not permitted to use '${toolName}'`,
            };
          }
        } else if (context.source === "api") {
          // API access to restricted tools requires admin or specific permission
          return { allowed: false, reason: `Tool '${toolName}' is restricted` };
        }
        return { allowed: true };

      case "allowed":
      default:
        return { allowed: true };
    }
  }

  /**
   * Get permission level for a tool
   */
  async getPermissionLevel(toolName: string): Promise<PermissionLevel> {
    // Check cache first
    if (this.permissionCache.has(toolName)) {
      return this.permissionCache.get(toolName)!;
    }

    // Check config file
    const configLevel = configLoader.getToolPermission(toolName);
    if (configLevel) {
      this.permissionCache.set(toolName, configLevel);
      return configLevel;
    }

    // Check database
    try {
      const result = await dbManager.db
        .select()
        .from(tools)
        .where(eq(tools.name, toolName))
        .limit(1);

      if (result.length > 0) {
        const level = result[0].permissionLevel as PermissionLevel;
        this.permissionCache.set(toolName, level);
        return level;
      }
    } catch (error) {
      log.warn(`[Permissions] Failed to check database: ${error}`);
    }

    // Default to allowed
    return "allowed";
  }

  /**
   * Set permission level for a tool
   */
  async setPermissionLevel(
    toolName: string,
    level: PermissionLevel,
  ): Promise<void> {
    try {
      await dbManager.db
        .insert(tools)
        .values({
          id: `tool_${toolName.replace(/\./g, "_")}`,
          name: toolName,
          permissionLevel: level,
          enabled: level !== "disabled" ? 1 : 0,
        })
        .onConflictDoUpdate({
          target: tools.name,
          set: {
            permissionLevel: level,
            enabled: level !== "disabled" ? 1 : 0,
            updatedAt: new Date().toISOString(),
          },
        });

      // Update cache
      this.permissionCache.set(toolName, level);
      log.info(`[Permissions] Set ${toolName} to ${level}`);
    } catch (error) {
      log.error(`[Permissions] Failed to set permission: ${error}`);
      throw error;
    }
  }

  /**
   * Check if agent has permission to use tool
   */
  private async checkAgentPermission(
    toolName: string,
    agentId?: string,
  ): Promise<boolean> {
    if (!agentId) return false;

    // For now, check if tool is in agent's allowed tools list
    // This would be expanded to check agent configuration
    try {
      const { agents } = await import("../database/schema");
      const result = await dbManager.db
        .select()
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);

      if (result.length > 0 && result[0].tools) {
        const agentTools = JSON.parse(result[0].tools);
        return agentTools.includes(toolName) || agentTools.includes("*");
      }
    } catch (error) {
      log.warn(`[Permissions] Failed to check agent permission: ${error}`);
    }

    return false;
  }

  /**
   * Check if workflow has permission to use tool
   */
  private async checkWorkflowPermission(
    toolName: string,
    workflowId?: string,
  ): Promise<boolean> {
    if (!workflowId) return false;

    // For now, all workflows have access to restricted tools
    // This could be expanded to check workflow permissions
    return true;
  }

  /**
   * Clear permission cache
   */
  clearCache(): void {
    this.permissionCache.clear();
    log.info("[Permissions] Cache cleared");
  }

  /**
   * List all tools with their permission levels
   */
  async listToolPermissions(): Promise<
    Array<{ name: string; level: PermissionLevel }>
  > {
    const result: Array<{ name: string; level: PermissionLevel }> = [];

    // Get from database
    try {
      const dbTools = await dbManager.db.select().from(tools);
      for (const tool of dbTools) {
        result.push({
          name: tool.name,
          level: tool.permissionLevel as PermissionLevel,
        });
      }
    } catch (error) {
      log.warn(`[Permissions] Failed to list from database: ${error}`);
    }

    // Add from config
    const config = configLoader.get();
    if (config.tools) {
      for (const [name, level] of Object.entries(config.tools)) {
        if (!result.find((t) => t.name === name)) {
          result.push({ name, level });
        }
      }
    }

    return result;
  }
}

export const permissionManager = new PermissionManager();
