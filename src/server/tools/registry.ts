/**
 * KendaliAI Tool Registry
 */

export interface Tool {
  name: string;
  description: string;
  parameters: any;
  handler: (params: any) => Promise<any>;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  registerSuite(suite: any) {
    const suiteTools =
      typeof suite.getTools === "function" ? suite.getTools() : suite.tools;
    if (Array.isArray(suiteTools)) {
      for (const t of suiteTools) {
        this.register({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          handler: t.execute || t.handler,
        });
      }
    }
  }

  async execute(name: string, params: any) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found in registry`);
    return await tool.handler(params);
  }

  list() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}

export const toolRegistry = new ToolRegistry();

export default toolRegistry;
