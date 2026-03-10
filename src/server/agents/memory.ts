import { log } from "../core";
import { dbManager } from "../database";
import { messages, tasks, eventLogs } from "../database/schema";
import { desc, eq, and, gt } from "drizzle-orm";

export interface MemoryEntry {
  id: string;
  type: "conversation" | "task" | "fact" | "context";
  content: string;
  metadata?: Record<string, any>;
  timestamp: string;
  relevance?: number;
}

export interface ConversationMemory {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
  }>;
  summary?: string;
}

export interface AgentMemoryConfig {
  maxShortTermMessages?: number; // Max messages in short-term memory
  maxLongTermEntries?: number; // Max entries in long-term memory
  summaryThreshold?: number; // Messages before summarization
}

const DEFAULT_CONFIG: AgentMemoryConfig = {
  maxShortTermMessages: 20,
  maxLongTermEntries: 100,
  summaryThreshold: 10,
};

export class AgentMemory {
  private agentId: string;
  private config: AgentMemoryConfig;
  private shortTermMemory: MemoryEntry[] = [];

  constructor(agentId: string, config?: AgentMemoryConfig) {
    this.agentId = agentId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a memory entry
   */
  async addEntry(
    type: MemoryEntry["type"],
    content: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const entry: MemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      content,
      metadata,
      timestamp: new Date().toISOString(),
    };

    // Add to short-term memory
    this.shortTermMemory.push(entry);

    // Trim short-term memory if needed
    if (
      this.shortTermMemory.length > (this.config.maxShortTermMessages || 20)
    ) {
      const removed = this.shortTermMemory.shift();

      // Optionally persist to long-term memory
      if (removed && removed.type === "fact") {
        await this.persistToLongTerm(removed);
      }
    }

    log.info(`[Memory:${this.agentId}] Added ${type} entry`);
  }

  /**
   * Add conversation message
   */
  async addMessage(
    role: "user" | "assistant" | "system",
    content: string,
  ): Promise<void> {
    await this.addEntry("conversation", content, { role });
  }

  /**
   * Add a fact to remember
   */
  async addFact(
    content: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.addEntry("fact", content, metadata);
    // Also persist facts to long-term storage
    await this.persistToLongTerm({
      id: `fact_${Date.now()}`,
      type: "fact",
      content,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Add task context
   */
  async addTaskContext(
    taskId: string,
    description: string,
    result?: string,
  ): Promise<void> {
    await this.addEntry("task", description, { taskId, result });
  }

  /**
   * Get recent conversation context
   */
  getConversationContext(maxMessages?: number): ConversationMemory {
    const messages = this.shortTermMemory
      .filter((e) => e.type === "conversation")
      .slice(-(maxMessages || this.config.maxShortTermMessages || 20))
      .map((e) => ({
        role: e.metadata?.role as "user" | "assistant" | "system",
        content: e.content,
        timestamp: e.timestamp,
      }));

    return { messages };
  }

  /**
   * Get all relevant context for a query
   */
  getContext(query: string): string {
    const parts: string[] = [];

    // Add recent conversation
    const conversation = this.getConversationContext(5);
    if (conversation.messages.length > 0) {
      parts.push("Recent conversation:");
      for (const msg of conversation.messages) {
        parts.push(`  ${msg.role}: ${msg.content.substring(0, 200)}`);
      }
    }

    // Add relevant facts
    const facts = this.shortTermMemory.filter((e) => e.type === "fact");
    if (facts.length > 0) {
      parts.push("\nRelevant facts:");
      for (const fact of facts.slice(-5)) {
        parts.push(`  - ${fact.content}`);
      }
    }

    // Add recent tasks
    const tasks = this.shortTermMemory.filter((e) => e.type === "task");
    if (tasks.length > 0) {
      parts.push("\nRecent tasks:");
      for (const task of tasks.slice(-3)) {
        parts.push(`  - ${task.content}`);
      }
    }

    return parts.join("\n");
  }

  /**
   * Build context for AI prompt
   */
  buildPromptContext(): string {
    const context = this.getContext("");
    if (!context) return "";

    return `\n<agent_memory>\n${context}\n</agent_memory>\n`;
  }

  /**
   * Persist entry to long-term storage (database)
   */
  private async persistToLongTerm(entry: MemoryEntry): Promise<void> {
    try {
      // Store in event logs as a memory entry
      await dbManager.db.insert(eventLogs).values({
        type: "agent_memory",
        level: "info",
        message: entry.content,
        data: JSON.stringify({
          agentId: this.agentId,
          entryType: entry.type,
          metadata: entry.metadata,
        }),
        source: `memory:${this.agentId}`,
        correlationId: entry.id,
      });

      log.debug(
        `[Memory:${this.agentId}] Persisted ${entry.type} to long-term storage`,
      );
    } catch (error) {
      log.warn(
        `[Memory:${this.agentId}] Failed to persist to long-term: ${error}`,
      );
    }
  }

  /**
   * Load long-term memories
   */
  async loadLongTermMemories(limit?: number): Promise<MemoryEntry[]> {
    try {
      const results = await dbManager.db
        .select()
        .from(eventLogs)
        .where(
          and(
            eq(eventLogs.type, "agent_memory"),
            eq(eventLogs.source, `memory:${this.agentId}`),
          ),
        )
        .orderBy(desc(eventLogs.createdAt))
        .limit(limit || this.config.maxLongTermEntries || 100);

      return results.map((r) => {
        const data = r.data ? JSON.parse(r.data) : {};
        return {
          id: r.correlationId || r.id.toString(),
          type: data.entryType || "context",
          content: r.message,
          metadata: data.metadata,
          timestamp: r.createdAt || "",
        };
      });
    } catch (error) {
      log.warn(
        `[Memory:${this.agentId}] Failed to load long-term memories: ${error}`,
      );
      return [];
    }
  }

  /**
   * Clear short-term memory
   */
  clearShortTerm(): void {
    this.shortTermMemory = [];
    log.info(`[Memory:${this.agentId}] Cleared short-term memory`);
  }

  /**
   * Get memory stats
   */
  getStats(): {
    shortTermCount: number;
    conversationCount: number;
    factCount: number;
    taskCount: number;
  } {
    return {
      shortTermCount: this.shortTermMemory.length,
      conversationCount: this.shortTermMemory.filter(
        (e) => e.type === "conversation",
      ).length,
      factCount: this.shortTermMemory.filter((e) => e.type === "fact").length,
      taskCount: this.shortTermMemory.filter((e) => e.type === "task").length,
    };
  }
}

// Memory manager for multiple agents
class MemoryManager {
  private memories: Map<string, AgentMemory> = new Map();

  /**
   * Get or create memory for an agent
   */
  getMemory(agentId: string, config?: AgentMemoryConfig): AgentMemory {
    if (!this.memories.has(agentId)) {
      this.memories.set(agentId, new AgentMemory(agentId, config));
    }
    return this.memories.get(agentId)!;
  }

  /**
   * Clear memory for an agent
   */
  clearMemory(agentId: string): void {
    const memory = this.memories.get(agentId);
    if (memory) {
      memory.clearShortTerm();
      this.memories.delete(agentId);
    }
  }

  /**
   * Clear all memories
   */
  clearAll(): void {
    for (const memory of this.memories.values()) {
      memory.clearShortTerm();
    }
    this.memories.clear();
  }
}

export const memoryManager = new MemoryManager();
