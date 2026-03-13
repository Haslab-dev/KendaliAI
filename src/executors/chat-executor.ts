import type { AIProvider } from "../server/providers/types";

/**
 * Chat Executor - Reasoning only, no tools or retrieval
 */
export async function chatExecutor(
  message: string,
  provider: AIProvider,
  model?: string
): Promise<string> {
  const response = await provider.generate({
    model,
    messages: [
      { role: "system", content: "You are a helpful AI assistant. Provide direct, focused answers." },
      { role: "user", content: message }
    ]
  });

  return response.text;
}
