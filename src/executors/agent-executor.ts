import type { AIProvider } from "../server/providers/types";
import { agentLoop } from "../agent/agent-loop";
import { Database } from "bun:sqlite";

/**
 * Agent Executor - Autonomous action execution
 */
export async function agentExecutor(
  message: string,
  provider: AIProvider,
  db: Database,
  gatewayId: string,
  model?: string,
  systemPrompt?: string
): Promise<string> {
  return agentLoop(message, provider, db, gatewayId, {
    model,
    systemPrompt,
    maxSteps: 5
  });
}
