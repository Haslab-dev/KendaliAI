import { Intent } from "../types/intent";
import { calculateSimilarity } from "../server/rag/embedding";

// Pre-defined sample phrases for each intent to compare against
const CATEGORY_SAMPLES: Record<Intent, string[]> = {
  chat: [
    "hello how can you help me",
    "tell me a joke",
    "just chatting today",
    "explain general relativity",
    "who won the world cup in 2022"
  ],
  rag: [
    "what is our company policy on remote work",
    "find information about the internal docs",
    "how do I reset my password according to the guide",
    "documentation for the api",
    "what does the employee handbook say about vacation"
  ],
  agent: [
    "run a shell command to list files",
    "execute the script",
    "check the weather in London",
    "browse the web for latest news",
    "git status of the current repo"
  ],
  unknown: []
};

/**
 * Embedding-based router - Semantic classification using vector similarity
 */
export async function embeddingRouter(
  message: string,
  embedder: { embed: (text: string) => Promise<number[]> }
): Promise<{ intent: Intent; confidence: number }> {
  const queryVec = await embedder.embed(message);
  
  let bestIntent: Intent = "chat";
  let maxSimilarity = -1;

  for (const [intent, samples] of Object.entries(CATEGORY_SAMPLES)) {
    if (intent === "unknown") continue;
    
    // Average similarity across samples for this intent
    let intentSimilarity = 0;
    for (const sample of samples) {
      // In a real system, these samples would be pre-embedded
      const sampleVec = await embedder.embed(sample);
      intentSimilarity += calculateSimilarity(queryVec, sampleVec, "cosine");
    }
    intentSimilarity /= samples.length;

    if (intentSimilarity > maxSimilarity) {
      maxSimilarity = intentSimilarity;
      bestIntent = intent as Intent;
    }
  }

  return {
    intent: bestIntent,
    confidence: maxSimilarity
  };
}
