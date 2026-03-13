/**
 * KendaliAI Telegram Channel - Powered by grammY
 *
 * Implementation for Telegram Bot API using grammY library.
 */

import { Bot, Context } from "grammy";
import type { InlineKeyboardMarkup, InlineKeyboardButton } from "grammy/types";
import { BaseChannel } from "./base";
import type {
  ChannelConfig,
  ChannelMessage,
  SendMessageOptions,
  EditMessageOptions,
  DeleteMessageOptions,
  ChatInfo,
  UserInfo,
  CallbackQuery as KaiCallbackQuery,
  MessageAttachment,
} from "./types";

export class TelegramChannel extends BaseChannel {
  readonly type = "telegram" as const;

  private bot: Bot;
  private isStarted = false;

  constructor(config: ChannelConfig) {
    super(config);
    const token = config.token || "";

    if (!token) {
      throw new Error("Telegram channel requires bot token");
    }

    this.bot = new Bot(token);
    this.setupHandlers();
  }

  private setupHandlers() {
    // Handle messages
    this.bot.on("message", async (ctx) => {
      const message = this.convertMessage(ctx);
      if (message) {
        await this.handleMessage(message);
      }
    });

    // Handle callback queries
    this.bot.on("callback_query:data", async (ctx) => {
      const query: KaiCallbackQuery = {
        id: ctx.callbackQuery.id,
        message: ctx.callbackQuery.message
          ? this.convertGrammyMessage(ctx.callbackQuery.message)
          : undefined,
        data: ctx.callbackQuery.data,
        userId: ctx.from.id.toString(),
        username: ctx.from.username,
        chatId: ctx.chat?.id.toString() || "",
      };
      await this.handleCallback(query);
    });

    // Handle errors
    this.bot.catch((err) => {
      console.error(`[Telegram] grammY error:`, err);
    });
  }

  protected async doInitialize(): Promise<void> {
    const me = await this.bot.api.getMe();
    this.config.botId = me.id.toString();
    console.log(
      `[Telegram] Initialized bot: @${me.username} (${me.first_name})`,
    );
  }

  protected async doConnect(): Promise<void> {
    if (this.isStarted) return;

    // Start bot in background
    this.bot.start({
      onStart: (botInfo) => {
        console.log(`[Telegram] Bot @${botInfo.username} started`);
      },
      allowed_updates: ["message", "callback_query", "edited_message"],
    });

    this.isStarted = true;
  }

  protected async doDisconnect(): Promise<void> {
    if (!this.isStarted) return;
    await this.bot.stop();
    this.isStarted = false;
    console.log(`[Telegram] Bot stopped`);
  }

  protected async doSendMessage(
    text: string,
    options?: SendMessageOptions,
  ): Promise<ChannelMessage> {
    const chatId = options?.chatId || this.config.defaultChatId;
    if (!chatId) throw new Error("No chat ID provided");

    const replyMarkup: InlineKeyboardMarkup | undefined = options?.keyboard
      ? {
          inline_keyboard: options.keyboard.buttons.map((row) =>
            row.map((btn) => {
              const button: any = { text: btn.text };
              if (btn.callbackData) button.callback_data = btn.callbackData;
              if (btn.url) button.url = btn.url;
              return button as InlineKeyboardButton;
            }),
          ),
        }
      : undefined;

    const result = await this.bot.api.sendMessage(chatId, text, {
      parse_mode: this.getParseMode(options?.parseMode),
      reply_to_message_id: options?.replyTo
        ? parseInt(options.replyTo)
        : undefined,
      disable_notification: options?.silent,
      reply_markup: replyMarkup,
    });

    return this.convertGrammyMessage(result);
  }

  protected async doEditMessage(
    messageId: string,
    options: EditMessageOptions,
  ): Promise<ChannelMessage> {
    const chatId = this.config.defaultChatId;
    if (!chatId) throw new Error("No chat ID provided");

    const replyMarkup: InlineKeyboardMarkup | undefined = options.keyboard
      ? {
          inline_keyboard: options.keyboard.buttons.map((row) =>
            row.map((btn) => {
              const button: any = { text: btn.text };
              if (btn.callbackData) button.callback_data = btn.callbackData;
              if (btn.url) button.url = btn.url;
              return button as InlineKeyboardButton;
            }),
          ),
        }
      : undefined;

    const result = await this.bot.api.editMessageText(
      chatId,
      parseInt(messageId),
      options.text,
      {
        parse_mode: this.getParseMode(options.parseMode),
        reply_markup: replyMarkup,
      },
    );

    if (typeof result === "boolean") {
      throw new Error("Edit message returned boolean instead of message");
    }

    return this.convertGrammyMessage(result);
  }

  protected async doDeleteMessage(
    messageId: string,
    options?: DeleteMessageOptions,
  ): Promise<boolean> {
    const chatId = this.config.defaultChatId;
    if (!chatId) return false;

    try {
      await this.bot.api.deleteMessage(chatId, parseInt(messageId));
      return true;
    } catch {
      return false;
    }
  }

  async getChatInfo(chatId: string): Promise<ChatInfo> {
    const chat = await this.bot.api.getChat(chatId);
    return {
      id: chat.id.toString(),
      type: (chat as any).type,
      title: (chat as any).title,
      username: (chat as any).username,
    };
  }

  async getUserInfo(userId: string): Promise<UserInfo> {
    const chat = await this.bot.api.getChat(userId);
    return {
      id: chat.id.toString(),
      username: (chat as any).username,
      firstName: (chat as any).first_name,
      lastName: (chat as any).last_name,
    };
  }

  async setTyping(chatId: string): Promise<void> {
    await this.bot.api.sendChatAction(chatId, "typing");
  }

  async setCommands(
    commands: Array<{ command: string; description: string }>,
  ): Promise<void> {
    await this.bot.api.setMyCommands(commands);
  }

  private convertMessage(ctx: Context): ChannelMessage | null {
    if (!ctx.message) return null;
    return this.convertGrammyMessage(ctx.message);
  }

  private convertGrammyMessage(msg: any): ChannelMessage {
    const attachments: MessageAttachment[] = [];

    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      attachments.push({
        type: "image",
        url: photo.file_id,
        size: photo.file_size,
      });
    }

    if (msg.video) {
      attachments.push({
        type: "video",
        url: msg.video.file_id,
        size: msg.video.file_size,
      });
    }

    return {
      id: msg.message_id.toString(),
      channelType: "telegram",
      chatId: msg.chat.id.toString(),
      userId: msg.from?.id.toString() || "unknown",
      username: msg.from?.username,
      displayName: [msg.from?.first_name, msg.from?.last_name]
        .filter(Boolean)
        .join(" "),
      text: msg.text || msg.caption || "",
      timestamp: new Date(msg.date * 1000),
      replyTo: msg.reply_to_message?.message_id.toString(),
      attachments: attachments.length > 0 ? attachments : undefined,
      raw: msg,
    };
  }

  private getParseMode(
    mode?: "text" | "markdown" | "html",
  ): "Markdown" | "HTML" | undefined {
    switch (mode) {
      case "markdown":
        return "Markdown";
      case "html":
        return "HTML";
      default:
        return undefined;
    }
  }
}

export function createTelegramChannel(config: ChannelConfig): TelegramChannel {
  return new TelegramChannel(config);
}
