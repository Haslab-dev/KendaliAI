/**
 * KendaliAI RAG CLI Commands
 *
 * CLI commands for managing RAG (Retrieval-Augmented Generation) including:
 * - Document ingestion
 * - Document management
 * - Search and retrieval
 * - Statistics
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { join, resolve, basename, extname } from "path";
import { readFile, stat } from "fs/promises";
import { createRAGEngine } from "../server/rag/engine";
import type {
  RAGEngine,
  RAGConfig,
  RetrievalConfig,
  Document,
  VectorSearchResult,
} from "../server/rag/types";
import { DEFAULT_RAG_CONFIG } from "../server/rag/types";

// ============================================
// Console Colors
// ============================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function color(text: string, colorName: keyof typeof colors): string {
  return `${colors[colorName]}${text}${colors.reset}`;
}

// ============================================
// Global State
// ============================================

const KENDALIAI_DIR = join(process.cwd(), ".kendaliai");
const DB_PATH = join(KENDALIAI_DIR, "kendaliai.db");

let db: Database | null = null;

// ============================================
// Database Helper
// ============================================

function getDb(): Database {
  if (!db) {
    if (!existsSync(KENDALIAI_DIR)) {
      mkdirSync(KENDALIAI_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.run("PRAGMA journal_mode = WAL");
  }
  return db;
}

function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================
// RAG Helper
// ============================================

async function initializeRAG(configPath?: string): Promise<RAGEngine> {
  let config: Partial<RAGConfig> = {};

  if (configPath && existsSync(configPath)) {
    try {
      const configContent = await readFile(configPath, "utf-8");
      config = JSON.parse(configContent);
    } catch (error) {
      console.error(
        color(`Failed to load config file: ${configPath}`, "yellow"),
      );
    }
  }

  // Auto-configure embedding from environment variables
  const embeddingsApiKey = process.env.EMBEDDINGS_API_KEY;
  const embeddingsModel = process.env.EMBEDDINGS_MODEL;

  if (embeddingsApiKey && !config.embedding) {
    // Use Maia Router / OpenAI-compatible embeddings from env
    process.env.OPENAI_API_KEY = embeddingsApiKey;
    config.embedding = {
      provider: "openai",
      model: embeddingsModel || "text-embedding-3-small",
      dimensions: 1536,
      batchSize: 100,
      useCache: true,
      cacheTTL: 7 * 24 * 60 * 60 * 1000,
    };
  }

  const database = getDb();
  return createRAGEngine(database, config);
}

// ============================================
// RAG CLI Commands
// ============================================

/**
 * Ingest a document
 */
async function ingestCommand(
  source: string,
  options: Record<string, string>,
): Promise<void> {
  console.log(color("Initializing RAG engine...", "cyan"));

  try {
    const rag = await initializeRAG(options.config);
    console.log(color("Ingesting document...", "cyan"));

    let doc: Document;
    const metadata: Record<string, unknown> = {};

    if (options.gateway) metadata.gatewayId = options.gateway;
    if (options.title) metadata.title = options.title;
    if (options.tags)
      metadata.tags = options.tags.split(",").map((t) => t.trim());

    // Determine source type
    if (source.startsWith("http://") || source.startsWith("https://")) {
      console.log(color("Fetching from URL...", "dim"));
      metadata.source = "url";
      doc = await rag.ingestUrl(source, metadata as any);
    } else if (existsSync(resolve(source))) {
      console.log(color("Reading file...", "dim"));
      metadata.source = "file";
      doc = await rag.ingestFile(resolve(source), metadata as any);
    } else {
      // Treat as text content - always set source to 'text'
      metadata.source = "text";
      doc = await rag.ingestDocument(source, metadata as any);
    }

    console.log(color("\n✓ Document ingested successfully!", "green"));

    console.log(color("\nDocument Details:", "bold"));
    console.log(`  ID: ${color(doc.id, "cyan")}`);
    console.log(`  Status: ${getStatusColor(doc.status)(doc.status)}`);
    console.log(`  Content Hash: ${doc.contentHash.slice(0, 16)}...`);
    console.log(`  Content Length: ${doc.content.length} characters`);

    if (doc.error) {
      console.log(`  Error: ${color(doc.error, "red")}`);
    }
  } catch (error) {
    console.error(color("\n✗ Failed to ingest document", "red"));
    console.error(
      color(error instanceof Error ? error.message : "Unknown error", "red"),
    );
    process.exit(1);
  }
}

/**
 * List documents
 */
