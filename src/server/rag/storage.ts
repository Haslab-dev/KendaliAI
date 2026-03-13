/**
 * KendaliAI Vector Storage Module
 *
 * Implements vector storage for RAG using Bun-native vector search.
 * Since sqlite-vss doesn't work with Bun (can't load extensions),
 * we use our own BunVSS implementation.
 */

import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { Database } from "bun:sqlite";
import { BunVSS, HNSWIndex, createBunVSS } from "./bun-vss";
import type {
  VectorConfig,
  VectorSearchResult,
  TextChunk,
  RetrievalConfig,
} from "./types";

// ============================================
// Database Types
// ============================================

interface DocumentRow {
  id: string;
  gateway_id: string | null;
  content: string;
  content_hash: string;
  source: string;
  source_path: string | null;
  title: string | null;
  metadata: string | null;
  status: string;
  error: string | null;
  ingested_at: number;
}

interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  start_position: number;
  end_position: number;
  embedding: string | null;
  embedding_model: string | null;
  metadata: string | null;
  created_at: number;
}

interface ChunkWithDocument extends ChunkRow {
  doc_gateway_id: string | null;
  doc_source: string | null;
  doc_title: string | null;
}

// ============================================
// Vector Storage Implementation
// ============================================

/**
 * SQLite-based vector storage for RAG with Bun-native vector search
 */
export class VectorStorage {
  private db: Database;
  private config: VectorConfig;
  private initialized: boolean = false;
  private bunVSS: BunVSS | null = null;
  private hnswIndex: HNSWIndex | null = null;
  private useHNSW: boolean = false;

  constructor(db: Database, config: VectorConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Initialize storage tables and vector index
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Create documents table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS rag_documents (
        id TEXT PRIMARY KEY,
        gateway_id TEXT,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        source TEXT NOT NULL,
        source_path TEXT,
        title TEXT,
        metadata TEXT,
        status TEXT DEFAULT 'pending',
        error TEXT,
        ingested_at INTEGER
      )
    `);

    // Create chunks table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS rag_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_position INTEGER NOT NULL,
        end_position INTEGER NOT NULL,
        embedding TEXT,
        embedding_model TEXT,
        metadata TEXT,
        created_at INTEGER,
        FOREIGN KEY (document_id) REFERENCES rag_documents(id) ON DELETE CASCADE
      )
    `);

