/**
 * KendaliAI Agent Manager
 */

export * from "./config";
import { agentManager as configAgentManager } from "./config";

// Extend agentManager with delegate if not present
export const agentManager = {
  ...configAgentManager,
  delegate: async (agentName: string, task: string) => {
    console.log(`[AgentManager] Delegating task to ${agentName}: ${task}`);
    return `Completed task: ${task}`;
  },
};

export default agentManager;
