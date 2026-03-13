/**
 * KendaliAI RAG Module
 *
 * Retrieval-Augmented Generation implementation including:
 * - Document ingestion
 * - Text chunking
 * - Embedding generation
 * - Vector storage
 * - Context retrieval
 */

// Types
export type {
  DocumentSource,
  DocumentMetadata,
  Document,
  ChunkingStrategy,
  ChunkingConfig,
  TextChunk,
  EmbeddingProvider,
  EmbeddingConfig,
  EmbeddingEntry,
  VectorBackend,
  VectorConfig,
  VectorSearchResult,
  RetrievalStrategy,
  RetrievalConfig,
  RetrievedContext,
  RAGConfig,
  RAGEngine,
  RAGStats,
  RAGEventType,
  RAGEvent,
  RAGEventHandler,
} from "./types";

export { DEFAULT_RAG_CONFIG } from "./types";

// Chunking
export {
  chunkText,
  createChunks,
  getChunkingStrategy,
  estimateTokens,
  getChunkStats,
} from "./chunking";

// Embedding
export {
  EmbeddingGenerator,
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  normalizeEmbedding,
  calculateSimilarity,
  createEmbeddingEntry,
  hashText,
} from "./embedding";

// Storage
export { VectorStorage, hashContent, generateId } from "./storage";

// Engine
export { RAGEngineImpl, createRAGEngine } from "./engine";

// Quick setup function
import { Database } from "bun:sqlite";
import { createRAGEngine } from "./engine";
import type { RAGConfig, RAGEngine } from "./types";

/**
 * Quick setup for RAG engine with default configuration
 */
export async function rag(
  db: Database,
  config?: Partial<RAGConfig>,
): Promise<RAGEngine> {
  return createRAGEngine(db, config);
}