async function listCommand(options: Record<string, string>): Promise<void> {
  console.log(color("Fetching documents...", "cyan"));

  try {
    const rag = await initializeRAG(options.config);
    const documents = await rag.listDocuments({
      gatewayId: options.gateway,
      limit: parseInt(options.limit || "20"),
    });

    if (options.json === "true") {
      console.log(JSON.stringify(documents, null, 2));
      return;
    }

    if (documents.length === 0) {
      console.log(color("No documents found.", "yellow"));
      return;
    }

    console.log();
    console.log(
      color(
        "  ID        Source          Title                            Status     Ingested",
        "dim",
      ),
    );
    console.log(
      color(
        "  ─────────────────────────────────────────────────────────────────────────────",
        "dim",
      ),
    );

    for (const doc of documents) {
      const id = doc.id.slice(0, 8).padEnd(10);
      const source = (doc.metadata.source || "-").slice(0, 14).padEnd(16);
      const title = (doc.metadata.title || "-").slice(0, 30).padEnd(32);
      const status = getStatusColor(doc.status)(doc.status.padEnd(10));
      const ingested = doc.ingestedAt.toLocaleDateString();

      console.log(`  ${id} ${source} ${title} ${status} ${ingested}`);
    }

    console.log();
    console.log(color(`Total: ${documents.length} documents`, "dim"));
  } catch (error) {
    console.error(color("\n✗ Failed to list documents", "red"));
    console.error(
      color(error instanceof Error ? error.message : "Unknown error", "red"),
    );
    process.exit(1);
  }
}

/**
 * Show document details
 */
async function showCommand(
  documentId: string,
  options: Record<string, string>,
): Promise<void> {
  console.log(color("Fetching document...", "cyan"));

  try {
    const rag = await initializeRAG(options.config);
    const doc = await rag.getDocument(documentId);

    if (!doc) {
      console.error(color(`\n✗ Document not found: ${documentId}`, "red"));
      process.exit(1);
    }

    console.log(color("\nDocument Details:", "bold"));
    console.log(`  ID: ${color(doc.id, "cyan")}`);
    console.log(`  Source: ${doc.metadata.source}`);
    console.log(`  Title: ${doc.metadata.title || "-"}`);
    console.log(`  Status: ${getStatusColor(doc.status)(doc.status)}`);
    console.log(`  Content Hash: ${doc.contentHash}`);
    console.log(`  Content Length: ${doc.content.length} characters`);
    console.log(`  Ingested: ${doc.ingestedAt.toLocaleString()}`);

    if (doc.metadata.gatewayId) {
      console.log(`  Gateway: ${doc.metadata.gatewayId}`);
    }

    if (doc.error) {
      console.log(`  Error: ${color(doc.error, "red")}`);
    }

    if (options.content === "true") {
      console.log(color("\nContent:", "bold"));
      console.log(
        doc.content.slice(0, 1000) + (doc.content.length > 1000 ? "..." : ""),
      );
    }

    if (options.chunks === "true") {
      const chunks = await rag.getChunks(documentId);
      console.log(color(`\nChunks (${chunks.length}):`, "bold"));

      for (const chunk of chunks.slice(0, 5)) {
        console.log(
          color(`  [${chunk.index}] `, "dim") +
            chunk.content.slice(0, 100) +
            "...",
        );
      }

      if (chunks.length > 5) {
        console.log(color(`  ... and ${chunks.length - 5} more chunks`, "dim"));
      }
    }
  } catch (error) {
    console.error(color("\n✗ Failed to show document", "red"));
    console.error(
      color(error instanceof Error ? error.message : "Unknown error", "red"),
    );
    process.exit(1);
  }
}

/**
 * Delete document
 */
async function deleteCommand(
  documentId: string,
  options: Record<string, string>,
): Promise<void> {
  try {
    const rag = await initializeRAG(options.config);
    const doc = await rag.getDocument(documentId);

    if (!doc) {
      console.error(color(`\n✗ Document not found: ${documentId}`, "red"));
      process.exit(1);
    }

    if (options.force !== "true") {
      console.log(
        color(
          `About to delete document: ${doc.metadata.title || documentId}`,
          "yellow",
        ),
      );
      console.log(color(`Source: ${doc.metadata.source}`, "dim"));
      console.log(
        color(`Content length: ${doc.content.length} characters`, "dim"),
      );
      console.log(color("\nUse --force to confirm deletion", "yellow"));
      return;
    }

    console.log(color("Deleting document...", "cyan"));
    await rag.deleteDocument(documentId);
    console.log(color(`\n✓ Document deleted: ${documentId}`, "green"));
  } catch (error) {
    console.error(color("\n✗ Failed to delete document", "red"));
    console.error(
      color(error instanceof Error ? error.message : "Unknown error", "red"),
    );
    process.exit(1);
  }
}

/**
 * Search documents
 */
