import { log } from "../core";

export class AgentManager {
  private agents: Map<string, any> = new Map();

  register(name: string, agent: any) {
    this.agents.set(name, agent);
    log.info(`[AgentManager] Agent registered: ${name}`);
  }

  async delegate(agentName: string, task: string) {
    log.info(`[AgentManager] Delegating task to ${agentName}: ${task}`);
    const agent = this.agents.get(agentName);
    if (!agent) throw new Error(`Agent not found: ${agentName}`);
    return agent.run(task);
  }
}

export const agentManager = new AgentManager();
