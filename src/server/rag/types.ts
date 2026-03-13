/**
 * KendaliAI RAG (Retrieval-Augmented Generation) Types
 *
 * Defines interfaces and types for the RAG engine including:
 * - Document ingestion and management
 * - Text chunking strategies
 * - Embedding generation
 * - Vector storage and retrieval
 * - Context building for AI generation
 */

// ============================================
// Document Types
// ============================================

/**
 * Document source type
 */
export type DocumentSource =
  | "file" // Local file
  | "url" // Web URL
  | "text" // Raw text input
  | "database" // Database record
  | "api" // API response
  | "upload"; // User upload

/**
 * Document metadata
 */
export interface DocumentMetadata {
  /** Source type */
  source: DocumentSource;
  /** Original source path/URL */
  sourcePath?: string;
  /** Document title */
  title?: string;
  /** Document author */
  author?: string;
  /** Document creation date */
  createdAt?: Date;
  /** Document last modified date */
  modifiedAt?: Date;
  /** Document language (ISO 639-1) */
  language?: string;
  /** Document MIME type */
  mimeType?: string;
  /** Document size in bytes */
  size?: number;
  /** Custom metadata fields */
  custom?: Record<string, unknown>;
  /** Gateway ID this document belongs to */
  gatewayId?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Ingested document
 */
export interface Document {
  /** Unique document ID */
  id: string;
  /** Document content */
  content: string;
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Content hash for deduplication */
  contentHash: string;
  /** Ingestion timestamp */
  ingestedAt: Date;
  /** Processing status */
  status: "pending" | "processed" | "failed";
  /** Error message if failed */
  error?: string;
}

// ============================================
// Chunking Types
// ============================================

/**
 * Chunking strategy type
 */
export type ChunkingStrategy =
  | "fixed" // Fixed-size chunks
  | "sentence" // Sentence-based chunks
  | "paragraph" // Paragraph-based chunks
  | "semantic" // Semantic chunking
  | "recursive"; // Recursive character chunking

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  /** Chunking strategy */
  strategy: ChunkingStrategy;
  /** Maximum chunk size in characters */
  maxChunkSize: number;
  /** Overlap between chunks in characters */
  overlap: number;
  /** Minimum chunk size in characters */
  minChunkSize?: number;
  /** Separator for chunking (for fixed/recursive) */
  separator?: string;
  /** Whether to preserve sentence boundaries */
  preserveSentences?: boolean;
  /** Custom chunking patterns */
  patterns?: RegExp[];
}

/**
 * Text chunk
 */
export interface TextChunk {
  /** Unique chunk ID */
  id: string;
  /** Parent document ID */
  documentId: string;
  /** Chunk content */
  content: string;
  /** Chunk index in document */
  index: number;
  /** Start position in original document */
  startPosition: number;
  /** End position in original document */
  endPosition: number;
  /** Embedding vector */
  embedding?: number[];
  /** Embedding model used */
  embeddingModel?: string;
  /** Chunk metadata */
  metadata?: Record<string, unknown>;
  /** Created timestamp */
  createdAt: Date;
}

// ============================================
// Embedding Types
// ============================================

/**
 * Embedding provider type
 */
export type EmbeddingProvider =
  | "openai" // OpenAI embeddings
  | "zai" // ZAI embeddings
  | "deepseek" // DeepSeek embeddings
  | "local" // Local embeddings
  | "custom"; // Custom embedding provider

/**
 * Embedding configuration
 */
export interface EmbeddingConfig {
  /** Embedding provider */
  provider: EmbeddingProvider;
  /** Model to use for embeddings */
  model: string;
  /** Embedding dimensions */
  dimensions?: number;
  /** Batch size for embedding generation */
  batchSize?: number;
  /** Whether to use caching */
  useCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL?: number;
}

/**
 * Embedding entry with metadata
 */
export interface EmbeddingEntry {
  /** Entry ID */
  id: string;
  /** Embedding vector */
  embedding: number[];
  /** Model used for embedding */
  model: string;
  /** Dimensions */
  dimensions: number;
  /** Source text hash */
  textHash: string;
  /** Created timestamp */
  createdAt: Date;
}

// ============================================
// Vector Storage Types
// ============================================

/**
 * Vector storage backend type
 */
export type VectorBackend =
  | "sqlite" // SQLite with JSON vectors
  | "memory" // In-memory storage
  | "none"; // No vector storage

/**
 * Vector storage configuration
 */
export interface VectorConfig {
  /** Storage backend */
  backend: VectorBackend;
  /** Embedding dimensions */
  dimensions: number;
  /** Distance metric */
  metric: "cosine" | "euclidean" | "dot";
  /** Whether to persist to disk */
  persist?: boolean;
  /** Index type for efficient search */
  indexType?: "flat" | "ivf" | "hnsw";
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  /** Chunk ID */
  chunkId: string;
  /** Document ID */
  documentId: string;
  /** Chunk content */
  content: string;
  /** Similarity score */
  score: number;
  /** Chunk metadata */
  metadata?: Record<string, unknown>;
}

// ============================================
// Retrieval Types
// ============================================

/**
 * Retrieval strategy type
 */
export type RetrievalStrategy =
  | "vector" // Pure vector similarity
  | "keyword" // Keyword/FTS search
  | "hybrid" // Combined vector + keyword
  | "reranked"; // Vector + reranking

/**
 * Retrieval configuration
 */
