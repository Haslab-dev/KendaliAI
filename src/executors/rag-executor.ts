import type { AIProvider } from "../server/providers/types";
import { Retriever } from "../rag/retriever";

/**
 * RAG Executor - Knowledge retrieval + LLM reasoning
 */
export async function ragExecutor(
  message: string,
  retriever: Retriever,
  provider: AIProvider,
  model?: string,
  systemPrompt?: string,
): Promise<string> {
  // 1. Retrieve relevant docs
  const context = await retriever.search(message);

  // 2. Generate answer with context
  const baseInstructions =
    systemPrompt || "You are a knowledgeable AI assistant.";
  const ragInstructions = `\n\nAnswer the user request strictly using the provided internal knowledge when available. If the answer is not in the context and it's not about your own identity or capabilities, say you don't know.\n\nDOCUMENT CONTEXT:\n${context}`;

  const response = await provider.generate({
    model,
    messages: [
      {
        role: "system",
        content: baseInstructions + ragInstructions,
      },
      { role: "user", content: message },
    ],
  });

  return response.text;
}
