import { ToolDefinition, toolRegistry } from "../tools";
import { agentManager } from "../agents";
import { log } from "../core";

export class KendaliPlugin {
  public id: string;
  public version: string;

  constructor(id: string, version: string = "1.0.0") {
    this.id = id;
    this.version = version;
  }

  defineTool(tool: ToolDefinition) {
    log.info(`[SDK] Plugin ${this.id} registering tool ${tool.name}`);
    toolRegistry.register(tool);
  }

  defineAgent(name: string, agent: any) {
    log.info(`[SDK] Plugin ${this.id} registering agent ${name}`);
    agentManager.register(`${this.id}.${name}`, agent);
  }
}

export function definePlugin(options: {
  id: string;
  version?: string;
  setup: (plugin: KendaliPlugin) => void;
}) {
  const plugin = new KendaliPlugin(options.id, options.version);
  options.setup(plugin);
  return plugin;
}
