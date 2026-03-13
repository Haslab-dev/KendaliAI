/**
 * Intent Routing Types
 */

export type Intent = "chat" | "rag" | "agent" | "unknown";

export interface IntentResult {
  intent: Intent;
  confidence: number;
  reason?: string;
}

export interface RouterConfig {
  heuristicEnabled: boolean;
  embeddingEnabled: boolean;
  llmFallbackEnabled: boolean;
  embeddingThreshold: number;
}
