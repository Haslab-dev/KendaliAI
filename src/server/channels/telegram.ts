/**
 * KendaliAI Telegram Channel
 * 
 * Implementation for Telegram Bot API channel.
 * Supports all Telegram bot features including inline keyboards.
 */

import { BaseChannel } from './base';
import type {
  ChannelConfig,
  ChannelMessage,
  SendMessageOptions,
  EditMessageOptions,
  DeleteMessageOptions,
  ChatInfo,
  UserInfo,
  CallbackQuery,
  MessageAttachment,
} from './types';

// ============================================
// Telegram API Types
// ============================================

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }[];
  video?: { file_id: string; file_unique_id: string; width: number; height: number; duration: number; file_size?: number };
  audio?: { file_id: string; file_unique_id: string; duration: number; file_size?: number };
  document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
  sticker?: { file_id: string; file_unique_id: string; width: number; height: number; is_animated?: boolean; is_video?: boolean };
  location?: { latitude: number; longitude: number };
  contact?: { phone_number: string; first_name: string; last_name?: string; user_id?: number };
  reply_to_message?: TelegramMessage;
  entities?: { type: string; offset: number; length: number }[];
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
    chat_instance: string;
  };
}

interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// ============================================
// Telegram Channel Implementation
// ============================================

export class TelegramChannel extends BaseChannel {
  readonly type = 'telegram' as const;
  
  private botToken: string;
  private apiUrl: string;
  private pollingInterval: number = 1000;
  private lastUpdateId: number = 0;
  private pollingTimeout?: ReturnType<typeof setTimeout>;
  private isPolling = false;

  constructor(config: ChannelConfig) {
    super(config);
    this.botToken = config.token || '';
    
    if (!this.botToken) {
      throw new Error('Telegram channel requires bot token');
    }
    
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  protected async doInitialize(): Promise<void> {
    // Get bot info
    const me = await this.apiCall<TelegramUser>('getMe');
    this.config.botId = me.id.toString();
    console.log(`[Telegram] Initialized bot: @${me.username} (${me.first_name})`);
  }

  protected async doConnect(): Promise<void> {
    // Start polling for updates
    this.isPolling = true;
    this.startPolling();
    console.log(`[Telegram] Connected and polling for updates`);
  }

  protected async doDisconnect(): Promise<void> {
    this.isPolling = false;
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = undefined;
    }
    console.log(`[Telegram] Disconnected`);
  }

  protected async doSendMessage(text: string, options?: SendMessageOptions): Promise<ChannelMessage> {
    const chatId = options?.chatId || this.config.defaultChatId;
    
    if (!chatId) {
      throw new Error('No chat ID provided');
    }

    const params: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: this.getParseMode(options?.parseMode),
    };

    if (options?.replyTo) {
      params.reply_to_message_id = options.replyTo;
    }

    if (options?.silent) {
      params.disable_notification = true;
    }

    if (options?.keyboard) {
      params.reply_markup = {
        inline_keyboard: options.keyboard.buttons.map((row) =>
          row.map((btn) => ({
            text: btn.text,
            callback_data: btn.callbackData,
            url: btn.url,
          }))
        ),
      };
    }

