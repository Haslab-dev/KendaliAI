import type { RAGEngine, VectorSearchResult } from "../server/rag/types";

/**
 * Knowledge Retriever wrapper
 */
export class Retriever {
  private engine: RAGEngine;

  constructor(engine: RAGEngine) {
    this.engine = engine;
  }

  async search(query: string, limit: number = 3): Promise<string> {
    const result = await this.engine.search(query, { topK: limit });
    
    if (result.chunks.length === 0) {
      return "No relevant internal knowledge found.";
    }

    return result.chunks
      .map((r: VectorSearchResult, i: number) => `[Doc ${i + 1}]:\n${r.content}`)
      .join("\n\n");
  }
}
