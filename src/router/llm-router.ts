import { Intent } from "../types/intent";
import type { AIProvider } from "../server/providers/types";

/**
 * LLM-based router - Fallback for ambiguous intents
 */
export async function llmRouter(
  message: string,
  provider: AIProvider,
  model?: string
): Promise<Intent> {
  const prompt = `Classify the user request into exactly one category:
- chat: general conversation, explanations, or creative writing
- rag: requests for internal knowledge, policies, or specific documentation info
- agent: requests to perform actions, run commands, check weather, or use tools

User Message: "${message}"

Return only the label (chat, rag, or agent).`;

  const response = await provider.generate({
    model,
    messages: [
      { role: "system", content: "You are a concise intent classification router." },
      { role: "user", content: prompt }
    ]
  });

  const label = response.text.trim().toLowerCase();
  if (["chat", "rag", "agent"].includes(label)) {
    return label as Intent;
  }

  return "chat"; // Default to chat
}
