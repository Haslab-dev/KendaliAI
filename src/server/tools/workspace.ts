/**
 * Workspace Tools - Agent Self-Modification Capabilities
 *
 * These tools allow the agent to read and write its own brain files.
 * This enables self-improvement and persistent memory.
 *
 * Based on OpenClaw's file-driven cognition model.
 */

import { toolRegistry } from "./registry";
import {
  loadSessionContext,
  loadBehavioralRules,
  writeToMemory,
  updateLongTermMemory,
  writeToFile,
  readFromFile,
  listMemoryFiles,
  consolidateMemory,
  getWorkspacePaths,
} from "../context/session";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

let currentGatewayName: string | null = null;

export function setWorkspaceContext(gatewayName: string): void {
  currentGatewayName = gatewayName;
}

function getGateway(): string {
  if (!currentGatewayName) {
    throw new Error("Workspace not initialized. Gateway context missing.");
  }
  return currentGatewayName;
}

const readWorkspaceFile = toolRegistry.register({
  name: "read_workspace_file",
  description:
    "Read a file from your workspace brain (SOUL.md, USER.md, AGENTS.md, TOOLS.md, MEMORY.md, BOOT.md). Use this to understand your own identity, rules, or memory.",
  parameters: {
    type: "object",
    properties: {
      file: {
        type: "string",
        enum: [
          "SOUL.md",
          "USER.md",
          "AGENTS.md",
          "TOOLS.md",
          "MEMORY.md",
          "BOOT.md",
        ],
        description: "The workspace file to read",
      },
    },
    required: ["file"],
  },
  handler: async (params: any) => {
    const { file } = params;
    try {
      const gateway = getGateway();
      const content = readFromFile(gateway, file);
      return {
        success: true,
        file,
        content: content || "(file is empty or does not exist)",
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

const writeWorkspaceFile = toolRegistry.register({
  name: "write_workspace_file",
  description:
    "Write to a workspace file to update your own personality, rules, or memory. Use with care - this permanently changes your behavior. Allowed files: SOUL.md, USER.md, AGENTS.md, TOOLS.md, MEMORY.md",
  parameters: {
    type: "object",
    properties: {
      file: {
        type: "string",
        enum: ["SOUL.md", "USER.md", "AGENTS.md", "TOOLS.md", "MEMORY.md"],
        description: "The workspace file to write",
      },
      content: {
        type: "string",
        description:
          "The new content for the file (will replace existing content)",
      },
    },
    required: ["file", "content"],
  },
  handler: async (params: any) => {
    const { file, content } = params;
    try {
      const gateway = getGateway();
      writeToFile(gateway, file, content);
      return {
        success: true,
        file,
        message: `Updated ${file}. Changes will take effect on next session.`,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

const logMemoryTool = toolRegistry.register({
  name: "log_memory",
  description:
    "Write an entry to today's memory log. Use this to remember important events, decisions, or learnings from the conversation.",
  parameters: {
    type: "object",
    properties: {
      entry: {
        type: "string",
        description: "The memory entry to log",
      },
      category: {
        type: "string",
        enum: ["event", "decision", "learning", "user", "error"],
        description: "Category of the memory",
      },
    },
    required: ["entry"],
  },
  handler: async (params: any) => {
    const { entry, category } = params;
    try {
      const gateway = getGateway();
      const categorizedEntry = category
        ? `[${category.toUpperCase()}] ${entry}`
        : entry;
      writeToMemory(gateway, categorizedEntry);
      return {
        success: true,
        message: "Memory logged successfully.",
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

const updateLongTermMemoryTool = toolRegistry.register({
  name: "update_long_term_memory",
  description:
    "Add important insights to long-term memory (MEMORY.md). Use this for things you want to remember across all sessions, not just daily events.",
  parameters: {
    type: "object",
    properties: {
      insight: {
        type: "string",
        description: "The insight or information to add to long-term memory",
      },
      topic: {
        type: "string",
        description: "Topic or category for organization",
      },
    },
    required: ["insight"],
  },
  handler: async (params: any) => {
    const { insight, topic } = params;
    try {
      const gateway = getGateway();
      const formattedInsight = topic ? `\n### ${topic}\n${insight}` : insight;
      updateLongTermMemory(gateway, formattedInsight);
      return {
        success: true,
        message: "Long-term memory updated.",
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

const getRecentMemoryTool = toolRegistry.register({
  name: "get_recent_memory",
  description:
    "Load your session context including soul, user profile, and recent memory. Use this at the start of conversations to recall who you are and what you know.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async (_params: any) => {
    try {
      const gateway = getGateway();
      const context = loadSessionContext(gateway);
      return {
        success: true,
        context: {
          hasSoul: !!context.soul,
          hasUser: !!context.user,
          hasLongTermMemory: !!context.memory,
          hasTodayLog: !!context.todayLog,
          hasYesterdayLog: !!context.yesterdayLog,
          fullContext: context.fullContext,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

const listMemoryLogsTool = toolRegistry.register({
  name: "list_memory_logs",
  description:
    "List all available daily memory log dates. Use this to find specific past memories.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of dates to return (default 10)",
      },
    },
    required: [],
  },
  handler: async (params: any) => {
    const { limit = 10 } = params;
    try {
      const gateway = getGateway();
      const files = listMemoryFiles(gateway).slice(0, limit);
      return {
        success: true,
        dates: files,
        count: files.length,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

const readMemoryLogTool = toolRegistry.register({
  name: "read_memory_log",
  description: "Read a specific day's memory log by date (YYYY-MM-DD format).",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Date in YYYY-MM-DD format",
      },
    },
    required: ["date"],
  },
  handler: async (params: any) => {
    const { date } = params;
    try {
      const gateway = getGateway();
      const paths = getWorkspacePaths(gateway);
      const filePath = join(paths.memoryDir, `${date}.md`);

      if (!existsSync(filePath)) {
        return { success: false, error: `No memory log found for ${date}` };
      }

      const content = readFileSync(filePath, "utf-8");
      return {
        success: true,
        date,
        content,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

const consolidateMemoriesTool = toolRegistry.register({
  name: "consolidate_memories",
  description:
    "Consolidate old daily memory logs into long-term memory and clean up. Use this periodically to keep memory organized.",
  parameters: {
    type: "object",
    properties: {
      daysToKeep: {
        type: "number",
        description: "Number of days of daily logs to keep (default 30)",
      },
    },
    required: [],
  },
  handler: async (params: any) => {
    const { daysToKeep = 30 } = params;
    try {
      const gateway = getGateway();
      consolidateMemory(gateway, daysToKeep);
      return {
        success: true,
        message: `Consolidated memories older than ${daysToKeep} days into long-term memory.`,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

const getBehavioralRulesTool = toolRegistry.register({
  name: "get_behavioral_rules",
  description:
    "Load your behavioral constitution (AGENTS.md). Use this when you need to check your rules for how to behave.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async (_params: any) => {
    try {
      const gateway = getGateway();
      const rules = loadBehavioralRules(gateway);
      return {
        success: true,
        rules: rules || "(no behavioral rules defined)",
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});

export const workspaceTools = [
  readWorkspaceFile,
  writeWorkspaceFile,
  logMemoryTool,
  updateLongTermMemoryTool,
  getRecentMemoryTool,
  listMemoryLogsTool,
  readMemoryLogTool,
  consolidateMemoriesTool,
  getBehavioralRulesTool,
];

export function registerWorkspaceTools(): void {}
