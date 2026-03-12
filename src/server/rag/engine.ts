/**
 * KendaliAI RAG Engine
 * 
 * Main RAG implementation that integrates:
 * - Document ingestion
 * - Text chunking
 * - Embedding generation
 * - Vector storage
 * - Context retrieval
 */

import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { readFile, stat } from "fs/promises";
import { extname, basename } from "path";
import { Database } from "bun:sqlite";
import type {
  RAGConfig,
  RAGEngine,
  RAGStats,
  Document,
  DocumentMetadata,
  TextChunk,
  RetrievedContext,
  VectorSearchResult,
  RetrievalConfig,
  RAGEvent,
  RAGEventHandler,
} from "./types";
import { DEFAULT_RAG_CONFIG } from "./types";
import { createChunks, getChunkStats } from "./chunking";
import { EmbeddingGenerator, hashText } from "./embedding";
import { VectorStorage, hashContent, generateId } from "./storage";

// ============================================
// Document Ingestion
// ============================================

/**
 * Detect MIME type from file extension
 */
function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".json": "application/json",
    ".csv": "text/csv",
    ".xml": "application/xml",
    ".yaml": "application/x-yaml",
    ".yml": "application/x-yaml",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Extract text content from file
 */
async function extractTextContent(
  filePath: string,
  mimeType: string
): Promise<string> {
  // For now, handle text-based files directly
  // PDF, DOCX would require additional libraries
  if (mimeType.startsWith("text/") || 
      mimeType === "application/json" ||
      mimeType === "application/xml" ||
      mimeType === "application/x-yaml") {
    return await readFile(filePath, "utf-8");
  }
  
  // For unsupported types, return empty or throw
  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Fetch content from URL with validation and timeout
 */
async function fetchUrlContent(url: string, timeoutMs = 30000): Promise<string> {
  // Validate URL to prevent SSRF
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }
  
  // Only allow http and https protocols
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported protocol: ${parsedUrl.protocol}. Only http and https are allowed.`);
  }
  
  // Block private/internal IP ranges to prevent SSRF
  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedHosts = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
  ];
  
  if (blockedHosts.includes(hostname)) {
    throw new Error(`Access to localhost is not allowed for security reasons.`);
  }
  
  // Block private IP ranges (10.x.x.x,172.16-31.x.x,192.168.x.x)
  if (hostname.match(/^10\./) || 
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
      hostname.match(/^192\.168\./)) {
    throw new Error(`Access to private IP addresses is not allowed for security reasons.`);
  }
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    
    const contentType = response.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const json = await response.json();
      return JSON.stringify(json, null, 2);
    }
    
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================
// RAG Engine Implementation
// ============================================

/**
 * Main RAG Engine class
 */
export class RAGEngineImpl implements RAGEngine {
  private config: RAGConfig;
  private db: Database;
  private storage: VectorStorage;
  private embeddingGenerator: EmbeddingGenerator;
  private eventHandlers: RAGEventHandler[] = [];
  private initialized = false;
  
  constructor(db: Database, config?: Partial<RAGConfig>) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
    this.db = db;
    this.storage = new VectorStorage(db, this.config.vector);
    this.embeddingGenerator = new EmbeddingGenerator(this.config.embedding);
  }
  
  /**
   * Initialize the RAG engine
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    await this.storage.init();
    await this.embeddingGenerator.init();
    
    this.initialized = true;
    this.emitEvent({
      type: "document_ingested",
      timestamp: new Date(),
      data: { message: "RAG engine initialized" },
    });
  }
  
  // ============================================
  // Document Operations
  // ============================================
  
  /**
   * Ingest a document from raw content
   */
  async ingestDocument(
    content: string, 
    metadata?: DocumentMetadata
  ): Promise<Document> {
    this.ensureInitialized();
    
    const contentHash = hashContent(content);
    const id = generateId();
    
    // Check for duplicates
    const existing = await this.storage.documentExistsByHash(contentHash);
    if (existing) {
      return {
        id: existing.id,
        content: existing.content,
        metadata: this.parseMetadata(existing),
        contentHash: existing.content_hash,
        ingestedAt: new Date(existing.ingested_at),
        status: "processed",
      };
    }
    
    // Create document
    const doc: Document = {
      id,
      content,
      metadata: metadata ? { ...metadata, source: (metadata.source ?? "text") } : { source: "text" as const },
      contentHash,
      ingestedAt: new Date(),
      status: "pending",
    };
    
    try {
      // Store document
      await this.storage.storeDocument({
        id: doc.id,
        content: doc.content,
        contentHash: doc.contentHash,
        source: doc.metadata.source || "text",
        sourcePath: doc.metadata.sourcePath,
        title: doc.metadata.title,
        metadata: doc.metadata.custom,
        gatewayId: doc.metadata.gatewayId,
      });
      
      // Chunk document
      const chunks = await this.chunkDocument(doc);
      
      // Generate embeddings for chunks
      await this.embedChunks(chunks);
      
      // Store chunks
      await this.storage.storeChunks(chunks);
      
      doc.status = "processed";
      
      this.emitEvent({
        type: "document_ingested",
        timestamp: new Date(),
        data: { documentId: doc.id, chunkCount: chunks.length },
        gatewayId: metadata?.gatewayId,
      });
      
    } catch (error) {
      doc.status = "failed";
      doc.error = error instanceof Error ? error.message : "Unknown error";
      
      this.emitEvent({
        type: "error",
        timestamp: new Date(),
        data: { documentId: doc.id },
        error: error instanceof Error ? error : new Error("Unknown error"),
        gatewayId: metadata?.gatewayId,
      });
    }
    
    return doc;
  }
  
  /**
   * Ingest a document from file
   */
  async ingestFile(
    filePath: string, 
    metadata?: DocumentMetadata
  ): Promise<Document> {
    this.ensureInitialized();
    
    // Get file info
    const stats = await stat(filePath);
    const mimeType = detectMimeType(filePath);
    const fileName = basename(filePath);
    
    // Extract content
    const content = await extractTextContent(filePath, mimeType);
    
    // Create metadata
    const docMetadata: DocumentMetadata = {
      source: "file",
      sourcePath: filePath,
      title: fileName,
      mimeType,
      size: stats.size,
      modifiedAt: stats.mtime,
      ...metadata,
    };
    
    return this.ingestDocument(content, docMetadata);
  }
  
  /**
   * Ingest a document from URL
   */
  async ingestUrl(
    url: string, 
    metadata?: DocumentMetadata
  ): Promise<Document> {
    this.ensureInitialized();
    
    // Fetch content
    const content = await fetchUrlContent(url);
    
    // Create metadata
    const docMetadata: DocumentMetadata = {
      source: "url",
      sourcePath: url,
      title: url,
      ...metadata,
    };
    
    return this.ingestDocument(content, docMetadata);
  }
  
  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<Document | null> {
    const row = await this.storage.getDocument(id);
    if (!row) return null;
    
    return {
      id: row.id,
      content: row.content,
      metadata: this.parseMetadata(row),
      contentHash: row.content_hash,
      ingestedAt: new Date(row.ingested_at),
      status: row.status as "pending" | "processed" | "failed",
      error: row.error || undefined,
    };
  }
  
  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<void> {
    await this.storage.deleteDocument(id);
    
    this.emitEvent({
      type: "document_deleted",
      timestamp: new Date(),
      data: { documentId: id },
    });
  }
  
  /**
   * List documents
   */
  async listDocuments(options?: {
    gatewayId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Document[]> {
    const rows = await this.storage.listDocuments(options);
    
    return rows.map(row => ({
      id: row.id,
      content: row.content,
      metadata: this.parseMetadata(row),
      contentHash: row.content_hash,
      ingestedAt: new Date(row.ingested_at),
      status: row.status as "pending" | "processed" | "failed",
      error: row.error || undefined,
    }));
  }
  
  // ============================================
  // Chunking Operations
  // ============================================
  
  /**
   * Chunk a document
   */
  async chunkDocument(document: Document): Promise<TextChunk[]> {
    const chunks = createChunks(document.id, document.content, this.config.chunking);
    
    this.emitEvent({
      type: "chunk_created",
      timestamp: new Date(),
      data: { documentId: document.id, chunkCount: chunks.length },
    });
    
    return chunks;
  }
  
  /**
   * Get chunks for a document
   */
  async getChunks(documentId: string): Promise<TextChunk[]> {
    const rows = await this.storage.getChunks(documentId);
    
    return rows.map(row => ({
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      index: row.chunk_index,
      startPosition: row.start_position,
      endPosition: row.end_position,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      embeddingModel: row.embedding_model || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
    }));
  }
  
  // ============================================
  // Embedding Operations
  // ============================================
  
  /**
   * Generate embedding for text
   */
  async embedText(text: string): Promise<number[]> {
    this.ensureInitialized();
    return this.embeddingGenerator.embed(text);
  }
  
  /**
   * Generate embeddings for multiple texts
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    this.ensureInitialized();
    return this.embeddingGenerator.embedBatch(texts);
  }
  
  /**
   * Embed chunks in batches
   */
  private async embedChunks(chunks: TextChunk[]): Promise<void> {
    const texts = chunks.map(c => c.content);
    const embeddings = await this.embeddingGenerator.embedBatch(texts);
    
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].embedding = embeddings[i];
      chunks[i].embeddingModel = this.config.embedding.model;
    }
    
    this.emitEvent({
      type: "embedding_generated",
      timestamp: new Date(),
      data: { chunkCount: chunks.length },
    });
  }
  
  // ============================================
  // Search Operations
  // ============================================
  
  /**
   * Search for relevant chunks
   */
  async search(
    query: string, 
    options?: Partial<RetrievalConfig>
  ): Promise<RetrievedContext> {
    this.ensureInitialized();
    
    const strategy = options?.strategy || this.config.retrieval.strategy;
    const queryEmbedding = await this.embedText(query);
    
    let chunks: VectorSearchResult[];
    
    switch (strategy) {
      case "vector":
        chunks = await this.storage.vectorSearch(queryEmbedding, options);
        break;
      case "keyword":
        chunks = await this.storage.hybridSearch(queryEmbedding, query, options);
        break;
      case "hybrid":
      case "reranked":
        chunks = await this.storage.hybridSearch(queryEmbedding, query, options);
        break;
      default:
        chunks = await this.storage.hybridSearch(queryEmbedding, query, options);
    }
    
    this.emitEvent({
      type: "search_performed",
      timestamp: new Date(),
      data: { query, strategy, resultCount: chunks.length },
    });
    
    return {
      query,
      queryEmbedding,
      chunks,
      totalConsidered: chunks.length,
      retrievedAt: new Date(),
      strategy,
    };
  }
  
  /**
   * Vector similarity search
   */
  async vectorSearch(
    embedding: number[], 
    options?: Partial<RetrievalConfig>
  ): Promise<VectorSearchResult[]> {
    this.ensureInitialized();
    return this.storage.vectorSearch(embedding, options);
  }
  
  /**
   * Keyword search
   */
  async keywordSearch(
    query: string, 
    options?: Partial<RetrievalConfig>
  ): Promise<VectorSearchResult[]> {
    this.ensureInitialized();
    return this.storage.hybridSearch([], query, options);
  }
  
  // ============================================
  // Context Building
  // ============================================
  
  /**
   * Build context string for AI generation
   */
  async buildContext(
    query: string, 
    options?: Partial<RetrievalConfig>
  ): Promise<string> {
    const result = await this.search(query, options);
    
    if (result.chunks.length === 0) {
      return "";
    }
    
    // Build context with sources
    const contextParts: string[] = [
      "## Relevant Context",
      "",
    ];
    
    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i];
      contextParts.push(`### Source ${i + 1} (Relevance: ${(chunk.score * 100).toFixed(1)}%)`);
      contextParts.push("");
      contextParts.push(chunk.content);
      contextParts.push("");
    }
    
    return contextParts.join("\n");
  }
  
  /**
   * Get context with source information
   */
  async getContextWithSources(
    query: string, 
    options?: Partial<RetrievalConfig>
  ): Promise<{ context: string; sources: VectorSearchResult[] }> {
    const result = await this.search(query, options);
    
    return {
      context: await this.buildContext(query, options),
      sources: result.chunks,
    };
  }
  
  // ============================================
  // Statistics and Management
  // ============================================
  
  /**
   * Get RAG statistics
   */
  async getStats(): Promise<RAGStats> {
    const storageStats = await this.storage.getStats();
    const cacheStats = this.embeddingGenerator.getCacheStats();
    
    return {
      totalDocuments: storageStats.documents,
      totalChunks: storageStats.chunks,
      totalEmbeddings: storageStats.embeddedChunks,
      cacheSize: cacheStats.size,
      avgChunkSize: 0, // Not tracked per document
      storageSize: storageStats.vectorIndexSize,
    };
  }
  
  /**
   * Clear all RAG data
   */
  async clear(): Promise<void> {
    await this.storage.clear();
    this.embeddingGenerator.clearCache();
  }
  
  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    await this.embeddingGenerator.dispose();
    this.initialized = false;
  }
  
  // ============================================
  // Event Handling
  // ============================================
  
  /**
   * Add event handler
   */
  onEvent(handler: RAGEventHandler): void {
    this.eventHandlers.push(handler);
  }
  
  /**
   * Remove event handler
   */
  offEvent(handler: RAGEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }
  
  /**
   * Emit event to handlers
   */
  private emitEvent(event: RAGEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("[RAG] Error in event handler:", error);
      }
    }
  }
  
  // ============================================
  // Private Helpers
  // ============================================
  
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("RAG engine not initialized. Call init() first.");
    }
  }
  
  private parseMetadata(row: { 
    source: string; 
    source_path: string | null; 
    title: string | null; 
    metadata: string | null;
    gateway_id: string | null;
  }): DocumentMetadata {
    return {
      source: row.source as DocumentMetadata["source"],
      sourcePath: row.source_path || undefined,
      title: row.title || undefined,
      gatewayId: row.gateway_id || undefined,
      custom: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a RAG engine instance
 */
export async function createRAGEngine(
  db: Database,
  config?: Partial<RAGConfig>
): Promise<RAGEngine> {
  const engine = new RAGEngineImpl(db, config);
  await engine.init();
  return engine;
}