    const result = await this.apiCall<TelegramMessage>('sendMessage', params);
    return this.convertMessage(result);
  }

  protected async doEditMessage(messageId: string, options: EditMessageOptions): Promise<ChannelMessage> {
    const chatId = this.config.defaultChatId;
    
    const params: Record<string, unknown> = {
      chat_id: chatId,
      message_id: parseInt(messageId, 10),
      text: options.text,
      parse_mode: this.getParseMode(options.parseMode),
    };

    if (options.keyboard) {
      params.reply_markup = {
        inline_keyboard: options.keyboard.buttons.map((row) =>
          row.map((btn) => ({
            text: btn.text,
            callback_data: btn.callbackData,
            url: btn.url,
          }))
        ),
      };
    }

    const result = await this.apiCall<TelegramMessage>('editMessageText', params);
    return this.convertMessage(result);
  }

  protected async doDeleteMessage(messageId: string, options?: DeleteMessageOptions): Promise<boolean> {
    const chatId = this.config.defaultChatId;
    
    try {
      await this.apiCall<boolean>('deleteMessage', {
        chat_id: chatId,
        message_id: parseInt(messageId, 10),
      });
      return true;
    } catch {
      return false;
    }
  }

  async getChatInfo(chatId: string): Promise<ChatInfo> {
    const chat = await this.apiCall<TelegramChat>('getChat', { chat_id: chatId });
    
    return {
      id: chat.id.toString(),
      type: chat.type,
      title: chat.title,
      username: chat.username,
    };
  }

  async getUserInfo(userId: string): Promise<UserInfo> {
    // Telegram doesn't have a direct getUserInfo API, return basic info
    return {
      id: userId,
    };
  }

  async setTyping(chatId: string): Promise<void> {
    await this.apiCall<boolean>('sendChatAction', {
      chat_id: chatId,
      action: 'typing',
    });
  }

  // ============================================
  // Telegram-Specific Methods
  // ============================================

  /**
   * Send a photo
   */
  async sendPhoto(photo: string, caption?: string, options?: SendMessageOptions): Promise<ChannelMessage> {
    const chatId = options?.chatId || this.config.defaultChatId;
    
    const result = await this.apiCall<TelegramMessage>('sendPhoto', {
      chat_id: chatId,
      photo,
      caption,
      parse_mode: this.getParseMode(options?.parseMode),
    });
    
    return this.convertMessage(result);
  }

  /**
   * Send a document
   */
  async sendDocument(document: string, caption?: string, options?: SendMessageOptions): Promise<ChannelMessage> {
    const chatId = options?.chatId || this.config.defaultChatId;
    
    const result = await this.apiCall<TelegramMessage>('sendDocument', {
      chat_id: chatId,
      document,
      caption,
      parse_mode: this.getParseMode(options?.parseMode),
    });
    
    return this.convertMessage(result);
  }

  /**
   * Answer callback query
   */
  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert?: boolean): Promise<void> {
    await this.apiCall<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  /**
   * Set webhook instead of polling
   */
  async setWebhook(webhookUrl: string): Promise<void> {
    await this.apiCall<boolean>('setWebhook', { url: webhookUrl });
    this.isPolling = false;
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(): Promise<void> {
    await this.apiCall<boolean>('deleteWebhook');
  }

  /**
   * Handle webhook update
   */
  async handleWebhookUpdate(update: TelegramUpdate): Promise<void> {
    await this.processUpdate(update);
  }

  // ============================================
  // Private Methods
  // ============================================

  private async apiCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${this.apiUrl}/${method}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = await response.json() as TelegramResponse<T>;
    
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || data.error_code}`);
    }
    
    return data.result as T;
  }

  private startPolling(): void {
    if (!this.isPolling) return;
    
    this.pollUpdates()
      .then(() => {
        this.pollingTimeout = setTimeout(() => this.startPolling(), this.pollingInterval);
      })
      .catch((error) => {
        console.error('[Telegram] Polling error:', error);
        this.pollingTimeout = setTimeout(() => this.startPolling(), this.pollingInterval * 2);
      });
  }

  private async pollUpdates(): Promise<void> {
    const updates = await this.apiCall<TelegramUpdate[]>('getUpdates', {
      offset: this.lastUpdateId + 1,
      timeout: 0,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
    });

    for (const update of updates) {
      this.lastUpdateId = update.update_id;
      await this.processUpdate(update);
    }
  }

  private async processUpdate(update: TelegramUpdate): Promise<void> {
    try {
      // Handle regular message
      if (update.message) {
        const message = this.convertMessage(update.message);
        await this.handleMessage(message);
      }
      
      // Handle edited message
      if (update.edited_message) {
        const message = this.convertMessage(update.edited_message);
        await this.handleMessage(message);
      }
      
      // Handle callback query
      if (update.callback_query) {
        const query: CallbackQuery = {
          id: update.callback_query.id,
          message: update.callback_query.message 
            ? this.convertMessage(update.callback_query.message)
            : undefined,
          data: update.callback_query.data || '',
          userId: update.callback_query.from.id.toString(),
          username: update.callback_query.from.username,
          chatId: update.callback_query.message?.chat.id.toString() || '',
        };
        await this.handleCallback(query);
      }
    } catch (error) {
      console.error('[Telegram] Error processing update:', error);
    }
  }

  private convertMessage(msg: TelegramMessage): ChannelMessage {
    const attachments: MessageAttachment[] = [];
    
    if (msg.photo && msg.photo.length > 0) {
      const photo = msg.photo[msg.photo.length - 1]; // Get largest photo
      attachments.push({
        type: 'image',
        url: photo.file_id,
        size: photo.file_size,
      });
    }
    
    if (msg.video) {
      attachments.push({
        type: 'video',
        url: msg.video.file_id,
        size: msg.video.file_size,
      });
    }
    
    if (msg.audio) {
      attachments.push({
        type: 'audio',
        url: msg.audio.file_id,
        size: msg.audio.file_size,
      });
    }
    
    if (msg.document) {
      attachments.push({
        type: 'document',
        url: msg.document.file_id,
        filename: msg.document.file_name,
        mimeType: msg.document.mime_type,
        size: msg.document.file_size,
      });
    }
    
    if (msg.sticker) {
      attachments.push({
        type: 'sticker',
        url: msg.sticker.file_id,
      });
    }
    
    if (msg.location) {
      attachments.push({
        type: 'location',
        data: {
          latitude: msg.location.latitude,
          longitude: msg.location.longitude,
        },
      });
    }
    
    if (msg.contact) {
      attachments.push({
        type: 'contact',
        data: {
          phoneNumber: msg.contact.phone_number,
          firstName: msg.contact.first_name,
          lastName: msg.contact.last_name,
        },
      });
    }

    return {
      id: msg.message_id.toString(),
      channelType: 'telegram',
      chatId: msg.chat.id.toString(),
      userId: msg.from?.id?.toString() || msg.sender_chat?.id?.toString() || 'unknown',
      username: msg.from?.username,
      displayName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' '),
      text: msg.text || msg.caption || '',
      timestamp: new Date(msg.date * 1000),
      replyTo: msg.reply_to_message?.message_id?.toString(),
      attachments: attachments.length > 0 ? attachments : undefined,
      raw: msg,
    };
  }

  private getParseMode(mode?: 'text' | 'markdown' | 'html'): string {
    switch (mode) {
      case 'markdown':
        return 'MarkdownV2';
      case 'html':
        return 'HTML';
      default:
        return '';
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createTelegramChannel(config: ChannelConfig): TelegramChannel {
  return new TelegramChannel(config);
}
