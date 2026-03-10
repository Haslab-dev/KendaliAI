/**
 * KendaliAI Session Memory Hook
 *
 * Maintains session-based conversation memory for each user/chat.
 */

import type {
  HookInstance,
  HookConfig,
  MessageHookContext,
  HookResult,
  SessionMemoryConfig,
} from "./types";

/**
 * Message entry in session memory
 */
interface MessageEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

/**
 * Session data structure
 */
interface SessionData {
  chatId: string;
  userId: string;
  messages: MessageEntry[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Error thrown when session-memory hook configuration is invalid
 */
export class SessionMemoryConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionMemoryConfigError";
  }
}

/**
 * Create a session-memory hook instance
 */
export function createSessionMemoryHook(config: HookConfig): HookInstance {
  let sessionConfig: SessionMemoryConfig;
  const sessions = new Map<string, SessionData>();
  let cleanupInterval: ReturnType<typeof setInterval> | null = null;
  // Create a local copy of config to avoid mutating the input
  let localConfig = { ...config.config };

  const validateConfig = (): void => {
    if (
      localConfig.maxMessages &&
      typeof localConfig.maxMessages !== "number"
    ) {
      throw new SessionMemoryConfigError("maxMessages must be a number");
    }
    if (localConfig.ttl && typeof localConfig.ttl !== "number") {
      throw new SessionMemoryConfigError("ttl must be a number");
    }
  };

  const parseConfig = (): SessionMemoryConfig => {
    return {
      maxMessages: (localConfig.maxMessages as number) ?? 50,
      ttl: (localConfig.ttl as number) ?? 3600, // 1 hour default
      persist: (localConfig.persist as boolean) ?? false,
      keyPrefix: (localConfig.keyPrefix as string) ?? "session",
    };
  };

  const getSessionKey = (chatId: string, userId: string): string => {
    return `${sessionConfig.keyPrefix}:${chatId}:${userId}`;
  };

  const getOrCreateSession = (chatId: string, userId: string): SessionData => {
    const key = getSessionKey(chatId, userId);
    let session = sessions.get(key);

    if (!session) {
      session = {
        chatId,
        userId,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      sessions.set(key, session);
    }

    return session;
  };

  const pruneOldMessages = (session: SessionData): void => {
    const maxMsgs = sessionConfig.maxMessages ?? 50;
    if (session.messages.length > maxMsgs) {
      const excess = session.messages.length - maxMsgs;
      session.messages = session.messages.slice(excess);
    }
  };

  const cleanupExpiredSessions = (): void => {
    const now = Date.now();
    const ttlMs = (sessionConfig.ttl ?? 3600) * 1000;

    for (const [key, session] of sessions) {
      const age = now - session.updatedAt.getTime();
      if (age > ttlMs) {
        sessions.delete(key);
      }
    }
  };

  return {
    name: "session-memory",
    description: "Maintains session-based conversation memory",

    async init(configData: Record<string, unknown>): Promise<void> {
      localConfig = { ...localConfig, ...configData };
      validateConfig();
      sessionConfig = parseConfig();

      // Start cleanup interval (every 5 minutes)
      cleanupInterval = setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
      // Prevent the interval from keeping the process alive
      cleanupInterval.unref?.();

      console.log(
        `session-memory: Initialized with maxMessages=${sessionConfig.maxMessages}, ttl=${sessionConfig.ttl}s`,
      );
    },

    async onMessageReceive(context: MessageHookContext): Promise<HookResult> {
      const session = getOrCreateSession(
        context.message.chatId,
        context.message.userId,
      );

      // Add user message to session
      if (context.message.text) {
        session.messages.push({
          role: "user",
          content: context.message.text,
          timestamp: new Date(),
        });
        session.updatedAt = new Date();
        pruneOldMessages(session);
      }

      // Return session through result data instead of mutating context
      return { continue: true, data: { session } };
    },

    async onMessageSend(context: MessageHookContext): Promise<HookResult> {
      const session = getOrCreateSession(
        context.message.chatId,
        context.message.userId,
      );

      // Add assistant response to session
      if (context.response?.text) {
        session.messages.push({
          role: "assistant",
          content: context.response.text,
          timestamp: new Date(),
        });
        session.updatedAt = new Date();
        pruneOldMessages(session);
      }

      return { continue: true };
    },

    async destroy(): Promise<void> {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
      }
      sessions.clear();
      console.log("session-memory: Cleaned up all sessions");
    },
  };
}

/**
 * Get conversation history from session
 */
export function getSessionHistory(
  session: SessionData,
): Array<{ role: "user" | "assistant"; content: string }> {
  return session.messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Get session statistics
 */
export function getSessionStats(session: SessionData): {
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    messageCount: session.messages.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Default session-memory hook (unconfigured)
 */
export const sessionMemoryHook: HookInstance = {
  name: "session-memory",
  description: "Maintains session-based conversation memory",

  async onMessageReceive(context: MessageHookContext): Promise<HookResult> {
    // Default: just pass through without session tracking
    console.log(
      `session-memory: Message from ${context.message.userId} in ${context.message.chatId}`,
    );
    return { continue: true };
  },
};
