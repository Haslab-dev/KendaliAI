/**
 * KendaliAI Slack Channel
 * 
 * Implementation for Slack Bot API channel.
 * Supports channels, groups, and DMs via Slack API.
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
// Slack API Types
// ============================================

interface SlackUser {
  id: string;
  team_id: string;
  name: string;
  deleted: boolean;
  profile?: {
    display_name?: string;
    real_name?: string;
    title?: string;
    image_24?: string;
    image_48?: string;
    image_72?: string;
    image_192?: string;
  };
  is_bot: boolean;
  is_app_user: boolean;
}

interface SlackConversation {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  is_archived?: boolean;
  topic?: { value: string };
  purpose?: { value: string };
  num_members?: number;
}

interface SlackMessage {
  type: string;
  subtype?: string;
  ts: string;
  channel?: string;
  user?: string;
  username?: string;
  text: string;
  bot_id?: string;
  thread_ts?: string;
  files?: SlackFile[];
  edited?: { ts: string; user: string };
}

interface SlackFile {
  id: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  url_private?: string;
  thumb_64?: string;
  thumb_80?: string;
  thumb_360?: string;
}

interface SlackEvent {
  type: string;
  subtype?: string;
  ts: string;
  channel?: string;
  user?: string;
  text?: string;
  bot_id?: string;
  message?: SlackMessage;
  previous_message?: SlackMessage;
}

interface SlackResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
  needed?: string;
  provided?: string;
}

// ============================================
// Slack Channel Implementation
// ============================================

export class SlackChannel extends BaseChannel {
  readonly type = 'slack' as const;
  
  private botToken: string;
  private appToken?: string;
  private apiUrl = 'https://slack.com/api';
  private ws?: WebSocket;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: ChannelConfig) {
    super(config);
    this.botToken = config.token || '';
    this.appToken = config.apiKey; // App-level token for WebSocket
    
    if (!this.botToken) {
      throw new Error('Slack channel requires bot token');
    }
  }

  protected async doInitialize(): Promise<void> {
    // Get bot info
    const auth = await this.apiCall<{ user_id: string; bot_id: string; user: string }>('auth.test');
    this.config.botId = auth.bot_id;
    console.log(`[Slack] Initialized bot: @${auth.user}`);
  }

  protected async doConnect(): Promise<void> {
    // Connect to Slack using Socket Mode if app token is available
    if (this.appToken) {
      await this.connectSocketMode();
    } else {
      console.log(`[Slack] Connected without Socket Mode (webhooks only)`);
    }
  }

  protected async doDisconnect(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    
    console.log(`[Slack] Disconnected`);
  }

  protected async doSendMessage(text: string, options?: SendMessageOptions): Promise<ChannelMessage> {
    const channelId = options?.chatId || this.config.defaultChatId;
    
    if (!channelId) {
      throw new Error('No channel ID provided');
    }

    const body: Record<string, unknown> = {
      channel: channelId,
      text,
    };

    if (options?.replyTo) {
      body.thread_ts = options.replyTo;
    }

    if (options?.parseMode === 'markdown') {
      body.mrkdwn = true;
    }

    if (options?.keyboard) {
      body.blocks = this.convertKeyboard(options.keyboard);
    }

    const result = await this.apiCall<{ ts: string; channel: string; message: SlackMessage }>(
      'chat.postMessage',
      body
    );
    
    return this.convertMessage(result.message, result.channel);
  }

  protected async doEditMessage(messageId: string, options: EditMessageOptions): Promise<ChannelMessage> {
    const channelId = this.config.defaultChatId;
    
    const body: Record<string, unknown> = {
      channel: channelId,
      ts: messageId,
      text: options.text,
    };

    if (options.keyboard) {
      body.blocks = this.convertKeyboard(options.keyboard);
    }

    const result = await this.apiCall<{ ts: string; channel: string; message: SlackMessage }>(
      'chat.update',
      body
    );
    
    return this.convertMessage(result.message, result.channel);
  }

  protected async doDeleteMessage(messageId: string, options?: DeleteMessageOptions): Promise<boolean> {
    const channelId = this.config.defaultChatId;
    
    try {
      await this.apiCall('chat.delete', {
        channel: channelId,
        ts: messageId,
      });
      return true;
    } catch {
      return false;
    }
  }

  async getChatInfo(chatId: string): Promise<ChatInfo> {
    const conversation = await this.apiCall<SlackConversation>('conversations.info', {
      channel: chatId,
    });
    
    let type: 'private' | 'group' | 'supergroup' | 'channel' = 'group';
    if (conversation.is_im) {
      type = 'private';
    } else if (conversation.is_channel) {
      type = 'channel';
    } else if (conversation.is_group) {
      type = 'group';
    }
    
    return {
      id: conversation.id,
      type,
      title: conversation.name,
      memberCount: conversation.num_members,
      description: conversation.purpose?.value,
    };
  }

  async getUserInfo(userId: string): Promise<UserInfo> {
    const user = await this.apiCall<{ user: SlackUser }>('users.info', {
      user: userId,
    });
    
    return {
      id: user.user.id,
      username: user.user.name,
      displayName: user.user.profile?.display_name || user.user.profile?.real_name,
      photoUrl: user.user.profile?.image_192 || user.user.profile?.image_72,
      isBot: user.user.is_bot,
    };
  }

  async setTyping(chatId: string): Promise<void> {
    // Slack doesn't have a typing indicator API
    // We could use the RTM API for this, but it's deprecated
  }

  // ============================================
  // Slack-Specific Methods
  // ============================================

  /**
   * Send a message with blocks
   */
  async sendBlocks(
    text: string,
    blocks: unknown[],
    options?: SendMessageOptions
  ): Promise<ChannelMessage> {
    const channelId = options?.chatId || this.config.defaultChatId;
    
    const result = await this.apiCall<{ ts: string; channel: string; message: SlackMessage }>(
      'chat.postMessage',
      {
        channel: channelId,
        text,
        blocks,
      }
    );
    
    return this.convertMessage(result.message, result.channel);
  }

  /**
   * Send an ephemeral message (visible only to one user)
   */
  async sendEphemeral(
    text: string,
    userId: string,
    options?: SendMessageOptions
  ): Promise<string> {
    const channelId = options?.chatId || this.config.defaultChatId;
    
    const result = await this.apiCall<{ message_ts: string }>(
      'chat.postEphemeral',
      {
        channel: channelId,
        user: userId,
        text,
      }
    );
    
    return result.message_ts;
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(messageId: string, emoji: string, chatId?: string): Promise<void> {
    await this.apiCall('reactions.add', {
      channel: chatId || this.config.defaultChatId,
      timestamp: messageId,
      name: emoji,
    });
  }

  /**
   * Open a modal
   */
  async openModal(triggerId: string, view: unknown): Promise<string> {
    const result = await this.apiCall<{ view: { id: string } }>('views.open', {
      trigger_id: triggerId,
      view,
    });
    return result.view.id;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async apiCall<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.apiUrl}/${method}`;
    
    const formData = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await response.json() as SlackResponse<T>;
    
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }
    
    return data as T;
  }

  private async connectSocketMode(): Promise<void> {
    // Get WebSocket URL from Slack
    const result = await this.apiCall<{ url: string }>('apps.connections.open', {});
    
    this.ws = new WebSocket(result.url);
    
    this.ws.onopen = () => {
      console.log('[Slack] WebSocket connected');
      this.reconnectAttempts = 0;
      this.startPing();
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        this.handleWebSocketMessage(data);
      } catch (error) {
        console.error('[Slack] Error parsing WebSocket message:', error);
      }
    };
    
    this.ws.onclose = (event) => {
      console.log(`[Slack] WebSocket closed: ${event.code} ${event.reason}`);
      this.handleDisconnect();
    };
    
    this.ws.onerror = (error) => {
      console.error('[Slack] WebSocket error:', error);
    };
  }

  private startPing(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private handleWebSocketMessage(data: { type: string; payload?: unknown; envelope_id?: string }): void {
    // Acknowledge the message
    if (data.envelope_id && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ envelope_id: data.envelope_id }));
    }

    if (data.type === 'events_api' && data.payload) {
      const payload = data.payload as { event: SlackEvent };
      this.handleEvent(payload.event);
    }
  }

  private handleEvent(event: SlackEvent): void {
    // Ignore bot messages
    if (event.bot_id || event.subtype === 'bot_message') return;
    
    switch (event.type) {
      case 'message':
        if (event.text && event.channel && event.user) {
          const message = this.convertMessage({
            type: 'message',
            ts: event.ts,
            channel: event.channel,
            user: event.user,
            text: event.text,
          }, event.channel);
          this.handleMessage(message);
        }
        break;
        
      case 'message_changed':
        if (event.message && event.previous_message) {
          const message = this.convertMessage(event.message, event.channel);
          this.handleMessage(message);
        }
        break;
    }
  }

  private handleDisconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`[Slack] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connectSocketMode(), delay);
    }
  }

  private convertMessage(msg: SlackMessage, channelId?: string): ChannelMessage {
    const attachments: MessageAttachment[] = [];
    
    if (msg.files) {
      for (const file of msg.files) {
        let type: MessageAttachment['type'] = 'document';
        
        if (file.mimetype?.startsWith('image/')) {
          type = 'image';
        } else if (file.mimetype?.startsWith('video/')) {
          type = 'video';
        } else if (file.mimetype?.startsWith('audio/')) {
          type = 'audio';
        }
        
        attachments.push({
          type,
          url: file.url_private,
          filename: file.name,
          mimeType: file.mimetype,
          size: file.size,
          thumbnailUrl: file.thumb_360 || file.thumb_80,
        });
      }
    }

    return {
      id: msg.ts,
      channelType: 'slack',
      chatId: msg.channel || channelId || '',
      userId: msg.user || 'unknown',
      text: msg.text,
      timestamp: new Date(parseFloat(msg.ts) * 1000),
      replyTo: msg.thread_ts,
      attachments: attachments.length > 0 ? attachments : undefined,
      raw: msg,
    };
  }

  private convertKeyboard(keyboard: import('./types').InlineKeyboard): unknown[] {
    // Convert to Slack block kit buttons
    return [
      {
        type: 'actions',
        elements: keyboard.buttons.flat().map((btn) => ({
          type: 'button',
          text: { type: 'plain_text', text: btn.text },
          action_id: btn.callbackData || btn.text,
          url: btn.url,
        })),
      },
    ];
  }
}

// ============================================
// Factory Function
// ============================================

export function createSlackChannel(config: ChannelConfig): SlackChannel {
  return new SlackChannel(config);
}
