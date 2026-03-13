/**
 * KendaliAI Webhook Channel
 *
 * Implementation for generic webhook channel.
 * Allows receiving messages via HTTP webhooks from any source.
 */

import { BaseChannel } from "./base";
import type {
  ChannelConfig,
  ChannelMessage,
  SendMessageOptions,
  EditMessageOptions,
  DeleteMessageOptions,
  ChatInfo,
  UserInfo,
  MessageAttachment,
} from "./types";

// ============================================
// Webhook Channel Implementation
// ============================================

export class WebhookChannel extends BaseChannel {
  readonly type = "webhook" as const;

  private outboundWebhookUrl?: string;
  private secretKey?: string;
  private pendingMessages: Map<string, ChannelMessage> = new Map();

  constructor(config: ChannelConfig) {
    super(config);
    this.outboundWebhookUrl = config.webhookUrl;
    this.secretKey = config.apiKey;
  }

  protected async doInitialize(): Promise<void> {
    console.log(`[Webhook] Initialized channel: ${this.name}`);
    if (this.outboundWebhookUrl) {
      console.log(`[Webhook] Outbound URL configured`);
    }
  }

  protected async doConnect(): Promise<void> {
    // Webhook channel doesn't need to connect
    // It receives messages via HTTP endpoint
    console.log(`[Webhook] Ready to receive webhooks`);
  }

  protected async doDisconnect(): Promise<void> {
    this.pendingMessages.clear();
    console.log(`[Webhook] Disconnected`);
  }

  protected async doSendMessage(
    text: string,
    options?: SendMessageOptions,
  ): Promise<ChannelMessage> {
    if (!this.outboundWebhookUrl) {
      throw new Error("No outbound webhook URL configured");
    }

    const chatId = options?.chatId || this.config.defaultChatId || "default";
    const messageId = this.generateMessageId();

    const message: ChannelMessage = {
      id: messageId,
      channelType: "webhook",
      chatId,
      userId: this.config.botId || "webhook-bot",
      text,
      timestamp: new Date(),
      replyTo: options?.replyTo,
      attachments: options?.attachments,
    };

    // Send to webhook
    const payload = {
      message: {
        id: message.id,
        chatId: message.chatId,
        text: message.text,
        timestamp: message.timestamp.toISOString(),
        replyTo: message.replyTo,
        attachments: message.attachments,
      },
      channel: this.name,
      keyboard: options?.keyboard,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.secretKey) {
      headers["X-Webhook-Secret"] = this.secretKey;
    }

    const response = await fetch(this.outboundWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook send failed: ${response.status} ${response.statusText}`,
      );
    }

    this.pendingMessages.set(messageId, message);
    return message;
  }

  protected async doEditMessage(
    messageId: string,
    options: EditMessageOptions,
  ): Promise<ChannelMessage> {
    if (!this.outboundWebhookUrl) {
      throw new Error("No outbound webhook URL configured");
    }

    const existingMessage = this.pendingMessages.get(messageId);
    if (!existingMessage) {
      throw new Error(`Message ${messageId} not found`);
    }

    const updatedMessage: ChannelMessage = {
      ...existingMessage,
      text: options.text,
    };

    const payload = {
      action: "edit",
      messageId,
      message: {
        text: options.text,
      },
      channel: this.name,
      keyboard: options.keyboard,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.secretKey) {
      headers["X-Webhook-Secret"] = this.secretKey;
    }

    await fetch(this.outboundWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    this.pendingMessages.set(messageId, updatedMessage);
    return updatedMessage;
  }

  protected async doDeleteMessage(
    messageId: string,
    options?: DeleteMessageOptions,
  ): Promise<boolean> {
    if (!this.outboundWebhookUrl) {
      // If no outbound URL, just remove from pending
      return this.pendingMessages.delete(messageId);
    }

    const payload = {
      action: "delete",
      messageId,
      channel: this.name,
      revoke: options?.revoke,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.secretKey) {
      headers["X-Webhook-Secret"] = this.secretKey;
    }

    try {
      await fetch(this.outboundWebhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      this.pendingMessages.delete(messageId);
      return true;
    } catch {
      return false;
    }
  }

  async getChatInfo(chatId: string): Promise<ChatInfo> {
    // Webhook channels don't have chat info
    return {
      id: chatId,
      type: "group",
    };
  }

  async getUserInfo(userId: string): Promise<UserInfo> {
    // Webhook channels don't have user info
    return {
      id: userId,
    };
  }

  async setTyping(chatId: string): Promise<void> {
    // Webhook channels don't support typing indicators
  }

  // ============================================
  // Webhook-Specific Methods
  // ============================================

  /**
   * Handle an incoming webhook message
   * Call this from your HTTP endpoint
   */
  async handleIncomingWebhook(payload: WebhookPayload): Promise<void> {
    // Validate secret if configured
    if (this.secretKey && payload.secret !== this.secretKey) {
      throw new Error("Invalid webhook secret");
    }

    const message: ChannelMessage = {
      id: payload.messageId || this.generateMessageId(),
      channelType: "webhook",
      chatId: payload.chatId || "default",
      userId: payload.userId || "unknown",
      username: payload.username,
      displayName: payload.displayName,
      text: payload.text,
      timestamp: new Date(payload.timestamp || Date.now()),
      replyTo: payload.replyTo,
      attachments: payload.attachments,
      raw: payload,
      metadata: payload.metadata,
    };

    await this.handleMessage(message);
  }

  /**
   * Handle a raw HTTP request
   */
  async handleHttpRequest(request: {
    headers: Record<string, string>;
    body: string;
  }): Promise<void> {
    // Validate secret from header
    if (this.secretKey) {
      const headerSecret =
        request.headers["x-webhook-secret"] ||
        request.headers["X-Webhook-Secret"];
      if (headerSecret !== this.secretKey) {
        throw new Error("Invalid webhook secret");
      }
    }

    // Parse body
    const payload = JSON.parse(request.body) as WebhookPayload;
    await this.handleIncomingWebhook(payload);
  }

  /**
   * Set the outbound webhook URL
   */
  setOutboundUrl(url: string): void {
    this.outboundWebhookUrl = url;
  }

  /**
   * Get the webhook endpoint path for this channel
   */
  getWebhookPath(): string {
    return `/webhook/${this.name}`;
  }
}

// ============================================
// Webhook Payload Types
// ============================================

export interface WebhookPayload {
  /** Message ID (optional, will be generated if not provided) */
  messageId?: string;
  /** Chat/Channel ID */
  chatId?: string;
  /** User ID */
  userId?: string;
  /** Username */
  username?: string;
  /** Display name */
  displayName?: string;
  /** Message text */
  text: string;
  /** Timestamp (ISO string or Unix timestamp) */
  timestamp?: string | number;
  /** Reply to message ID */
  replyTo?: string;
  /** Attachments */
  attachments?: MessageAttachment[];
  /** Secret key for validation */
  secret?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================
// Factory Function
// ============================================

export function createWebhookChannel(config: ChannelConfig): WebhookChannel {
  return new WebhookChannel(config);
}