export interface RetrievalConfig {
  /** Retrieval strategy */
  strategy: RetrievalStrategy;
  /** Number of results to retrieve */
  topK: number;
  /** Minimum similarity score (0-1) */
  minScore: number;
  /** Vector search weight for hybrid (0-1) */
  vectorWeight?: number;
  /** Keyword search weight for hybrid (0-1) */
  keywordWeight?: number;
  /** Whether to include metadata in results */
  includeMetadata?: boolean;
  /** Gateway filter */
  gatewayId?: string;
  /** Tag filters */
  tags?: string[];
}

/**
 * Retrieved context
 */
export interface RetrievedContext {
  /** Query text */
  query: string;
  /** Query embedding */
  queryEmbedding?: number[];
  /** Retrieved chunks */
  chunks: VectorSearchResult[];
  /** Total chunks considered */
  totalConsidered: number;
  /** Retrieval timestamp */
  retrievedAt: Date;
  /** Retrieval strategy used */
  strategy: RetrievalStrategy;
}

// ============================================
// RAG Configuration Types
// ============================================

/**
 * RAG configuration
 */
export interface RAGConfig {
  /** Whether RAG is enabled */
  enabled: boolean;
  /** Chunking configuration */
  chunking: ChunkingConfig;
  /** Embedding configuration */
  embedding: EmbeddingConfig;
  /** Vector storage configuration */
  vector: VectorConfig;
  /** Retrieval configuration */
  retrieval: RetrievalConfig;
  /** Context window size for AI */
  contextWindowSize?: number;
  /** Maximum context tokens */
  maxContextTokens?: number;
}

/**
 * Default RAG configuration
 */
export const DEFAULT_RAG_CONFIG: RAGConfig = {
  enabled: true,
  chunking: {
    strategy: "semantic",
    maxChunkSize: 1000,
    overlap: 200,
    minChunkSize: 100,
    preserveSentences: true,
  },
  embedding: {
    provider: "openai",
    model: "openai/text-embedding-3-small",
    dimensions: 1536,
    batchSize: 100,
    useCache: true,
    cacheTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  vector: {
    backend: "sqlite",
    dimensions: 1536,
    metric: "cosine",
    persist: true,
  },
  retrieval: {
    strategy: "hybrid",
    topK: 5,
    minScore: 0.7,
    vectorWeight: 0.7,
    keywordWeight: 0.3,
    includeMetadata: true,
  },
  contextWindowSize: 4096,
  maxContextTokens: 3000,
};

// ============================================
// RAG Engine Interface
// ============================================

/**
 * RAG Engine interface
 */
export interface RAGEngine {
  /** Initialize the RAG engine */
  init(): Promise<void>;

  // Document operations
  /** Ingest a document */
  ingestDocument(
    content: string,
    metadata?: DocumentMetadata,
  ): Promise<Document>;
  /** Ingest from file */
  ingestFile(filePath: string, metadata?: DocumentMetadata): Promise<Document>;
  /** Ingest from URL */
  ingestUrl(url: string, metadata?: DocumentMetadata): Promise<Document>;
  /** Get document by ID */
  getDocument(id: string): Promise<Document | null>;
  /** Delete document */
  deleteDocument(id: string): Promise<void>;
  /** List documents */
  listDocuments(options?: {
    gatewayId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Document[]>;

  // Chunking operations
  /** Chunk a document */
  chunkDocument(document: Document): Promise<TextChunk[]>;
  /** Get chunks for a document */
  getChunks(documentId: string): Promise<TextChunk[]>;

  // Embedding operations
  /** Generate embedding for text */
  embedText(text: string): Promise<number[]>;
  /** Generate embeddings for multiple texts */
  embedTexts(texts: string[]): Promise<number[][]>;

  // Search operations
  /** Search for relevant chunks */
  search(
    query: string,
    options?: Partial<RetrievalConfig>,
  ): Promise<RetrievedContext>;
  /** Vector similarity search */
  vectorSearch(
    embedding: number[],
    options?: Partial<RetrievalConfig>,
  ): Promise<VectorSearchResult[]>;
  /** Keyword search */
  keywordSearch(
    query: string,
    options?: Partial<RetrievalConfig>,
  ): Promise<VectorSearchResult[]>;

  // Context operations
  /** Build context for AI generation */
  buildContext(
    query: string,
    options?: Partial<RetrievalConfig>,
  ): Promise<string>;
  /** Get context with sources */
  getContextWithSources(
    query: string,
    options?: Partial<RetrievalConfig>,
  ): Promise<{ context: string; sources: VectorSearchResult[] }>;

  // Management operations
  /** Get RAG statistics */
  getStats(): Promise<RAGStats>;
  /** Clear all data */
  clear(): Promise<void>;
  /** Dispose resources */
  dispose(): Promise<void>;
}

/**
 * RAG statistics
 */
export interface RAGStats {
  /** Total documents */
  totalDocuments: number;
  /** Total chunks */
  totalChunks: number;
  /** Total embeddings */
  totalEmbeddings: number;
  /** Embedding cache size */
  cacheSize: number;
  /** Average chunk size */
  avgChunkSize: number;
  /** Last ingestion timestamp */
  lastIngestion?: Date;
  /** Storage size in bytes */
  storageSize?: number;
}

// ============================================
// RAG Events
// ============================================

/**
 * RAG event type
 */
export type RAGEventType =
  | "document_ingested"
  | "document_deleted"
  | "chunk_created"
  | "embedding_generated"
  | "search_performed"
  | "context_built"
  | "error";

/**
 * RAG event
 */
export interface RAGEvent {
  /** Event type */
  type: RAGEventType;
  /** Event timestamp */
  timestamp: Date;
  /** Event data */
  data?: unknown;
  /** Error if applicable */
  error?: Error;
  /** Gateway ID */
  gatewayId?: string;
}

/**
 * RAG event handler
 */
export type RAGEventHandler = (event: RAGEvent) => void;
