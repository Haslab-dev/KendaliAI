/**
 * KendaliAI Bun-Native Vector Storage
 *
 * A pure TypeScript vector storage solution for Bun's SQLite.
 * Since sqlite-vss doesn't work with Bun (can't load extensions),
 * this implements vector storage and search natively.
 */

import { Database } from "bun:sqlite";

// ============================================
// Types
// ============================================

export interface VectorConfig {
  /** Vector dimension (e.g., 1536 for OpenAI embeddings) */
  dimension: number;
  /** Distance metric */
  metric: "cosine" | "euclidean" | "dot";
}

export interface VectorEntry {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// ============================================
// Vector Math Functions
// ============================================

/**
 * Compute dot product of two vectors
 */
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Compute L2 (Euclidean) norm of a vector
 */
function l2Norm(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * a[i];
  }
  return Math.sqrt(sum);
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = dotProduct(a, b);
  const normA = l2Norm(a);
  const normB = l2Norm(b);
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

/**
 * Compute Euclidean distance between two vectors
 */
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Convert vector to BLOB storage format (Float32Array)
 */
function vectorToBlob(vector: number[]): Uint8Array {
  const float32 = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    float32[i] = vector[i];
  }
  return new Uint8Array(float32.buffer);
}

/**
 * Convert BLOB to vector (Float32Array to number[])
 */
function blobToVector(blob: Uint8Array, dimension: number): number[] {
  const float32 = new Float32Array(blob.buffer);
  const vector: number[] = new Array(dimension);
  for (let i = 0; i < dimension; i++) {
    vector[i] = float32[i];
  }
  return vector;
}

// ============================================
// BunVSS Class
// ============================================

export class BunVSS {
  private db: Database;
  private config: VectorConfig;
  private tableName: string;
  private initialized: boolean = false;

  constructor(
    db: Database,
    config: VectorConfig,
    tableName: string = "vectors",
  ) {
    this.db = db;
    this.config = config;
    this.tableName = tableName;
  }

