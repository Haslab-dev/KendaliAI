/**
 * KendaliAI Base Channel
 *
 * Base class for messaging channel implementations.
 * Provides common functionality for all channels.
 */

import type {
  Channel,
  ChannelConfig,
  ChannelStatus,
  ChannelType,
  ChannelMessage,
  ChannelEvent,
  ChannelEventHandler,
  SendMessageOptions,
  EditMessageOptions,
  DeleteMessageOptions,
  ChatInfo,
  UserInfo,
  CommandContext,
  CallbackQuery,
} from "./types";

// ============================================
// Base Channel Implementation
// ============================================

export abstract class BaseChannel implements Channel {
  abstract readonly type: ChannelType;

  readonly name: string;
  readonly config: ChannelConfig;

  protected _status: ChannelStatus = "disconnected";
  protected messageHandlers: Array<(message: ChannelMessage) => Promise<void>> =
    [];
  protected callbackHandlers: Array<(query: CallbackQuery) => Promise<void>> =
    [];
  protected commandHandlers: Map<
    string,
    (ctx: CommandContext) => Promise<void>
  > = new Map();
  protected eventHandlers: ChannelEventHandler[] = [];
  protected initialized = false;

  constructor(config: ChannelConfig) {
    this.name = config.name;
    this.config = config;
  }

  get status(): ChannelStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.doInitialize();
    this.initialized = true;
  }

  async connect(): Promise<void> {
    if (this._status === "connected") return;

    this._status = "connecting";
    this.emitEvent({
      type: "connected",
      channel: this.name,
      channelType: this.type,
      timestamp: new Date(),
    });

    try {
      await this.doConnect();
      this._status = "connected";
    } catch (error) {
      this._status = "error";
      this.emitEvent({
        type: "error",
        channel: this.name,
        channelType: this.type,
        timestamp: new Date(),
        data: error,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this._status === "disconnected") return;

    await this.doDisconnect();
    this._status = "disconnected";

    this.emitEvent({
      type: "disconnected",
      channel: this.name,
      channelType: this.type,
      timestamp: new Date(),
    });
  }

  async healthCheck(): Promise<boolean> {
    return this._status === "connected";
  }

  async sendMessage(
    text: string,
    options?: SendMessageOptions,
  ): Promise<ChannelMessage> {
    const chatId = options?.chatId || this.config.defaultChatId;
    if (!chatId) {
      throw new Error("No chat ID provided and no default chat ID configured");
    }

    const message = await this.doSendMessage(text, options);

    this.emitEvent({
      type: "message_sent",
      channel: this.name,
      channelType: this.type,
      timestamp: new Date(),
      data: message,
    });

    return message;
  }

  async editMessage(
    messageId: string,
    options: EditMessageOptions,
  ): Promise<ChannelMessage> {
    const message = await this.doEditMessage(messageId, options);

    this.emitEvent({
      type: "message_edited",
      channel: this.name,
      channelType: this.type,
      timestamp: new Date(),
      data: message,
    });

    return message;
  }

  async deleteMessage(
    messageId: string,
    options?: DeleteMessageOptions,
  ): Promise<boolean> {
    const result = await this.doDeleteMessage(messageId, options);

    this.emitEvent({
      type: "message_deleted",
      channel: this.name,
      channelType: this.type,
      timestamp: new Date(),
      data: { messageId, result },
    });

    return result;
  }

  abstract getChatInfo(chatId: string): Promise<ChatInfo>;
  abstract getUserInfo(userId: string): Promise<UserInfo>;
  abstract setTyping(chatId: string): Promise<void>;
  async setCommands(
    commands: Array<{ command: string; description: string }>,
  ): Promise<void> {
    // Default implementation does nothing
  }

  onCommand(
    command: string,
    handler: (ctx: CommandContext) => Promise<void>,
  ): void {
    this.commandHandlers.set(command, handler);
  }

  onMessage(handler: (message: ChannelMessage) => Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  onCallback(handler: (query: CallbackQuery) => Promise<void>): void {
    this.callbackHandlers.push(handler);
  }

  async dispose(): Promise<void> {
    await this.disconnect();
    this.messageHandlers = [];
    this.callbackHandlers = [];
    this.commandHandlers.clear();
    this.eventHandlers = [];
    this.initialized = false;
  }

  // ============================================
  // Event Handling
  // ============================================

  addEventHandler(handler: ChannelEventHandler): void {
    this.eventHandlers.push(handler);
  }

  removeEventHandler(handler: ChannelEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  protected emitEvent(event: ChannelEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`[${this.name}] Error in event handler:`, error);
      }
    }
  }

  // ============================================
  // Protected Methods for Subclasses
  // ============================================

  protected abstract doInitialize(): Promise<void>;
  protected abstract doConnect(): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
  protected abstract doSendMessage(
    text: string,
    options?: SendMessageOptions,
  ): Promise<ChannelMessage>;
  protected abstract doEditMessage(
    messageId: string,
    options: EditMessageOptions,
  ): Promise<ChannelMessage>;
  protected abstract doDeleteMessage(
    messageId: string,
    options?: DeleteMessageOptions,
  ): Promise<boolean>;

  /**
   * Handle an incoming message - calls all registered handlers
   */
  protected async handleMessage(message: ChannelMessage): Promise<void> {
    this.emitEvent({
      type: "message_received",
      channel: this.name,
      channelType: this.type,
      timestamp: new Date(),
      data: message,
    });

    // Check for command
    if (message.text.startsWith("/")) {
      const parts = message.text.slice(1).split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      const handler = this.commandHandlers.get(command);
      if (handler) {
        try {
          await handler({
            command,
            args,
            message,
            channel: this,
          });

          this.emitEvent({
            type: "command",
            channel: this.name,
            channelType: this.type,
            timestamp: new Date(),
            data: { command, args, message },
          });

          return; // Don't process as regular message if handled as command
        } catch (error) {
          console.error(
            `[${this.name}] Error handling command ${command}:`,
            error,
          );
        }
      }
    }

    // Call message handlers
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        console.error(`[${this.name}] Error in message handler:`, error);
      }
    }
  }

  /**
   * Handle a callback query
   */
  protected async handleCallback(query: CallbackQuery): Promise<void> {
    for (const handler of this.callbackHandlers) {
      try {
        await handler(query);
      } catch (error) {
        console.error(`[${this.name}] Error in callback handler:`, error);
      }
    }
  }

  /**
   * Generate a unique message ID
   */
  protected generateMessageId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
