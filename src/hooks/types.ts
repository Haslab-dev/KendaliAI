/**
 * KendaliAI Hook Types
 *
 * Type definitions for the hooks system.
 */

import type { GatewayConfig } from "../gateway/types";
import type {
  ChannelInstance,
  IncomingMessage,
  OutgoingMessage,
} from "../channels/types";

/**
 * Available hook names
 */
export type HookName = "boot-md" | "command-logger" | "session-memory";

/**
 * Hook lifecycle events
 */
export type HookEvent =
  | "onGatewayStart" // Called when gateway starts
  | "onGatewayStop" // Called when gateway stops
  | "onMessageReceive" // Called when a message is received
  | "onMessageSend" // Called before a message is sent
  | "onError"; // Called when an error occurs

/**
 * Hook context passed to hook handlers
 */
export interface HookContext {
  /** Gateway configuration */
  gateway: GatewayConfig;
  /** Channel instance (if available) */
  channel?: ChannelInstance;
  /** Current timestamp */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Context for message-related hooks
 */
export interface MessageHookContext extends HookContext {
  /** The incoming message */
  message: IncomingMessage;
  /** The response (if available, for onMessageSend) */
  response?: OutgoingMessage;
}

/**
 * Context for error hooks
 */
export interface ErrorHookContext extends HookContext {
  /** The error that occurred */
  error: Error;
}

/**
 * Hook configuration
 */
export interface HookConfig {
  /** Hook name */
  name: HookName;
  /** Whether the hook is enabled */
  enabled: boolean;
  /** Hook-specific configuration */
  config: Record<string, unknown>;
}

/**
 * Result from a hook handler
 */
export interface HookResult {
  /** Whether to continue processing */
  continue: boolean;
  /** Modified data (if applicable) */
  data?: unknown;
  /** Error message (if hook failed) */
  error?: string;
}

/**
 * Hook instance interface
 */
export interface HookInstance {
  /** Hook name */
  readonly name: HookName;
  /** Hook description */
  readonly description?: string;
  /** Whether the hook is enabled */
  readonly enabled?: boolean;

  /**
   * Initialize the hook with configuration
   */
  init?(config: Record<string, unknown>): Promise<void> | void;

  /**
   * Called when gateway starts
   */
  onGatewayStart?(context: HookContext): Promise<HookResult> | HookResult;

  /**
   * Called when gateway stops
   */
  onGatewayStop?(context: HookContext): Promise<HookResult> | HookResult;

  /**
   * Called when a message is received
   */
  onMessageReceive?(
    context: MessageHookContext,
  ): Promise<HookResult> | HookResult;

  /**
   * Called before a message is sent
   */
  onMessageSend?(context: MessageHookContext): Promise<HookResult> | HookResult;

  /**
   * Called when an error occurs
   */
  onError?(context: ErrorHookContext): Promise<HookResult> | HookResult;

  /**
   * Cleanup hook resources
   */
  destroy?(): Promise<void> | void;
}

/**
 * Hook factory function type
 */
export type HookFactory = (config: HookConfig) => HookInstance;

/**
 * Boot-md hook configuration
 */
export interface BootMdConfig {
  /** Chat ID to send boot message to */
  chatId: string;
  /** Custom boot message (markdown supported) */
  message?: string;
  /** Whether to send on restart */
  sendOnRestart?: boolean;
}

/**
 * Command-logger hook configuration
 */
export interface CommandLoggerConfig {
  /** Log file path */
  logFile?: string;
  /** Whether to include timestamps */
  includeTimestamp?: boolean;
  /** Whether to log to console */
  logToConsole?: boolean;
  /** Maximum log file size in bytes */
  maxFileSize?: number;
}

/**
 * Session-memory hook configuration
 */
export interface SessionMemoryConfig {
  /** Maximum messages per session */
  maxMessages?: number;
  /** Session TTL in seconds */
  ttl?: number;
  /** Whether to persist sessions */
  persist?: boolean;
  /** Storage key prefix */
  keyPrefix?: string;
}