async function searchCommand(
  query: string,
  options: Record<string, string>,
): Promise<void> {
  console.log(color("Searching...", "cyan"));

  try {
    const rag = await initializeRAG(options.config);

    const searchOptions: Partial<RetrievalConfig> = {
      gatewayId: options.gateway,
      topK: parseInt(options.topK || "5"),
      minScore: parseFloat(options.minScore || "0.5"),
      strategy: (options.strategy as any) || "hybrid",
    };

    if (options.context === "true") {
      const context = await rag.buildContext(query, searchOptions);
      console.log(color("\nContext:", "bold"));
      console.log(context);
    } else {
      const results = await rag.search(query, searchOptions);

      if (options.json === "true") {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.chunks.length === 0) {
        console.log(color("\nNo results found.", "yellow"));
        return;
      }

      console.log(color(`\nSearch Results for "${query}":`, "bold"));

      for (let i = 0; i < results.chunks.length; i++) {
        const chunk = results.chunks[i];
        console.log();
        console.log(
          color(`[${i + 1}] Score: ${(chunk.score * 100).toFixed(1)}%`, "cyan"),
        );
        console.log(color(`    Document: ${chunk.documentId}`, "dim"));
        console.log(
          color(`    Content: ${chunk.content.slice(0, 200)}...`, "dim"),
        );
      }
    }
  } catch (error) {
    console.error(color("\n✗ Search failed", "red"));
    console.error(
      color(error instanceof Error ? error.message : "Unknown error", "red"),
    );
    process.exit(1);
  }
}

/**
 * Show statistics
 */
