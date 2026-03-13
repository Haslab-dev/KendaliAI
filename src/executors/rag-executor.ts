import type { AIProvider } from "../server/providers/types";
import { Retriever } from "../rag/retriever";

/**
 * RAG Executor - Knowledge retrieval + LLM reasoning
 */
export async function ragExecutor(
  message: string,
  retriever: Retriever,
  provider: AIProvider,
  model?: string
): Promise<string> {
  // 1. Retrieve relevant docs
  const context = await retriever.search(message);

  // 2. Generate answer with context
  const response = await provider.generate({
    model,
    messages: [
      { 
        role: "system", 
        content: `You are a knowledgeable assistant. Answer the user request strictly using the provided internal knowledge. If the answer is not in the context, say you don't know.\n\nDOCUMENT CONTEXT:\n${context}` 
      },
      { role: "user", content: message }
    ]
  });

  return response.text;
}
