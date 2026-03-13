/**
 * KendaliAI Hybrid Memory System - ZeroClaw Style
 *
 * Features:
 * - SQLite storage with BLOB embeddings
 * - FTS5 full-text search with BM25 scoring
 * - Vector similarity search (cosine)
 * - Hybrid weighted merge
 * - Embedding cache with LRU eviction
 */

import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { Database } from "bun:sqlite";
import type {
  Memory,
  MemoryEntry,
  MemorySearchResult,
  MemoryConfig,
} from "../traits";

// ============================================
// Types
// ============================================

interface MemoryRow {
  id: string;
  gateway_id: string | null;
  content: string;
  content_hash: string | null;
  source: string | null;
  source_id: string | null;
  embedding: string | null;
  embedding_model: string | null;
  importance: number;
  access_count: number;
  created_at: number;
  updated_at: number;
  last_accessed_at: number | null;
}

interface FTSSearchRow {
  id: string;
  content: string;
  rank: number;
}

interface CacheRow {
  id: number;
  cache_key: string;
  input_text: string;
  embedding: string;
  model: string;
  access_count: number;
  last_accessed_at: number;
  created_at: number;
  expires_at: number | null;
}

// ============================================
// Utility Functions
// ============================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function parseEmbedding(json: string | null): number[] | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ============================================
// Hybrid Memory Implementation
// ============================================

export class HybridMemory implements Memory {
  readonly id: string;
  private db: Database;
  private config: MemoryConfig;
  private gatewayId: string | null;
  private embeddingFn: ((text: string) => Promise<number[]>) | null;

  constructor(
    db: Database,
    config: MemoryConfig,
    gatewayId?: string,
    embeddingFn?: (text: string) => Promise<number[]>,
  ) {
    this.id = `memory-${gatewayId || "default"}`;
    this.db = db;
    this.config = config;
    this.gatewayId = gatewayId || null;
    this.embeddingFn = embeddingFn || null;
  }

  async init(): Promise<void> {
    // Tables are created by database initialization
    // This method can be used for additional setup if needed
  }

