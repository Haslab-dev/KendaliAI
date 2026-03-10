/**
 * KendaliAI Channel Types
 *
 * Type definitions for messaging channel integration.
 */

import type { GatewayConfig } from "../gateway/types";

/**
 * Supported channel types
 */
export type ChannelType = "telegram" | "discord" | "whatsapp";

/**
 * Channel status
 */
export type ChannelStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "connecting";

/**
 * Message types
 */
export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "contact";

/**
 * Incoming message from a channel
 */
export interface IncomingMessage {
  /** Unique message ID from the channel */
  id: string;
  /** Channel-specific chat/conversation ID */
  chatId: string;
  /** Sender's user ID */
  userId: string;
  /** Sender's display name or username */
  username?: string;
  /** Message type */
  type: MessageType;
  /** Text content (for text messages) */
  text?: string;
  /** Media URL (for image, audio, video, document) */
  mediaUrl?: string;
  /** Raw message data from the channel */
  raw: unknown;
  /** Timestamp */
  timestamp: Date;
  /** Gateway ID that received this message */
  gatewayId: string;
}

/**
 * Outgoing message to a channel
 */
export interface OutgoingMessage {
  /** Channel-specific chat/conversation ID */
  chatId: string;
  /** Text content */
  text: string;
  /** Optional reply-to message ID */
  replyTo?: string;
  /** Optional parse mode (Markdown, HTML) */
  parseMode?: "Markdown" | "HTML" | "none";
  /** Optional media attachment */
  media?: {
    type: "image" | "audio" | "video" | "document";
    url?: string;
    file?: Buffer;
    filename?: string;
  };
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  /** Channel type */
  type: ChannelType;
  /** Bot token for authentication */
  botToken: string;
  /** Whether the channel is enabled */
  enabled?: boolean;
  /** Optional webhook URL */
  webhookUrl?: string;
}

/**
 * Channel instance interface
 */
export interface ChannelInstance {
  /** Channel name */
  readonly name: string;
  /** Channel type */
  readonly type: ChannelType;
  /** Current status */
  readonly status: ChannelStatus;

  /**
   * Start the channel connection
   */
  start(): Promise<void>;

  /**
   * Stop the channel connection
   */
  stop(): Promise<void>;

  /**
   * Send a message through this channel
   */
  sendMessage(message: OutgoingMessage): Promise<{ messageId: string }>;

  /**
   * Set callback for incoming messages
   */
  onMessage(callback: (message: IncomingMessage) => void | Promise<void>): void;

  /**
   * Set callback for error events
   */
  onError(callback: (error: Error) => void | Promise<void>): void;

  /**
   * Check if the channel is properly configured
   */
  isConfigured(): boolean;

  /**
   * Get channel-specific bot info
   */
  getBotInfo(): Promise<{
    id: string;
    username: string;
    name: string;
  }>;
}

/**
 * Message callback function type (for channel onMessage)
 */
export type MessageCallback = (
  message: IncomingMessage,
) => void | Promise<void>;

/**
 * Message handler function type (for processing with gateway context)
 */
export type MessageHandler = (
  message: IncomingMessage,
  channel: ChannelInstance,
  gateway: GatewayConfig,
) => Promise<OutgoingMessage | null>;

/**
 * Channel factory function type
 */
export type ChannelFactory = (config: ChannelConfig) => ChannelInstance;
