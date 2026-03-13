import { Intent, IntentResult } from "../types/intent";
import { heuristicRouter } from "./heuristic-router";
import { embeddingRouter } from "./embedding-router";
import { llmRouter } from "./llm-router";
import type { AIProvider } from "../server/providers/types";

export interface IntentRouterOptions {
  embedder: { embed: (text: string) => Promise<number[]> };
  provider: AIProvider;
  model?: string;
}

/**
 * Main Intent Router entry point
 */
export async function routeIntent(
  message: string,
  options: IntentRouterOptions,
): Promise<IntentResult> {
  // 1. Heuristic Router (Fastest, 0 tokens)
  const heuristic = heuristicRouter(message);
  if (heuristic !== "unknown") {
    return {
      intent: heuristic,
      confidence: 1.0,
      reason: "matched heuristic keywords",
    };
  }

  // 2. Embedding Router (Medium speed, cheap tokens)
  try {
    const embedding = await embeddingRouter(message, options.embedder);
    if (embedding.confidence > 0.85) {
      return {
        intent: embedding.intent,
        confidence: embedding.confidence,
        reason: "semantic similarity threshold reached",
      };
    }
  } catch (err) {
    console.warn("[Router] Embedding router failed:", err);
  }

  // 3. LLM Router (Slowest, full tokens, most accurate)
  const intent = await llmRouter(message, options.provider, options.model);
  return { intent, confidence: 0.9, reason: "classified by llm fallback" };
}
