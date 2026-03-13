import { routeIntent } from "../router";
import { chatExecutor } from "./chat-executor";
import { ragExecutor } from "./rag-executor";
import { agentExecutor } from "./agent-executor";
import { Retriever } from "../rag/retriever";
import type { AIProvider } from "../server/providers/types";
import { agentLoop } from "../agent/agent-loop";
import { Database } from "bun:sqlite";

export interface ExecutionOptions {
  provider: AIProvider;
  db: Database;
  gatewayId: string;
  model?: string;
  embedder: { embed: (text: string) => Promise<number[]> };
  retriever: Retriever;
  agentSystemPrompt?: string;
}

/**
 * Main Autonomous Pipeline Entry Point
 * 
 * 1. Routes intent (Chat, RAG, or Agent)
 * 2. Executes based on intent
 * 3. Returns final response
 */
export async function autonomousPipeline(
  message: string,
  options: ExecutionOptions
): Promise<{ intent: string; response: string; routerReason: string }> {
  // 1. Route Intent
  const routeResult = await routeIntent(message, {
    embedder: options.embedder,
    provider: options.provider,
    model: options.model
  });

  console.log(`[Pipeline] Routed to: ${routeResult.intent} (${routeResult.reason})`);

  // 2. Execute
  let response: string;
  switch (routeResult.intent) {
    case "rag":
      response = await ragExecutor(message, options.retriever, options.provider, options.model, options.agentSystemPrompt);
      break;
    case "agent":
      response = await agentExecutor(message, options.provider, options.db, options.gatewayId, options.model, options.agentSystemPrompt);
      break;
    case "chat":
    default:
      response = await chatExecutor(message, options.provider, options.model, options.agentSystemPrompt);
      break;
  }

  return {
    intent: routeResult.intent,
    response,
    routerReason: routeResult.reason || "unknown"
  };
}
