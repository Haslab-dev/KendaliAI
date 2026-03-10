import { log } from "../core";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, any>;
  execute: (params: any) => Promise<any>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition) {
    log.info(`[ToolRegistry] Registering tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  async execute(toolName: string, params: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    log.info(`[ToolRegistry] Executing tool: ${toolName}`);
    return tool.execute(params);
  }
}

export const toolRegistry = new ToolRegistry();