async function statsCommand(options: Record<string, string>): Promise<void> {
  console.log(color("Fetching statistics...", "cyan"));

  try {
    const rag = await initializeRAG(options.config);
    const stats = await rag.getStats();

    if (options.json === "true") {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    console.log(color("\nRAG Statistics:", "bold"));
    console.log(`  Documents: ${color(String(stats.totalDocuments), "cyan")}`);
    console.log(`  Chunks: ${color(String(stats.totalChunks), "cyan")}`);
    console.log(
      `  Embeddings: ${color(String(stats.totalEmbeddings), "cyan")}`,
    );
    console.log(`  Cache Size: ${color(String(stats.cacheSize), "cyan")}`);
    console.log(
      `  Avg Chunk Size: ${color(stats.avgChunkSize + " characters", "cyan")}`,
    );

    if (stats.storageSize) {
      console.log(
        `  Storage Size: ${color(formatBytes(stats.storageSize), "cyan")}`,
      );
    }
  } catch (error) {
    console.error(color("\n✗ Failed to fetch statistics", "red"));
    console.error(
      color(error instanceof Error ? error.message : "Unknown error", "red"),
    );
    process.exit(1);
  }
}

/**
 * Clear all data
 */
async function clearCommand(options: Record<string, string>): Promise<void> {
  if (options.force !== "true") {
    console.log(
      color(
        "This will delete all RAG data (documents, chunks, embeddings).",
        "yellow",
      ),
    );
    console.log(color("Use --force to confirm.", "yellow"));
    return;
  }

  console.log(color("Clearing RAG data...", "cyan"));

  try {
    const rag = await initializeRAG(options.config);
    await rag.clear();
    console.log(color("\n✓ All RAG data cleared.", "green"));
  } catch (error) {
    console.error(color("\n✗ Failed to clear RAG data", "red"));
    console.error(
      color(error instanceof Error ? error.message : "Unknown error", "red"),
    );
    process.exit(1);
  }
}

/**
 * Show configuration
 */
async function configCommand(options: Record<string, string>): Promise<void> {
  if (options.json === "true") {
    console.log(JSON.stringify(DEFAULT_RAG_CONFIG, null, 2));
    return;
  }

  console.log(color("\nRAG Configuration:", "bold"));
  console.log(color("\nChunking:", "cyan"));
  console.log(`  Strategy: ${DEFAULT_RAG_CONFIG.chunking.strategy}`);
  console.log(`  Max Chunk Size: ${DEFAULT_RAG_CONFIG.chunking.maxChunkSize}`);
  console.log(`  Overlap: ${DEFAULT_RAG_CONFIG.chunking.overlap}`);

  console.log(color("\nEmbedding:", "cyan"));
  console.log(`  Provider: ${DEFAULT_RAG_CONFIG.embedding.provider}`);
  console.log(`  Model: ${DEFAULT_RAG_CONFIG.embedding.model}`);
  console.log(`  Dimensions: ${DEFAULT_RAG_CONFIG.embedding.dimensions}`);

  console.log(color("\nVector Storage:", "cyan"));
  console.log(`  Backend: ${DEFAULT_RAG_CONFIG.vector.backend}`);
  console.log(`  Metric: ${DEFAULT_RAG_CONFIG.vector.metric}`);

  console.log(color("\nRetrieval:", "cyan"));
  console.log(`  Strategy: ${DEFAULT_RAG_CONFIG.retrieval.strategy}`);
  console.log(`  Top K: ${DEFAULT_RAG_CONFIG.retrieval.topK}`);
  console.log(`  Min Score: ${DEFAULT_RAG_CONFIG.retrieval.minScore}`);
  console.log(`  Vector Weight: ${DEFAULT_RAG_CONFIG.retrieval.vectorWeight}`);
  console.log(
    `  Keyword Weight: ${DEFAULT_RAG_CONFIG.retrieval.keywordWeight}`,
  );
}

// ============================================
// Helper Functions
// ============================================

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case "processed":
      return (text) => color(text, "green");
    case "pending":
      return (text) => color(text, "yellow");
    case "failed":
      return (text) => color(text, "red");
    default:
      return (text) => color(text, "dim");
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ============================================
// Main CLI Handler
// ============================================

export async function handleRAGCommand(args: string[]): Promise<void> {
  const [subcommand, ...subArgs] = args;

  // Parse options
  const options: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < subArgs.length; i++) {
    const arg = subArgs[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value =
        subArgs[i + 1] && !subArgs[i + 1].startsWith("--")
          ? subArgs[i + 1]
          : "true";
      options[key] = value;
      if (value !== "true") i++;
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      const value =
        subArgs[i + 1] && !subArgs[i + 1].startsWith("-")
          ? subArgs[i + 1]
          : "true";
      options[key] = value;
      if (value !== "true") i++;
    } else {
      positional.push(arg);
    }
  }

  try {
    switch (subcommand) {
      case "ingest":
        if (!positional[0]) {
          console.error(color("Error: Missing source argument", "red"));
          console.log("Usage: rag ingest <source> [options]");
          process.exit(1);
        }
        await ingestCommand(positional[0], options);
        break;

      case "list":
      case "ls":
        await listCommand(options);
        break;

      case "show":
        if (!positional[0]) {
          console.error(color("Error: Missing documentId argument", "red"));
          console.log("Usage: rag show <documentId> [options]");
          process.exit(1);
        }
        await showCommand(positional[0], options);
        break;

      case "delete":
      case "rm":
        if (!positional[0]) {
          console.error(color("Error: Missing documentId argument", "red"));
          console.log("Usage: rag delete <documentId> [options]");
          process.exit(1);
        }
        await deleteCommand(positional[0], options);
        break;

      case "search":
        if (!positional[0]) {
          console.error(color("Error: Missing query argument", "red"));
          console.log("Usage: rag search <query> [options]");
          process.exit(1);
        }
        await searchCommand(positional[0], options);
        break;

      case "stats":
        await statsCommand(options);
        break;

      case "clear":
        await clearCommand(options);
        break;

      case "config":
        await configCommand(options);
        break;

      case "help":
      case "--help":
      case "-h":
        printRAGHelp();
        break;

      default:
        console.error(color(`Unknown subcommand: ${subcommand}`, "red"));
        printRAGHelp();
        process.exit(1);
    }
  } finally {
    closeDb();
  }
}

function printRAGHelp(): void {
  console.log(`
${color("KendaliAI RAG Commands", "bold")}

${color("Usage:", "cyan")}
  kendaliai rag <command> [options]

${color("Commands:", "cyan")}
  ingest <source>     Ingest a document (file path, URL, or text)
  list, ls            List all documents
  show <id>           Show document details
  delete <id>         Delete a document
  search <query>      Search for relevant documents
  stats               Show RAG statistics
  clear               Clear all RAG data
  config              Show current configuration

${color("Options:", "cyan")}
  -g, --gateway <id>      Filter by gateway ID
  -t, --title <title>     Document title (for ingest)
  -T, --tags <tags>       Comma-separated tags (for ingest)
  -k, --top-k <number>    Number of search results (default: 5)
  -s, --min-score <score> Minimum similarity score (default: 0.5)
  --strategy <type>       Search strategy: vector|keyword|hybrid (default: hybrid)
  --context               Build context from search results
  --content               Show full content (for show)
  --chunks                Show chunks (for show)
  --force                 Skip confirmation
  --json                  Output as JSON

${color("Examples:", "cyan")}
  kendaliai rag ingest ./docs/readme.md --title "README"
  kendaliai rag ingest https://example.com/article
  kendaliai rag search "how to configure gateway" --top-k 10
  kendaliai rag list --gateway dev-assistant
  kendaliai rag show abc123 --content --chunks
`);
}

export default { handleRAGCommand };
