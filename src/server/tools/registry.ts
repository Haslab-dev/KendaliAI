import { log } from "../core";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, any>;
  execute: (params: any) => Promise<any>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    log.info(`[ToolRegistry] Registering tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  unregister(toolName: string): void {
    log.info(`[ToolRegistry] Unregistering tool: ${toolName}`);
    this.tools.delete(toolName);
  }

  get(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
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