    // Create FTS5 virtual table for full-text search
    try {
      this.db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts 
        USING fts5(id, content, content='rag_chunks')
      `);

      // Create triggers to keep FTS in sync
      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS rag_chunks_ai AFTER INSERT ON rag_chunks BEGIN
          INSERT INTO rag_chunks_fts(rowid, id, content) 
          VALUES (new.rowid, new.id, new.content);
        END
      `);

      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS rag_chunks_ad AFTER DELETE ON rag_chunks BEGIN
          INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, id, content) 
          VALUES('delete', old.rowid, old.id, old.content);
        END
      `);

      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS rag_chunks_au AFTER UPDATE ON rag_chunks BEGIN
          INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, id, content) 
          VALUES('delete', old.rowid, old.id, old.content);
          INSERT INTO rag_chunks_fts(rowid, id, content) 
          VALUES (new.rowid, new.id, new.content);
        END
      `);
    } catch {
      // FTS5 might fail, that's okay
    }

    // Create indexes
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_chunks_document ON rag_chunks(document_id)`,
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_documents_gateway ON rag_documents(gateway_id)`,
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_documents_hash ON rag_documents(content_hash)`,
    );

    // Initialize BunVSS for vector storage
    try {
      this.bunVSS = createBunVSS(this.db, {
        dimension: this.config.dimensions || 1536,
        metric: this.config.metric || "cosine",
      });
    } catch (error) {
      console.warn(
        "[RAG] Failed to initialize BunVSS, using in-memory HNSW:",
        error,
      );
      this.hnswIndex = new HNSWIndex({
        dimension: this.config.dimensions || 1536,
        metric: this.config.metric || "cosine",
      });
      this.useHNSW = true;
    }

    this.initialized = true;
  }

  // ============================================
  // Document Operations
  // ============================================

  /**
   * Store a document
   */
  async storeDocument(doc: {
    id: string;
    content: string;
    contentHash: string;
    source: string;
    sourcePath?: string;
    title?: string;
    metadata?: Record<string, unknown>;
    gatewayId?: string;
  }): Promise<void> {
    const now = Date.now();

    this.db.run(
      `
      INSERT INTO rag_documents (
        id, gateway_id, content, content_hash, source, source_path, 
        title, metadata, status, ingested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processed', ?)
    `,
      [
        doc.id,
        doc.gatewayId || null,
        doc.content,
        doc.contentHash,
        doc.source,
        doc.sourcePath || null,
        doc.title || null,
        doc.metadata ? JSON.stringify(doc.metadata) : null,
        now,
      ],
    );
  }

  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<DocumentRow | null> {
    const row = this.db
      .prepare(
        `
      SELECT * FROM rag_documents WHERE id = ? LIMIT 1
    `,
      )
      .get(id);
    return row as DocumentRow | null;
  }

  /**
   * List documents
   */
  async listDocuments(options?: {
    gatewayId?: string;
    limit?: number;
    offset?: number;
  }): Promise<DocumentRow[]> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    if (options?.gatewayId) {
      return this.db
        .prepare(
          `
        SELECT * FROM rag_documents 
        WHERE gateway_id = ?
        ORDER BY ingested_at DESC
        LIMIT ? OFFSET ?
      `,
        )
        .all(options.gatewayId, limit, offset) as DocumentRow[];
    }

    return this.db
      .prepare(
        `
      SELECT * FROM rag_documents 
      ORDER BY ingested_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(limit, offset) as DocumentRow[];
  }

  /**
   * Delete document and its chunks
   */
  async deleteDocument(id: string): Promise<void> {
    // Get chunk IDs first for vector cleanup
    const chunks = this.db
      .prepare(
        `
      SELECT id FROM rag_chunks WHERE document_id = ?
    `,
      )
      .all(id) as { id: string }[];

    // Delete from vector index
    for (const chunk of chunks) {
      if (this.bunVSS) {
        this.bunVSS.delete(chunk.id);
      } else if (this.hnswIndex) {
        this.hnswIndex.delete(chunk.id);
      }
    }

    // Delete chunks
    this.db.run(`DELETE FROM rag_chunks WHERE document_id = ?`, [id]);
    // Delete document
    this.db.run(`DELETE FROM rag_documents WHERE id = ?`, [id]);
  }

  /**
   * Check if document exists by hash
   */
  async documentExistsByHash(contentHash: string): Promise<DocumentRow | null> {
    const row = this.db
      .prepare(
        `
      SELECT * FROM rag_documents WHERE content_hash = ? LIMIT 1
    `,
      )
      .get(contentHash);
    return row as DocumentRow | null;
  }

  // ============================================
  // Chunk Operations
  // ============================================

  /**
   * Store a chunk with vector indexing
   */
  async storeChunk(chunk: TextChunk): Promise<void> {
    // Insert chunk
    this.db.run(
      `
      INSERT INTO rag_chunks (
        id, document_id, content, chunk_index, start_position, 
        end_position, embedding, embedding_model, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        chunk.id,
        chunk.documentId,
        chunk.content,
        chunk.index,
        chunk.startPosition,
        chunk.endPosition,
        chunk.embedding ? JSON.stringify(chunk.embedding) : null,
        chunk.embeddingModel || null,
        chunk.metadata ? JSON.stringify(chunk.metadata) : null,
        chunk.createdAt.getTime(),
      ],
    );

    // Add to vector index if embedding exists
    if (chunk.embedding) {
      if (this.bunVSS) {
        this.bunVSS.insert(chunk.id, chunk.embedding, {
          documentId: chunk.documentId,
          content: chunk.content,
        });
      } else if (this.hnswIndex) {
        this.hnswIndex.insert(chunk.id, chunk.embedding, {
          documentId: chunk.documentId,
          content: chunk.content,
        });
      }
    }
  }

  /**
   * Store multiple chunks with vector indexing
   */
  async storeChunks(chunks: TextChunk[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO rag_chunks (
        id, document_id, content, chunk_index, start_position, 
        end_position, embedding, embedding_model, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items: TextChunk[]) => {
      for (const chunk of items) {
        stmt.run(
          chunk.id,
          chunk.documentId,
          chunk.content,
          chunk.index,
          chunk.startPosition,
          chunk.endPosition,
          chunk.embedding ? JSON.stringify(chunk.embedding) : null,
          chunk.embeddingModel || null,
          chunk.metadata ? JSON.stringify(chunk.metadata) : null,
          chunk.createdAt.getTime(),
        );

        // Add to vector index if embedding exists
        if (chunk.embedding) {
          if (this.bunVSS) {
            this.bunVSS.insert(chunk.id, chunk.embedding, {
              documentId: chunk.documentId,
              content: chunk.content,
            });
          } else if (this.hnswIndex) {
            this.hnswIndex.insert(chunk.id, chunk.embedding, {
              documentId: chunk.documentId,
              content: chunk.content,
            });
          }
        }
      }
    });

    insertMany(chunks);
  }

  /**
   * Get chunks for a document
   */
  async getChunks(documentId: string): Promise<ChunkRow[]> {
    return this.db
      .prepare(
        `
      SELECT * FROM rag_chunks 
      WHERE document_id = ? 
      ORDER BY chunk_index ASC
    `,
      )
      .all(documentId) as ChunkRow[];
  }

  /**
   * Update chunk embedding
   */
  async updateChunkEmbedding(
    chunkId: string,
    embedding: number[],
    model: string,
  ): Promise<void> {
    this.db.run(
      `
      UPDATE rag_chunks 
      SET embedding = ?, embedding_model = ?
      WHERE id = ?
    `,
      [JSON.stringify(embedding), model, chunkId],
    );

    // Update vector index
    const chunk = this.db
      .prepare(
        `
      SELECT * FROM rag_chunks WHERE id = ?
    `,
      )
      .get(chunkId) as ChunkRow | undefined;

    if (chunk) {
      if (this.bunVSS) {
        this.bunVSS.insert(chunkId, embedding, {
          documentId: chunk.document_id,
          content: chunk.content,
        });
      } else if (this.hnswIndex) {
        this.hnswIndex.insert(chunkId, embedding, {
          documentId: chunk.document_id,
          content: chunk.content,
        });
      }
    }
  }

  /**
   * Get chunk by ID
   */
  async getChunk(id: string): Promise<ChunkRow | null> {
    const row = this.db
      .prepare(
        `
      SELECT * FROM rag_chunks WHERE id = ? LIMIT 1
    `,
      )
      .get(id);
    return row as ChunkRow | null;
  }

  // ============================================
  // Vector Search Operations
  // ============================================

  /**
   * Vector similarity search
   */
  async vectorSearch(
    embedding: number[],
    options?: Partial<RetrievalConfig>,
  ): Promise<VectorSearchResult[]> {
    const topK = options?.topK || 5;
    const threshold = 0; // Minimum similarity threshold

    let results: Array<{
      id: string;
      score: number;
      metadata?: Record<string, unknown>;
    }>;

    if (this.bunVSS) {
      results = this.bunVSS.search(embedding, topK);
    } else if (this.hnswIndex) {
      results = this.hnswIndex.search(embedding, topK);
    } else {
      // Fallback: brute force search from database
      results = await this.bruteForceSearch(embedding, topK);
    }

    // Filter by threshold and enrich with chunk data
    const searchResults: VectorSearchResult[] = [];

    for (const result of results) {
      if (result.score < threshold) continue;

      const chunk = await this.getChunk(result.id);
      if (!chunk) continue;

      searchResults.push({
        chunkId: chunk.id,
        documentId: chunk.document_id,
        content: chunk.content,
        score: result.score,
        metadata: chunk.metadata ? JSON.parse(chunk.metadata) : undefined,
      });
    }

    return searchResults;
  }

  /**
   * Brute force vector search (fallback)
   */
  private async bruteForceSearch(
    queryEmbedding: number[],
    topK: number,
  ): Promise<
    Array<{ id: string; score: number; metadata?: Record<string, unknown> }>
  > {
    const chunks = this.db
      .prepare(
        `
      SELECT id, embedding FROM rag_chunks WHERE embedding IS NOT NULL
    `,
      )
      .all() as { id: string; embedding: string }[];

    const results: Array<{ id: string; score: number }> = [];

    for (const chunk of chunks) {
      try {
        const embedding = JSON.parse(chunk.embedding) as number[];
        const score = this.cosineSimilarity(queryEmbedding, embedding);
        results.push({ id: chunk.id, score });
      } catch {
        // Skip invalid embeddings
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Compute cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
  }

  /**
   * Hybrid search (vector + keyword)
   */
  async hybridSearch(
    embedding: number[],
    query: string,
    options?: Partial<RetrievalConfig>,
  ): Promise<VectorSearchResult[]> {
    const topK = options?.topK || 5;
    const alpha = 0.5; // Weight for vector vs keyword (0.5 = equal weight)

    // Get vector search results
    const vectorResults = await this.vectorSearch(embedding, {
      topK: topK * 2,
    });

    // Get keyword search results
    let keywordResults: Array<{ chunkId: string; score: number }> = [];
    try {
      const ftsResults = this.db
        .prepare(
          `
        SELECT id as chunkId, bm25(rag_chunks_fts) as score
        FROM rag_chunks_fts
        WHERE rag_chunks_fts MATCH ?
        ORDER BY score DESC
        LIMIT ?
      `,
        )
        .all(query, topK * 2) as { chunkId: string; score: number }[];

      keywordResults = ftsResults.map((r) => ({
        chunkId: r.chunkId,
        score: Math.abs(r.score), // BM25 can be negative
      }));
    } catch {
      // FTS might fail, continue with vector only
    }

    // Combine scores using Reciprocal Rank Fusion
    const combinedScores = new Map<string, number>();

    for (let i = 0; i < vectorResults.length; i++) {
      const result = vectorResults[i];
      const rrf = 1 / (60 + i + 1);
      combinedScores.set(result.chunkId, alpha * rrf);
    }

    for (let i = 0; i < keywordResults.length; i++) {
      const result = keywordResults[i];
      const existing = combinedScores.get(result.chunkId) || 0;
      const rrf = 1 / (60 + i + 1);
      combinedScores.set(result.chunkId, existing + (1 - alpha) * rrf);
    }

    // Sort by combined score
    const sorted = Array.from(combinedScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    // Enrich with chunk data
    const results: VectorSearchResult[] = [];
    for (const [chunkId, score] of sorted) {
      const chunk = await this.getChunk(chunkId);
      if (chunk) {
        results.push({
          chunkId: chunk.id,
          documentId: chunk.document_id,
          content: chunk.content,
          score,
          metadata: chunk.metadata ? JSON.parse(chunk.metadata) : undefined,
        });
      }
    }

    return results;
  }

  // ============================================
  // Statistics and Management
  // ============================================

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    documents: number;
    chunks: number;
    embeddedChunks: number;
    vectorIndexSize: number;
  }> {
    const docCount = this.db
      .prepare(`SELECT COUNT(*) as count FROM rag_documents`)
      .get() as { count: number };
    const chunkCount = this.db
      .prepare(`SELECT COUNT(*) as count FROM rag_chunks`)
      .get() as { count: number };
    const embeddedCount = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM rag_chunks WHERE embedding IS NOT NULL
    `,
      )
      .get() as { count: number };

    let vectorIndexSize = 0;
    if (this.bunVSS) {
      vectorIndexSize = this.bunVSS.count();
    } else if (this.hnswIndex) {
      vectorIndexSize = this.hnswIndex.count();
    }

    return {
      documents: docCount.count,
      chunks: chunkCount.count,
      embeddedChunks: embeddedCount.count,
      vectorIndexSize,
    };
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    this.db.run(`DELETE FROM rag_chunks`);
    this.db.run(`DELETE FROM rag_documents`);

    if (this.bunVSS) {
      this.bunVSS.clear();
    } else if (this.hnswIndex) {
      this.hnswIndex.clear();
    }
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate content hash
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Create vector storage instance
 */
export function createVectorStorage(
  db: Database,
  config: VectorConfig,
): VectorStorage {
  const storage = new VectorStorage(db, config);
  return storage;
}

export default VectorStorage;
