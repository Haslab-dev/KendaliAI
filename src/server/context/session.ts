/**
 * KendaliAI Session Context - OpenClaw-Style File-Driven Cognition
 *
 * Instead of compiling everything into a giant system prompt,
 * the agent reads its own files as runtime knowledge.
 *
 * Architecture:
 * - SOUL.md: Core persona (philosophical, not technical)
 * - USER.md: User profile and preferences
 * - MEMORY.md: Curated long-term memory
 * - memory/YYYY-MM-DD.md: Daily logs (episodic memory)
 * - AGENTS.md: Behavioral constitution (loaded when needed)
 * - TOOLS.md: Environment configuration (loaded when needed)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";

const HOME_DIR = homedir();
const KENDALIAI_DIR =
  process.env.KENDALIAI_DATA_DIR || join(HOME_DIR, ".kendaliai");

export interface SessionContext {
  soul: string;
  user: string;
  memory: string;
  todayLog: string;
  yesterdayLog: string;
  fullContext: string;
}

export interface GatewayPaths {
  base: string;
  soul: string;
  user: string;
  agents: string;
  tools: string;
  memory: string;
  memoryDir: string;
  boot: string;
}

export function getWorkspacePaths(gatewayName: string): GatewayPaths {
  const base = join(KENDALIAI_DIR, gatewayName);
  return {
    base,
    soul: join(base, "SOUL.md"),
    user: join(base, "USER.md"),
    agents: join(base, "AGENTS.md"),
    tools: join(base, "TOOLS.md"),
    memory: join(base, "MEMORY.md"),
    memoryDir: join(base, "memory"),
    boot: join(base, "BOOT.md"),
  };
}

function safeRead(path: string): string {
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return "";
  }
}

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
}

function findRecentMemoryLogs(memoryDir: string, days: number = 7): string[] {
  if (!existsSync(memoryDir)) return [];

  const logs: { date: string; content: string }[] = [];
  const entries = readdirSync(memoryDir);

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const date = entry.replace(".md", "");
    const filePath = join(memoryDir, entry);
    const content = safeRead(filePath);
    if (content) {
      logs.push({ date, content });
    }
  }

  logs.sort((a, b) => b.date.localeCompare(a.date));
  return logs.slice(0, days).map((l) => `## ${l.date}\n${l.content}`);
}

export function loadSessionContext(gatewayName: string): SessionContext {
  const paths = getWorkspacePaths(gatewayName);

  ensureMemoryDir(gatewayName);

  const soul = safeRead(paths.soul);
  const user = safeRead(paths.user);
  const memory = safeRead(paths.memory);

  const todayDate = getTodayDate();
  const yesterdayDate = getYesterdayDate();
  const todayLog = safeRead(join(paths.memoryDir, `${todayDate}.md`));
  const yesterdayLog = safeRead(join(paths.memoryDir, `${yesterdayDate}.md`));

  let fullContext = "";

  if (soul) {
    fullContext += `<soul>\n${soul}\n</soul>\n\n`;
  }

  if (user) {
    fullContext += `<user>\n${user}\n</user>\n\n`;
  }

  if (memory) {
    fullContext += `<longterm-memory>\n${memory}\n</longterm-memory>\n\n`;
  }

  if (yesterdayLog) {
    fullContext += `<yesterday>\n${yesterdayLog}\n</yesterday>\n\n`;
  }

  if (todayLog) {
    fullContext += `<today>\n${todayLog}\n</today>\n\n`;
  }

  return {
    soul,
    user,
    memory,
    todayLog,
    yesterdayLog,
    fullContext: fullContext.trim(),
  };
}

export function loadBehavioralRules(gatewayName: string): string {
  const paths = getWorkspacePaths(gatewayName);
  return safeRead(paths.agents);
}

export function loadToolsConfig(gatewayName: string): string {
  const paths = getWorkspacePaths(gatewayName);
  return safeRead(paths.tools);
}

export function loadBootScript(gatewayName: string): string {
  const paths = getWorkspacePaths(gatewayName);
  return safeRead(paths.boot);
}

export function ensureMemoryDir(gatewayName: string): string {
  const paths = getWorkspacePaths(gatewayName);
  if (!existsSync(paths.memoryDir)) {
    mkdirSync(paths.memoryDir, { recursive: true });
  }
  return paths.memoryDir;
}

export function writeToMemory(
  gatewayName: string,
  content: string,
  date?: string,
): void {
  const paths = getWorkspacePaths(gatewayName);
  ensureMemoryDir(gatewayName);

  const targetDate = date || getTodayDate();
  const filePath = join(paths.memoryDir, `${targetDate}.md`);

  const timestamp = new Date().toISOString();
  const entry = `\n## ${timestamp}\n${content}\n`;

  if (existsSync(filePath)) {
    writeFileSync(filePath, entry, { flag: "a" });
  } else {
    writeFileSync(filePath, `# Memory Log - ${targetDate}\n${entry}`);
  }
}

export function updateLongTermMemory(
  gatewayName: string,
  content: string,
): void {
  const paths = getWorkspacePaths(gatewayName);
  const existing = safeRead(paths.memory);

  if (existing) {
    writeFileSync(paths.memory, `${existing}\n\n${content}`);
  } else {
    writeFileSync(paths.memory, `# Long-Term Memory\n\n${content}`);
  }
}

export function writeToFile(
  gatewayName: string,
  filename: string,
  content: string,
): void {
  const paths = getWorkspacePaths(gatewayName);
  const validFiles = [
    "SOUL.md",
    "USER.md",
    "AGENTS.md",
    "TOOLS.md",
    "MEMORY.md",
    "BOOT.md",
  ];

  const normalized = filename.toUpperCase();
  if (!validFiles.includes(normalized)) {
    throw new Error(
      `Cannot write to ${filename}. Only workspace files are allowed.`,
    );
  }

  const filePath = join(paths.base, normalized);
  writeFileSync(filePath, content);
}

export function readFromFile(gatewayName: string, filename: string): string {
  const paths = getWorkspacePaths(gatewayName);
  const validFiles = [
    "SOUL.md",
    "USER.md",
    "AGENTS.md",
    "TOOLS.md",
    "MEMORY.md",
    "BOOT.md",
  ];

  const normalized = filename.toUpperCase();
  if (!validFiles.includes(normalized)) {
    throw new Error(
      `Cannot read ${filename}. Only workspace files are allowed.`,
    );
  }

  return safeRead(join(paths.base, normalized));
}

export function consolidateMemory(
  gatewayName: string,
  daysToKeep: number = 30,
): void {
  const paths = getWorkspacePaths(gatewayName);
  if (!existsSync(paths.memoryDir)) return;

  const entries = readdirSync(paths.memoryDir);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;

    const dateStr = entry.replace(".md", "");
    const entryDate = new Date(dateStr);

    if (entryDate < cutoffDate) {
      const filePath = join(paths.memoryDir, entry);
      const content = safeRead(filePath);

      if (content && !content.includes("[CONSOLIDATED]")) {
        const summaryHeader = `\n## Consolidated from ${dateStr}\n`;
        updateLongTermMemory(
          gatewayName,
          summaryHeader + content.slice(0, 500) + "\n[CONSOLIDATED]",
        );
      }

      try {
        unlinkSync(filePath);
      } catch {}
    }
  }
}

export function listMemoryFiles(gatewayName: string): string[] {
  const paths = getWorkspacePaths(gatewayName);
  if (!existsSync(paths.memoryDir)) return [];

  return readdirSync(paths.memoryDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(".md", ""))
    .sort((a, b) => b.localeCompare(a));
}
