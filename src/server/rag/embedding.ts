/**
 * KendaliAI Embedding Generation Module
 *
 * Handles embedding generation for RAG using configured providers.
 * Supports caching and batching for efficiency.
 */

import { createHash } from "crypto";
import type {
  EmbeddingConfig,
  EmbeddingEntry,
  EmbeddingProvider,
} from "./types";
import type { AIProvider } from "../providers/types";
import { providerRegistry, createProvider } from "../providers/registry";

// ============================================
// Embedding Cache
// ============================================

interface CacheEntry {
  embedding: number[];
  model: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * In-memory embedding cache with TTL
 */
class EmbeddingCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000;

  constructor(maxSize?: number) {
    if (maxSize) this.maxSize = maxSize;
  }

  get(key: string): number[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.embedding;
  }

  set(key: string, embedding: number[], model: string, ttlMs: number): void {
    // Evict old entries if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      embedding,
      model,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private evictOldest(): void {
    // Remove expired entries first
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }

    // If still at capacity, remove oldest
    if (this.cache.size >= this.maxSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.createdAt < oldestTime) {
          oldestTime = entry.createdAt;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// ============================================
// Embedding Generator
// ============================================

/**
 * Embedding generator class
 */
export class EmbeddingGenerator {
  private config: EmbeddingConfig;
  private cache: EmbeddingCache;
  private provider: AIProvider | null = null;

  constructor(config: EmbeddingConfig) {
    this.config = config;
    this.cache = new EmbeddingCache();
  }

  /**
   * Initialize the embedding generator
   */
  async init(): Promise<void> {
    // Get the provider from registry
    const providerType = this.mapProviderType(this.config.provider);
    this.provider = providerRegistry.get(providerType) || null;

    if (!this.provider) {
      // Resolve API key from config or environment
      const apiKey =
        process.env.EMBEDDINGS_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.ZAI_API_KEY ||
        "";

      // Resolve base URL from environment (for custom/compatible endpoints)
      const baseURL = process.env.EMBEDDINGS_ENDPOINT
        ? process.env.EMBEDDINGS_ENDPOINT.replace("/embeddings", "") // strip /embeddings path
        : undefined;

      // Create provider if not exists
      this.provider = await createProvider(providerType, providerType as any, {
        type: providerType as any,
        apiKey: apiKey || undefined,
        baseURL: baseURL || undefined,
      });
    }

    await this.provider.initialize();
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    if (!this.provider) {
      throw new Error("Embedding generator not initialized");
    }

    // Check cache
    const cacheKey = this.getCacheKey(text);
    if (this.config.useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Generate embedding
    const result = await this.provider.embed({
      model: this.config.model,
      input: text,
      dimensions: this.config.dimensions,
    });

    const embedding = result.embeddings[0];

    // Cache result
    if (this.config.useCache) {
      this.cache.set(
        cacheKey,
        embedding,
        this.config.model,
        this.config.cacheTTL || 7 * 24 * 60 * 60 * 1000,
      );
    }

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.provider) {
      throw new Error("Embedding generator not initialized");
    }

    const batchSize = this.config.batchSize || 100;
    const results: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      // Check cache for each text
      const uncachedTexts: string[] = [];
      const uncachedIndices: number[] = [];
      const cachedResults: Map<number, number[]> = new Map();

      for (let j = 0; j < batch.length; j++) {
        const cacheKey = this.getCacheKey(batch[j]);
        if (this.config.useCache) {
          const cached = this.cache.get(cacheKey);
          if (cached) {
            cachedResults.set(j, cached);
            continue;
          }
        }
        uncachedTexts.push(batch[j]);
        uncachedIndices.push(j);
      }

      // Generate embeddings for uncached texts
      if (uncachedTexts.length > 0) {
        const result = await this.provider.embed({
          model: this.config.model,
          input: uncachedTexts,
          dimensions: this.config.dimensions,
        });

        // Cache and store results
        for (let j = 0; j < uncachedTexts.length; j++) {
          const embedding = result.embeddings[j];
          const originalIndex = uncachedIndices[j];

          if (this.config.useCache) {
            const cacheKey = this.getCacheKey(uncachedTexts[j]);
            this.cache.set(
              cacheKey,
              embedding,
              this.config.model,
              this.config.cacheTTL || 7 * 24 * 60 * 60 * 1000,
            );
          }

          cachedResults.set(originalIndex, embedding);
        }
      }

      // Combine cached and new results in order
      for (let j = 0; j < batch.length; j++) {
        const embedding = cachedResults.get(j);
        if (embedding) {
          results.push(embedding);
        }
      }
    }

    return results;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return this.cache.getStats();
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this.cache.clear();
    this.provider = null;
  }

  /**
   * Generate cache key for text
   */
  private getCacheKey(text: string): string {
    const normalizedText = text.trim().toLowerCase();
    const hash = createHash("sha256")
      .update(normalizedText)
      .update(this.config.model)
      .update(String(this.config.dimensions || ""))
      .digest("hex");
    return hash;
  }

  /**
   * Map embedding provider to provider type
   */
  private mapProviderType(provider: EmbeddingProvider): string {
    const mapping: Record<EmbeddingProvider, string> = {
      openai: "openai",
      zai: "zai",
      deepseek: "deepseek",
      local: "ollama",
      custom: "custom",
    };
    return mapping[provider] || "openai";
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have the same length");
  }

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

/**
 * Calculate euclidean distance between two embeddings
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have the same length");
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate dot product between two embeddings
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have the same length");
  }

  let product = 0;
  for (let i = 0; i < a.length; i++) {
    product += a[i] * b[i];
  }

  return product;
}

/**
 * Normalize an embedding vector
 */
export function normalizeEmbedding(embedding: number[]): number[] {
  let norm = 0;
  for (const val of embedding) {
    norm += val * val;
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return embedding;

  return embedding.map((val) => val / norm);
}

/**
 * Calculate similarity based on metric
 */
export function calculateSimilarity(
  a: number[],
  b: number[],
  metric: "cosine" | "euclidean" | "dot" = "cosine",
): number {
  switch (metric) {
    case "cosine":
      return cosineSimilarity(a, b);
    case "euclidean":
      // Convert distance to similarity (0-1 range)
      const dist = euclideanDistance(a, b);
      return 1 / (1 + dist);
    case "dot":
      // Normalize dot product to 0-1 range
      return (dotProduct(a, b) + 1) / 2;
    default:
      return cosineSimilarity(a, b);
  }
}

/**
 * Create embedding entry
 */
export function createEmbeddingEntry(
  id: string,
  embedding: number[],
  model: string,
  textHash: string,
): EmbeddingEntry {
  return {
    id,
    embedding,
    model,
    dimensions: embedding.length,
    textHash,
    createdAt: new Date(),
  };
}

/**
 * Hash text for embedding cache key
 */
export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