  async store(
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const id = randomUUID();
    const now = Date.now();
    const contentHash = hashContent(content);

    // Check for duplicates
    const existing = this.db
      .query<MemoryRow, [string]>(
        `
      SELECT * FROM memories WHERE content_hash = ? LIMIT 1
    `,
      )
      .get(contentHash);

    if (existing) {
      // Update access count
      this.db.run(
        `
        UPDATE memories 
        SET access_count = access_count + 1, last_accessed_at = ?
        WHERE id = ?
      `,
        [now, existing.id],
      );
      return existing.id;
    }

    // Generate embedding if provider available
    let embedding: number[] | null = null;
    if (this.embeddingFn && this.config.embeddingProvider !== "none") {
      // Check cache first
      const cacheKey = hashContent(content);
      const cached = await this.getCachedEmbedding(cacheKey);

      if (cached) {
        embedding = cached;
      } else {
        try {
          embedding = await this.embeddingFn(content);
          await this.cacheEmbedding(cacheKey, content, embedding);
        } catch (error) {
          console.error("Failed to generate embedding:", error);
        }
      }
    }

    // Insert memory
    this.db.run(
      `
      INSERT INTO memories (
        id, gateway_id, content, content_hash, source, source_id,
        embedding, embedding_model, importance, access_count,
        created_at, updated_at, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        this.gatewayId,
        content,
        contentHash,
        (metadata?.source as string) || null,
        (metadata?.sourceId as string) || null,
        embedding ? JSON.stringify(embedding) : null,
        this.config.embeddingProvider !== "none"
          ? this.config.embeddingProvider
          : null,
        (metadata?.importance as number) || 0.5,
        1,
        now,
        now,
        now,
      ],
    );

    // Update FTS index
    this.db.run(
      `
      INSERT INTO memories_fts (rowid, content)
      VALUES ((SELECT rowid FROM memories WHERE id = ?), ?)
    `,
      [id, content],
    );

    return id;
  }

  async recall(
    query: string,
    limit: number = 10,
  ): Promise<MemorySearchResult[]> {
    const vectorWeight = this.config.vectorWeight || 0.7;
    const keywordWeight = this.config.keywordWeight || 0.3;
    const maxResults = limit * 3; // Get more for merging

    // Run both searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      this.embeddingFn ? this.searchVectorInternal(query, maxResults) : [],
      this.searchKeywordInternal(query, maxResults),
    ]);

    // Merge results with weighted scoring
    const merged = new Map<string, MemorySearchResult>();

    // Add vector results
    for (const result of vectorResults) {
      merged.set(result.entry.id, {
        ...result,
        score: result.score * vectorWeight,
        searchType: "hybrid",
      });
    }

    // Add/merge keyword results
    for (const result of keywordResults) {
      const existing = merged.get(result.entry.id);
      if (existing) {
        existing.score += result.score * keywordWeight;
      } else {
        merged.set(result.entry.id, {
          ...result,
          score: result.score * keywordWeight,
          searchType: "hybrid",
        });
      }
    }

    // Sort by score and return top results
    const sorted = Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Update access counts
    for (const result of sorted) {
      this.db.run(
        `
        UPDATE memories 
        SET access_count = access_count + 1, last_accessed_at = ?
        WHERE id = ?
      `,
        [Date.now(), result.entry.id],
      );
    }

    return sorted;
  }

  async searchVector(
    embedding: number[],
    limit: number = 10,
  ): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];

    // Get all memories with embeddings
    const rows = this.db
      .query<MemoryRow, [string | null, string | null]>(
        `
      SELECT * FROM memories
      WHERE embedding IS NOT NULL
        AND (gateway_id = ? OR ? IS NULL)
      ORDER BY importance DESC, access_count DESC
      LIMIT 1000
    `,
      )
      .all(this.gatewayId, this.gatewayId);

    // Calculate similarities
    for (const row of rows) {
      const rowEmbedding = parseEmbedding(row.embedding);
      if (rowEmbedding) {
        const similarity = cosineSimilarity(embedding, rowEmbedding);
        results.push({
          entry: this.rowToEntry(row),
          score: similarity,
          searchType: "vector",
        });
      }
    }

    // Sort by similarity and return top results
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private async searchVectorInternal(
    query: string,
    limit: number,
  ): Promise<MemorySearchResult[]> {
    if (!this.embeddingFn) return [];

    try {
      const embedding = await this.embeddingFn(query);
      return this.searchVector(embedding, limit);
    } catch {
      return [];
    }
  }

  async searchKeyword(
    query: string,
    limit: number = 10,
  ): Promise<MemorySearchResult[]> {
    return this.searchKeywordInternal(query, limit);
  }

  private searchKeywordInternal(
    query: string,
    limit: number,
  ): MemorySearchResult[] {
    // Use FTS5 with BM25 scoring
    const rows = this.db
      .query<FTSSearchRow, [string, string | null, string | null, number]>(
        `
      SELECT m.id, m.content, fts.rank
      FROM memories_fts fts
      JOIN memories m ON m.rowid = fts.rowid
      WHERE memories_fts MATCH ?
        AND (m.gateway_id = ? OR ? IS NULL)
      ORDER BY fts.rank
      LIMIT ?
    `,
      )
      .all(query, this.gatewayId, this.gatewayId, limit);

    return rows.map((row, index) => ({
      entry: {
        id: row.id,
        content: row.content,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      score: 1 / (1 + index), // Normalize BM25 score
      searchType: "keyword" as const,
    }));
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const row = this.db
      .query<MemoryRow, [string]>(
        `
      SELECT * FROM memories WHERE id = ? LIMIT 1
    `,
      )
      .get(id);

    if (!row) return null;

    // Update access count
    this.db.run(
      `
      UPDATE memories 
      SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id = ?
    `,
      [Date.now(), id],
    );

    return this.rowToEntry(row);
  }

  async delete(id: string): Promise<void> {
    // Delete from FTS first
    this.db.run(
      `
      DELETE FROM memories_fts WHERE rowid = (SELECT rowid FROM memories WHERE id = ?)
    `,
      [id],
    );

    // Delete from memories
    this.db.run(`DELETE FROM memories WHERE id = ?`, [id]);
  }

  async clear(): Promise<void> {
    if (this.gatewayId) {
      // Clear only for this gateway
      this.db.run(
        `
        DELETE FROM memories_fts 
        WHERE rowid IN (SELECT rowid FROM memories WHERE gateway_id = ?)
      `,
        [this.gatewayId],
      );
      this.db.run(`DELETE FROM memories WHERE gateway_id = ?`, [
        this.gatewayId,
      ]);
    } else {
      // Clear all
      this.db.run(`DELETE FROM memories_fts`);
      this.db.run(`DELETE FROM memories`);
    }
  }

  async count(): Promise<number> {
    const row = this.db
      .query<{ count: number }, [string | null, string | null]>(
        `
      SELECT COUNT(*) as count FROM memories
      WHERE gateway_id = ? OR ? IS NULL
    `,
      )
      .get(this.gatewayId, this.gatewayId);

    return row?.count || 0;
  }

  private rowToEntry(row: MemoryRow): MemoryEntry {
    return {
      id: row.id,
      content: row.content,
      embedding: parseEmbedding(row.embedding) || undefined,
      source: row.source || undefined,
      importance: row.importance,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ============================================
  // Embedding Cache
  // ============================================

  private async getCachedEmbedding(cacheKey: string): Promise<number[] | null> {
    const row = this.db
      .query<CacheRow, [string, number]>(
        `
      SELECT * FROM embedding_cache
      WHERE cache_key = ?
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1
    `,
      )
      .get(cacheKey, Date.now());

    if (!row) return null;

    // Update access count
    this.db.run(
      `
      UPDATE embedding_cache 
      SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id = ?
    `,
      [Date.now(), row.id],
    );

    return parseEmbedding(row.embedding);
  }

  private async cacheEmbedding(
    cacheKey: string,
    inputText: string,
    embedding: number[],
    ttlMs: number = 7 * 24 * 60 * 60 * 1000, // 7 days
  ): Promise<void> {
    const now = Date.now();
    const expiresAt = now + ttlMs;

    this.db.run(
      `
      INSERT OR REPLACE INTO embedding_cache 
      (cache_key, input_text, embedding, model, access_count, last_accessed_at, created_at, expires_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `,
      [
        cacheKey,
        inputText,
        JSON.stringify(embedding),
        this.config.embeddingProvider,
        now,
        now,
        expiresAt,
      ],
    );

    // LRU eviction - remove old entries if cache is too large
    this.evictOldCacheEntries();
  }

  private evictOldCacheEntries(): void {
    // Remove expired entries
    this.db.run(
      `
      DELETE FROM embedding_cache WHERE expires_at IS NOT NULL AND expires_at < ?
    `,
      [Date.now()],
    );

    // Keep only top 1000 most recently accessed
    this.db.run(`
      DELETE FROM embedding_cache 
      WHERE id NOT IN (
        SELECT id FROM embedding_cache 
        ORDER BY last_accessed_at DESC 
        LIMIT 1000
      )
    `);
  }
}

// ============================================
// No-op Memory (for backend = "none")
// ============================================

export class NoopMemory implements Memory {
  readonly id = "memory-none";

  async init(): Promise<void> {}
  async store(): Promise<string> {
    return "";
  }
  async recall(): Promise<MemorySearchResult[]> {
    return [];
  }
  async searchVector(): Promise<MemorySearchResult[]> {
    return [];
  }
  async searchKeyword(): Promise<MemorySearchResult[]> {
    return [];
  }
  async get(): Promise<MemoryEntry | null> {
    return null;
  }
  async delete(): Promise<void> {}
  async clear(): Promise<void> {}
  async count(): Promise<number> {
    return 0;
  }
}

// ============================================
// Memory Factory
// ============================================

export function createMemory(
  db: Database,
  config: MemoryConfig,
  gatewayId?: string,
  embeddingFn?: (text: string) => Promise<number[]>,
): Memory {
  switch (config.backend) {
    case "sqlite":
      return new HybridMemory(db, config, gatewayId, embeddingFn);
    case "none":
      return new NoopMemory();
    case "markdown":
      // TODO: Implement markdown memory
      return new NoopMemory();
    default:
      return new HybridMemory(db, config, gatewayId, embeddingFn);
  }
}
