/**
 * KendaliAI Telegram Channel
 *
 * Telegram channel implementation using grammy.
 */

import { Bot, Context, GrammyError } from "grammy";
import type {
  ChannelInstance,
  ChannelConfig,
  ChannelStatus,
  IncomingMessage,
  OutgoingMessage,
  MessageCallback,
} from "./types";

/**
 * Error thrown when Telegram channel configuration is invalid
 */
export class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramConfigError";
  }
}

/**
 * Error thrown when Telegram API operation fails
 */
export class TelegramOperationError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "TelegramOperationError";
  }
}

/**
 * Telegram channel configuration
 */
export interface TelegramConfig extends ChannelConfig {
  type: "telegram";
  botToken: string;
}

/**
 * Create a Telegram channel instance
 */
export function createTelegramChannel(config: TelegramConfig): ChannelInstance {
  let bot: Bot | null = null;
  let status: ChannelStatus = "disconnected";
  let messageCallback: MessageCallback | null = null;
  let errorCallback: ((error: Error) => void | Promise<void>) | null = null;

  const validateConfig = (): void => {
    if (!config.botToken) {
      throw new TelegramConfigError("Telegram bot token is required");
    }
    if (!config.botToken.includes(":")) {
      throw new TelegramConfigError(
        "Invalid Telegram bot token format. Expected format: 123456789:ABC...",
      );
    }
  };

  const handleUpdate = async (ctx: Context): Promise<void> => {
    if (!ctx.message || !ctx.from) {
      return;
    }

    const msg = ctx.message;

    // Determine message type
    let type: IncomingMessage["type"] = "text";
    let text: string | undefined;
    let mediaUrl: string | undefined;

    if (msg.text) {
      type = "text";
      text = msg.text;
    } else if (msg.photo) {
      type = "image";
      // Get the largest photo
      const photo = msg.photo[msg.photo.length - 1];
      mediaUrl = photo?.file_id;
      text = msg.caption;
    } else if (msg.audio) {
      type = "audio";
      mediaUrl = msg.audio.file_id;
      text = msg.caption;
    } else if (msg.video) {
      type = "video";
      mediaUrl = msg.video.file_id;
      text = msg.caption;
    } else if (msg.document) {
      type = "document";
      mediaUrl = msg.document.file_id;
      text = msg.caption;
    } else if (msg.location) {
      type = "location";
    } else if (msg.contact) {
      type = "contact";
    }

    const incomingMessage: IncomingMessage = {
      id: msg.message_id.toString(),
      chatId: msg.chat.id.toString(),
      userId: ctx.from.id.toString(),
      username: ctx.from.username || ctx.from.first_name,
      type,
      text,
      mediaUrl,
      raw: msg,
      timestamp: new Date(msg.date * 1000),
      gatewayId: config.botToken.split(":")[0] || "unknown",
    };

    if (messageCallback) {
      try {
        await messageCallback(incomingMessage);
      } catch (error) {
        console.error("Error in message callback:", error);
        if (errorCallback) {
          await errorCallback(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    }
  };

  return {
    name: "telegram",
    type: "telegram",
    get status() {
      return status;
    },

    async start(): Promise<void> {
      validateConfig();

      if (bot) {
        await this.stop();
      }

      try {
        status = "connecting";
        bot = new Bot(config.botToken);

        // Register message handler
        bot.on("message", handleUpdate);

        // Handle errors
        bot.catch(async (error) => {
          console.error("Telegram bot error:", error);
          status = "error";
          if (errorCallback) {
            await errorCallback(
              error instanceof Error
                ? error
                : new TelegramOperationError("Telegram bot error", error),
            );
          }
        });

        // Start polling for updates
        await bot.start({
          onStart: () => {
            status = "connected";
            console.log("Telegram bot started successfully");
          },
        });
      } catch (error) {
        status = "error";
        throw new TelegramOperationError(
          `Failed to start Telegram bot: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },

    async stop(): Promise<void> {
      if (bot) {
        try {
          await bot.stop();
          bot = null;
          status = "disconnected";
          console.log("Telegram bot stopped");
        } catch (error) {
          throw new TelegramOperationError(
            `Failed to stop Telegram bot: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined,
          );
        }
      }
    },

    async sendMessage(
      message: OutgoingMessage,
    ): Promise<{ messageId: string }> {
      if (!bot) {
        throw new TelegramOperationError("Telegram bot is not started");
      }

      try {
        const chatId = parseInt(message.chatId, 10);
        if (isNaN(chatId)) {
          throw new TelegramOperationError(
            `Invalid chat ID: ${message.chatId}`,
          );
        }

        // Handle media messages
        if (message.media) {
          let result;
          const parseMode =
            message.parseMode === "none" ? undefined : message.parseMode;

          switch (message.media.type) {
            case "image":
              if (message.media.url) {
                result = await bot.api.sendPhoto(chatId, message.media.url, {
                  caption: message.text,
                  parse_mode: parseMode,
                  reply_to_message_id: message.replyTo
                    ? parseInt(message.replyTo, 10)
                    : undefined,
                });
              }
              break;
            case "audio":
              if (message.media.url) {
                result = await bot.api.sendAudio(chatId, message.media.url, {
                  caption: message.text,
                  parse_mode: parseMode,
                  reply_to_message_id: message.replyTo
                    ? parseInt(message.replyTo, 10)
                    : undefined,
                });
              }
              break;
            case "video":
              if (message.media.url) {
                result = await bot.api.sendVideo(chatId, message.media.url, {
                  caption: message.text,
                  parse_mode: parseMode,
                  reply_to_message_id: message.replyTo
                    ? parseInt(message.replyTo, 10)
                    : undefined,
                });
              }
              break;
            case "document":
              if (message.media.url) {
                result = await bot.api.sendDocument(chatId, message.media.url, {
                  caption: message.text,
                  parse_mode: parseMode,
                  reply_to_message_id: message.replyTo
                    ? parseInt(message.replyTo, 10)
                    : undefined,
                });
              }
              break;
          }

          if (result) {
            return { messageId: result.message_id.toString() };
          }
        }

        // Send text message
        const parseMode =
          message.parseMode === "none" ? undefined : message.parseMode;
        const result = await bot.api.sendMessage(chatId, message.text, {
          parse_mode: parseMode,
          reply_to_message_id: message.replyTo
            ? parseInt(message.replyTo, 10)
            : undefined,
        });

        return { messageId: result.message_id.toString() };
      } catch (error) {
        if (error instanceof GrammyError) {
          throw new TelegramOperationError(
            `Telegram API error: ${error.description}`,
            error,
          );
        }
        throw new TelegramOperationError(
          `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },

    onMessage(callback: MessageCallback): void {
      messageCallback = callback;
    },

    onError(callback: (error: Error) => void | Promise<void>): void {
      errorCallback = callback;
    },

    isConfigured(): boolean {
      try {
        validateConfig();
        return true;
      } catch {
        return false;
      }
    },

    async getBotInfo(): Promise<{
      id: string;
      username: string;
      name: string;
    }> {
      if (!bot) {
        throw new TelegramOperationError("Telegram bot is not started");
      }

      try {
        const me = await bot.api.getMe();
        return {
          id: me.id.toString(),
          username: me.username || "unknown",
          name: me.first_name,
        };
      } catch (error) {
        throw new TelegramOperationError(
          `Failed to get bot info: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}

/**
 * Default Telegram channel (unconfigured)
 */
export const telegramChannel: ChannelInstance = {
  name: "telegram",
  type: "telegram",
  get status(): ChannelStatus {
    return "disconnected";
  },

  async start(): Promise<void> {
    throw new TelegramConfigError(
      "Telegram channel not configured. Please provide a bot token.",
    );
  },

  async stop(): Promise<void> {
    // No-op for unconfigured channel
  },

  async sendMessage(): Promise<{ messageId: string }> {
    throw new TelegramConfigError(
      "Telegram channel not configured. Please provide a bot token.",
    );
  },

  onMessage(): void {
    // No-op for unconfigured channel
  },

  onError(): void {
    // No-op for unconfigured channel
  },

  isConfigured(): boolean {
    return false;
  },

  async getBotInfo(): Promise<{ id: string; username: string; name: string }> {
    throw new TelegramConfigError(
      "Telegram channel not configured. Please provide a bot token.",
    );
  },
};