  /**
   * Initialize the vector storage table
   */
  init(): void {
    if (this.initialized) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        vector BLOB NOT NULL,
        metadata TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // Create FTS5 table for metadata search (optional)
    try {
      this.db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName}_fts
        USING fts5(id, content, content='${this.tableName}')
      `);
    } catch {
      // FTS5 table might already exist or fail, that's okay
    }

    this.initialized = true;
  }

  /**
   * Insert a vector
   */
  insert(
    id: string,
    vector: number[],
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.initialized) this.init();

    if (vector.length !== this.config.dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.config.dimension}, got ${vector.length}`,
      );
    }

    const blob = vectorToBlob(vector);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    this.db.run(
      `INSERT OR REPLACE INTO ${this.tableName} (id, vector, metadata, created_at) VALUES (?, ?, ?, ?)`,
      [id, blob, metadataJson, Date.now()],
    );
  }

  /**
   * Insert multiple vectors in a batch
   */
  insertBatch(entries: VectorEntry[]): void {
    if (!this.initialized) this.init();

    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO ${this.tableName} (id, vector, metadata, created_at) VALUES (?, ?, ?, ?)`,
    );

    const transaction = this.db.transaction((items: VectorEntry[]) => {
      for (const entry of items) {
        if (entry.vector.length !== this.config.dimension) {
          throw new Error(`Vector dimension mismatch for ${entry.id}`);
        }
        const blob = vectorToBlob(entry.vector);
        const metadataJson = entry.metadata
          ? JSON.stringify(entry.metadata)
          : null;
        insert.run(entry.id, blob, metadataJson, entry.createdAt || Date.now());
      }
    });

    transaction(entries);
  }

  /**
   * Get a vector by ID
   */
  get(id: string): VectorEntry | null {
    if (!this.initialized) this.init();

    const row = this.db
      .prepare(
        `SELECT id, vector, metadata, created_at FROM ${this.tableName} WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          vector: Uint8Array;
          metadata: string | null;
          created_at: number;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      vector: blobToVector(row.vector, this.config.dimension),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
    };
  }

  /**
   * Delete a vector by ID
   */
  delete(id: string): void {
    if (!this.initialized) this.init();
    this.db.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
  }

  /**
   * Get all vector IDs
   */
  getAllIds(): string[] {
    if (!this.initialized) this.init();

    const rows = this.db.prepare(`SELECT id FROM ${this.tableName}`).all() as {
      id: string;
    }[];
    return rows.map((r) => r.id);
  }

  /**
   * Get vector count
   */
  count(): number {
    if (!this.initialized) this.init();

    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`)
      .get() as { count: number };
    return row.count;
  }

  /**
   * Search for similar vectors (brute force)
   * For small datasets (<100k vectors), this is fast enough
   */
  search(query: number[], topK: number = 5): SearchResult[] {
    if (!this.initialized) this.init();

    if (query.length !== this.config.dimension) {
      throw new Error(
        `Query dimension mismatch: expected ${this.config.dimension}, got ${query.length}`,
      );
    }

    // Load all vectors (this is the brute-force part)
    const rows = this.db
      .prepare(`SELECT id, vector, metadata FROM ${this.tableName}`)
      .all() as { id: string; vector: Uint8Array; metadata: string | null }[];

    // Compute similarities
    const results: Array<{
      id: string;
      score: number;
      metadata?: Record<string, unknown>;
    }> = [];

    for (const row of rows) {
      const vector = blobToVector(row.vector, this.config.dimension);
      let score: number;

      switch (this.config.metric) {
        case "cosine":
          score = cosineSimilarity(query, vector);
          break;
        case "euclidean":
          score = 1 / (1 + euclideanDistance(query, vector)); // Convert to similarity
          break;
        case "dot":
          score = dotProduct(query, vector);
          break;
        default:
          score = cosineSimilarity(query, vector);
      }

      results.push({
        id: row.id,
        score,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      });
    }

    // Sort by score (descending) and take top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Search with metadata filter
   */
  searchWithFilter(
    query: number[],
    filter: (metadata: Record<string, unknown>) => boolean,
    topK: number = 5,
  ): SearchResult[] {
    if (!this.initialized) this.init();

    const rows = this.db
      .prepare(`SELECT id, vector, metadata FROM ${this.tableName}`)
      .all() as { id: string; vector: Uint8Array; metadata: string | null }[];

    const results: Array<{
      id: string;
      score: number;
      metadata?: Record<string, unknown>;
    }> = [];

    for (const row of rows) {
      const metadata = row.metadata ? JSON.parse(row.metadata) : undefined;

      // Apply filter
      if (metadata && !filter(metadata)) continue;

      const vector = blobToVector(row.vector, this.config.dimension);
      let score: number;

      switch (this.config.metric) {
        case "cosine":
          score = cosineSimilarity(query, vector);
          break;
        case "euclidean":
          score = 1 / (1 + euclideanDistance(query, vector));
          break;
        case "dot":
          score = dotProduct(query, vector);
          break;
        default:
          score = cosineSimilarity(query, vector);
      }

      results.push({ id: row.id, score, metadata });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Clear all vectors
   */
  clear(): void {
    if (!this.initialized) this.init();
    this.db.run(`DELETE FROM ${this.tableName}`);
  }

  /**
   * Get storage statistics
   */
  getStats(): { count: number; dimension: number; metric: string } {
    return {
      count: this.count(),
      dimension: this.config.dimension,
      metric: this.config.metric,
    };
  }
}

// ============================================
// HNSW Index (Hierarchical Navigable Small World)
// For better performance on larger datasets
// ============================================

interface HNSWNode {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  neighbors: Map<number, Set<string>>; // layer -> neighbor ids
}

export class HNSWIndex {
  private config: VectorConfig;
  private nodes: Map<string, HNSWNode> = new Map();
  private entryPoint: string | null = null;
  private maxLayer: number = 0;

  // HNSW parameters
  private mL: number = 1 / Math.log(16); // Level multiplier
  private efConstruction: number = 200;
  private efSearch: number = 50;
  private maxConnections: number = 16;

  constructor(config: VectorConfig) {
    this.config = config;
  }

  /**
   * Get random layer for new node
   */
  private getRandomLayer(): number {
    const r = Math.random();
    return Math.floor(-Math.log(r) * this.mL);
  }

  /**
   * Insert a vector into the index
   */
  insert(
    id: string,
    vector: number[],
    metadata?: Record<string, unknown>,
  ): void {
    const layer = this.getRandomLayer();

    const node: HNSWNode = {
      id,
      vector,
      metadata,
      neighbors: new Map(),
    };

    // Initialize neighbor sets for each layer
    for (let l = 0; l <= layer; l++) {
      node.neighbors.set(l, new Set());
    }

    // First node becomes entry point
    if (!this.entryPoint) {
      this.entryPoint = id;
      this.maxLayer = layer;
      this.nodes.set(id, node);
      return;
    }

    // Start from entry point
    let current = this.entryPoint;

    // Traverse from top layer to layer+1
    for (let l = this.maxLayer; l > layer; l--) {
      current = this.greedySearch(current, vector, l);
    }

    // For layers 0 to layer, find neighbors and connect
    for (let l = Math.min(layer, this.maxLayer); l >= 0; l--) {
      const neighbors = this.searchLayer(
        current,
        vector,
        this.efConstruction,
        l,
      );

      // Select best neighbors
      const selectedNeighbors = this.selectNeighbors(
        neighbors,
        this.maxConnections,
      );

      // Connect bidirectionally
      node.neighbors.set(l, new Set(selectedNeighbors));

      for (const neighborId of selectedNeighbors) {
        const neighbor = this.nodes.get(neighborId);
        if (neighbor) {
          const neighborLayer = neighbor.neighbors.get(l);
          if (neighborLayer) {
            neighborLayer.add(id);

            // Prune if too many connections
            if (neighborLayer.size > this.maxConnections) {
              const pruned = this.selectNeighbors(
                Array.from(neighborLayer).map((nid) => ({
                  id: nid,
                  score: this.similarity(vector, this.nodes.get(nid)!.vector),
                })),
                this.maxConnections,
              );
              neighbor.neighbors.set(l, new Set(pruned));
            }
          }
        }
      }
    }

    // Update entry point if needed
    if (layer > this.maxLayer) {
      this.entryPoint = id;
      this.maxLayer = layer;
    }

    this.nodes.set(id, node);
  }

  /**
   * Greedy search in a single layer
   */
  private greedySearch(
    entryId: string,
    query: number[],
    layer: number,
  ): string {
    let current = entryId;
    let currentScore = this.similarity(query, this.nodes.get(current)!.vector);

    let improved = true;
    while (improved) {
      improved = false;
      const node = this.nodes.get(current);
      if (!node) break;

      const neighbors = node.neighbors.get(layer);
      if (!neighbors) break;

      for (const neighborId of neighbors) {
        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const score = this.similarity(query, neighbor.vector);
        if (score > currentScore) {
          current = neighborId;
          currentScore = score;
          improved = true;
        }
      }
    }

    return current;
  }

  /**
   * Search in a single layer
   */
  private searchLayer(
    entryId: string,
    query: number[],
    ef: number,
    layer: number,
  ): Array<{ id: string; score: number }> {
    const visited = new Set<string>([entryId]);
    const candidates: Array<{ id: string; score: number }> = [
      {
        id: entryId,
        score: this.similarity(query, this.nodes.get(entryId)!.vector),
      },
    ];
    const results: Array<{ id: string; score: number }> = [...candidates];

    while (candidates.length > 0) {
      // Get closest candidate
      candidates.sort((a, b) => b.score - a.score);
      const current = candidates.shift()!;

      // Get furthest result
      results.sort((a, b) => b.score - a.score);
      const furthest = results[results.length - 1];

      if (current.score < furthest.score) break;

      // Explore neighbors
      const node = this.nodes.get(current.id);
      if (!node) continue;

      const neighbors = node.neighbors.get(layer);
      if (!neighbors) continue;

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const score = this.similarity(query, neighbor.vector);

        if (score > furthest.score || results.length < ef) {
          candidates.push({ id: neighborId, score });
          results.push({ id: neighborId, score });

          if (results.length > ef) {
            results.sort((a, b) => b.score - a.score);
            results.pop();
          }
        }
      }
    }

    return results;
  }

  /**
   * Select best neighbors
   */
  private selectNeighbors(
    candidates: Array<{ id: string; score: number }>,
    maxCount: number,
  ): string[] {
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, maxCount).map((c) => c.id);
  }

  /**
   * Compute similarity based on configured metric
   */
  private similarity(a: number[], b: number[]): number {
    switch (this.config.metric) {
      case "cosine":
        return cosineSimilarity(a, b);
      case "euclidean":
        return 1 / (1 + euclideanDistance(a, b));
      case "dot":
        return dotProduct(a, b);
      default:
        return cosineSimilarity(a, b);
    }
  }

  /**
   * Search for similar vectors
   */
  search(query: number[], topK: number = 5): SearchResult[] {
    if (!this.entryPoint || this.nodes.size === 0) {
      return [];
    }

    // Start from entry point
    let current = this.entryPoint;

    // Traverse from top layer to layer 1
    for (let l = this.maxLayer; l > 0; l--) {
      current = this.greedySearch(current, query, l);
    }

    // Search in layer 0 with higher ef
    const results = this.searchLayer(current, query, this.efSearch, 0);

    return results.slice(0, topK).map((r) => ({
      id: r.id,
      score: r.score,
      metadata: this.nodes.get(r.id)?.metadata,
    }));
  }

  /**
   * Get node by ID
   */
  get(id: string): VectorEntry | null {
    const node = this.nodes.get(id);
    if (!node) return null;
    return {
      id: node.id,
      vector: node.vector,
      metadata: node.metadata,
      createdAt: Date.now(),
    };
  }

  /**
   * Delete a node
   */
  delete(id: string): void {
    // Remove from neighbor lists
    for (const [, node] of this.nodes) {
      for (const [, neighbors] of node.neighbors) {
        neighbors.delete(id);
      }
    }
    this.nodes.delete(id);
  }

  /**
   * Get node count
   */
  count(): number {
    return this.nodes.size;
  }

  /**
   * Clear all nodes
   */
  clear(): void {
    this.nodes.clear();
    this.entryPoint = null;
    this.maxLayer = 0;
  }

  /**
   * Export index for persistence
   */
  export(): { nodes: HNSWNode[]; entryPoint: string | null; maxLayer: number } {
    return {
      nodes: Array.from(this.nodes.values()),
      entryPoint: this.entryPoint,
      maxLayer: this.maxLayer,
    };
  }

  /**
   * Import index from exported data
   */
  import(data: {
    nodes: HNSWNode[];
    entryPoint: string | null;
    maxLayer: number;
  }): void {
    this.nodes.clear();
    for (const node of data.nodes) {
      // Reconstruct Map from serialized data
      const neighbors = new Map<number, Set<string>>();
      for (const [layer, neighborSet] of Object.entries(node.neighbors)) {
        neighbors.set(
          parseInt(layer),
          new Set(neighborSet as unknown as string[]),
        );
      }
      node.neighbors = neighbors;
      this.nodes.set(node.id, node);
    }
    this.entryPoint = data.entryPoint;
    this.maxLayer = data.maxLayer;
  }
}

// ============================================
// Factory Function
// ============================================

export function createBunVSS(db: Database, config: VectorConfig): BunVSS {
  const vss = new BunVSS(db, config);
  vss.init();
  return vss;
}

export default BunVSS;
