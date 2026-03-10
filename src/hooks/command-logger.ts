/**
 * KendaliAI Command Logger Hook
 *
 * Logs all commands/messages received by the gateway.
 */

import { appendFile, mkdir, stat, rename } from "fs/promises";
import { dirname, resolve, extname } from "path";
import type {
  HookInstance,
  HookConfig,
  MessageHookContext,
  HookResult,
  CommandLoggerConfig,
} from "./types";

/**
 * Error thrown when command-logger hook configuration is invalid
 */
export class CommandLoggerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandLoggerConfigError";
  }
}

/**
 * Create a command-logger hook instance
 */
export function createCommandLoggerHook(config: HookConfig): HookInstance {
  let loggerConfig: CommandLoggerConfig;
  let logFilePath: string | null = null;
  // Create a local copy of config to avoid mutating the input
  let localConfig = { ...config.config };

  const validateConfig = (): void => {
    // No required fields, but validate types if provided
    if (localConfig.logFile && typeof localConfig.logFile !== "string") {
      throw new CommandLoggerConfigError("logFile must be a string");
    }
    if (
      localConfig.maxFileSize &&
      typeof localConfig.maxFileSize !== "number"
    ) {
      throw new CommandLoggerConfigError("maxFileSize must be a number");
    }
  };

  const parseConfig = (): CommandLoggerConfig => {
    return {
      logFile: localConfig.logFile as string | undefined,
      includeTimestamp: (localConfig.includeTimestamp as boolean) ?? true,
      logToConsole: (localConfig.logToConsole as boolean) ?? true,
      maxFileSize: localConfig.maxFileSize as number | undefined,
    };
  };

  const ensureLogDirectory = async (filePath: string): Promise<void> => {
    try {
      await mkdir(dirname(filePath), { recursive: true });
    } catch {
      // Directory already exists
    }
  };

  const formatLogEntry = (
    context: MessageHookContext,
    timestamp: Date,
  ): string => {
    const parts: string[] = [];

    if (loggerConfig.includeTimestamp) {
      parts.push(`[${timestamp.toISOString()}]`);
    }

    parts.push(`gateway=${context.gateway.name}`);
    parts.push(`chat=${context.message.chatId}`);
    parts.push(`user=${context.message.username || context.message.userId}`);
    parts.push(`type=${context.message.type}`);

    if (context.message.text) {
      // Truncate long messages
      const text =
        context.message.text.length > 200
          ? context.message.text.substring(0, 200) + "..."
          : context.message.text;
      parts.push(`text="${text.replace(/"/g, '\\"')}"`);
    }

    return parts.join(" ") + "\n";
  };

  const rotateLogFile = async (): Promise<void> => {
    if (!logFilePath) return;

    try {
      const fileStat = await stat(logFilePath);
      if (
        loggerConfig.maxFileSize &&
        fileStat.size >= loggerConfig.maxFileSize
      ) {
        // Rotate: rename current file to .1, .2, etc.
        const ext = extname(logFilePath);
        const base = logFilePath.slice(0, -ext.length || logFilePath.length);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const rotatedPath = `${base}.${timestamp}${ext}`;
        await rename(logFilePath, rotatedPath);
        console.log(`command-logger: Rotated log file to ${rotatedPath}`);
      }
    } catch {
      // File doesn't exist yet, no rotation needed
    }
  };

  const logToFile = async (entry: string): Promise<void> => {
    if (!logFilePath) return;

    try {
      await ensureLogDirectory(logFilePath);
      await rotateLogFile();
      await appendFile(logFilePath, entry, "utf-8");
    } catch (error) {
      console.error("command-logger: Failed to write to log file:", error);
    }
  };

  const logToConsole = (entry: string): void => {
    if (!loggerConfig.logToConsole) return;
    console.log(entry.trim());
  };

  return {
    name: "command-logger",
    description: "Logs all commands and messages received by the gateway",

    async init(configData: Record<string, unknown>): Promise<void> {
      localConfig = { ...localConfig, ...configData };
      validateConfig();
      loggerConfig = parseConfig();

      // Set up log file path
      if (loggerConfig.logFile) {
        logFilePath = resolve(process.cwd(), loggerConfig.logFile);
        await ensureLogDirectory(logFilePath);
        console.log(`command-logger: Logging to ${logFilePath}`);
      }
    },

    async onMessageReceive(context: MessageHookContext): Promise<HookResult> {
      const timestamp = new Date();
      const entry = formatLogEntry(context, timestamp);

      // Log to file
      await logToFile(entry);

      // Log to console
      logToConsole(entry);

      return { continue: true };
    },

    async destroy(): Promise<void> {
      // Nothing to clean up
      logFilePath = null;
    },
  };
}

/**
 * Default command-logger hook (unconfigured)
 */
export const commandLoggerHook: HookInstance = {
  name: "command-logger",
  description: "Logs all commands and messages received by the gateway",

  async onMessageReceive(context: MessageHookContext): Promise<HookResult> {
    // Default: just log to console
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] gateway=${context.gateway.name} chat=${context.message.chatId} user=${context.message.username || context.message.userId} text="${context.message.text || ""}"`;
    console.log(entry);
    return { continue: true };
  },
};
