/**
 * KendaliAI Discord Channel
 *
 * Implementation for Discord Bot API channel.
 * Supports text channels, DMs, and slash commands.
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
  CallbackQuery,
  MessageAttachment,
} from "./types";

// ============================================
// Discord API Types
// ============================================

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  bot?: boolean;
  system?: boolean;
  global_name?: string;
}

interface DiscordChannelData {
  id: string;
  type: number;
  guild_id?: string;
  name?: string;
  topic?: string;
  nsfw?: boolean;
  last_message_id?: string;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  edited_timestamp?: string;
  tts: boolean;
  mention_everyone: boolean;
  mentions: DiscordUser[];
  attachments: DiscordAttachment[];
  embeds: unknown[];
  reactions?: unknown[];
  referenced_message?: DiscordMessage;
}

interface DiscordAttachment {
  id: string;
  filename: string;
  description?: string;
  content_type?: string;
  size: number;
  url: string;
  proxy_url: string;
  height?: number;
  width?: number;
}

interface DiscordInteraction {
  id: string;
  type: number;
  data?: {
    name: string;
    type: number;
    options?: { name: string; value: string | number | boolean }[];
    custom_id?: string;
    component_type?: number;
  };
  guild_id?: string;
  channel_id: string;
  user?: DiscordUser;
  message?: DiscordMessage;
  token: string;
}

interface DiscordGatewayEvent {
  op: number;
  d?: unknown;
  s?: number;
  t?: string;
}

interface DiscordReadyEvent {
  v: number;
  user: DiscordUser;
  guilds: { id: string; unavailable: boolean }[];
  session_id: string;
}

// ============================================
// Discord Channel Implementation
// ============================================

export class DiscordChannel extends BaseChannel {
  readonly type = "discord" as const;

  private botToken: string;
  private apiUrl = "https://discord.com/api/v10";
  private gatewayUrl?: string;
  private ws?: WebSocket;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private sessionId?: string;
  private sequenceNumber = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: ChannelConfig) {
    super(config);
    this.botToken = config.token || "";

    if (!this.botToken) {
      throw new Error("Discord channel requires bot token");
    }
  }

  protected async doInitialize(): Promise<void> {
    // Get bot info
    const user = await this.apiCall<DiscordUser>("GET", "/users/@me");
    this.config.botId = user.id;
    console.log(`[Discord] Initialized bot: @${user.username}`);

    // Get gateway URL
    const gateway = await this.apiCall<{ url: string }>("GET", "/gateway");
    this.gatewayUrl = gateway.url;
  }

  protected async doConnect(): Promise<void> {
    if (!this.gatewayUrl) {
      throw new Error("Gateway URL not initialized");
    }

    await this.connectGateway();
    console.log(`[Discord] Connected to gateway`);
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

    console.log(`[Discord] Disconnected`);
  }

  protected async doSendMessage(
    text: string,
    options?: SendMessageOptions,
  ): Promise<ChannelMessage> {
    const channelId = options?.chatId || this.config.defaultChatId;

    if (!channelId) {
      throw new Error("No channel ID provided");
    }

    const body: Record<string, unknown> = {
      content: text,
      tts: false,
    };

    if (options?.keyboard) {
      body.components = this.convertKeyboard(options.keyboard);
    }

    const result = await this.apiCall<DiscordMessage>(
      "POST",
      `/channels/${channelId}/messages`,
      body,
    );
    return this.convertMessage(result);
  }

  protected async doEditMessage(
    messageId: string,
    options: EditMessageOptions,
  ): Promise<ChannelMessage> {
    const channelId = this.config.defaultChatId;

    const body: Record<string, unknown> = {
      content: options.text,
    };

    if (options.keyboard) {
      body.components = this.convertKeyboard(options.keyboard);
    }

    const result = await this.apiCall<DiscordMessage>(
      "PATCH",
      `/channels/${channelId}/messages/${messageId}`,
      body,
    );
    return this.convertMessage(result);
  }

  protected async doDeleteMessage(
    messageId: string,
    options?: DeleteMessageOptions,
  ): Promise<boolean> {
    const channelId = this.config.defaultChatId;

    try {
      await this.apiCall(
        "DELETE",
        `/channels/${channelId}/messages/${messageId}`,
      );
      return true;
    } catch {
      return false;
    }
  }

  async getChatInfo(chatId: string): Promise<ChatInfo> {
    const channel = await this.apiCall<DiscordChannelData>(
      "GET",
      `/channels/${chatId}`,
    );

    const typeMap: Record<
      number,
      "private" | "group" | "supergroup" | "channel"
    > = {
      0: "group", // Text channel
      1: "private", // DM
      3: "group", // Group DM
      4: "channel", // Category
      5: "channel", // Announcement channel
      10: "channel", // Announcement thread
      11: "group", // Public thread
      12: "group", // Private thread
    };

    return {
      id: channel.id,
      type: typeMap[channel.type] || "group",
      title: channel.name,
    };
  }

  async getUserInfo(userId: string): Promise<UserInfo> {
    const user = await this.apiCall<DiscordUser>("GET", `/users/${userId}`);

    return {
      id: user.id,
      username: user.username,
      displayName: user.global_name || user.username,
      isBot: user.bot,
    };
  }

  async setTyping(chatId: string): Promise<void> {
    await this.apiCall("POST", `/channels/${chatId}/typing`);
  }

  // ============================================
  // Discord-Specific Methods
  // ============================================

  /**
   * Send an embed message
   */
  async sendEmbed(
    embed: {
      title?: string;
      description?: string;
      url?: string;
      color?: number;
      fields?: { name: string; value: string; inline?: boolean }[];
      image?: { url: string };
      thumbnail?: { url: string };
      footer?: { text: string; icon_url?: string };
    },
    options?: SendMessageOptions,
  ): Promise<ChannelMessage> {
    const channelId = options?.chatId || this.config.defaultChatId;

    const result = await this.apiCall<DiscordMessage>(
      "POST",
      `/channels/${channelId}/messages`,
      {
        embeds: [embed],
      },
    );

    return this.convertMessage(result);
  }

  /**
   * Create a slash command
   */
  async createCommand(
    command: {
      name: string;
      description: string;
      type?: number;
      options?: unknown[];
    },
    guildId?: string,
  ): Promise<void> {
    const applicationId = this.config.botId;

    const endpoint = guildId
      ? `/applications/${applicationId}/guilds/${guildId}/commands`
      : `/applications/${applicationId}/commands`;

    await this.apiCall("POST", endpoint, command);
  }

  /**
   * Reply to an interaction
   */
  async replyToInteraction(
    interactionToken: string,
    content: string,
  ): Promise<void> {
    const applicationId = this.config.botId;
    await this.apiCall(
      "POST",
      `/webhooks/${applicationId}/${interactionToken}`,
      { content },
    );
  }

  // ============================================
  // Private Methods
  // ============================================

  private async apiCall<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bot ${this.botToken}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Discord API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  private async connectGateway(): Promise<void> {
    if (!this.gatewayUrl) return;

    const wsUrl = `${this.gatewayUrl}?v=10&encoding=json`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("[Discord] WebSocket connected");
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as DiscordGatewayEvent;
        this.handleGatewayEvent(data);
      } catch (error) {
        console.error("[Discord] Error parsing gateway event:", error);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[Discord] WebSocket closed: ${event.code} ${event.reason}`);
      this.handleDisconnect();
    };

    this.ws.onerror = (error) => {
      console.error("[Discord] WebSocket error:", error);
    };
  }

  private handleGatewayEvent(event: DiscordGatewayEvent): void {
    // Update sequence number
    if (event.s) {
      this.sequenceNumber = event.s;
    }

    switch (event.op) {
      case 10: // Hello
        this.startHeartbeat(
          (event.d as { heartbeat_interval: number }).heartbeat_interval,
        );
        this.identify();
        break;

      case 11: // Heartbeat ACK
        // Good, connection is alive
        break;

      case 0: // Dispatch
        this.handleDispatchEvent(event.t || "", event.d);
        break;

      case 9: // Invalid Session
        console.warn("[Discord] Invalid session, reconnecting...");
        this.handleDisconnect();
        break;
    }
  }

  private startHeartbeat(interval: number): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 1, d: this.sequenceNumber }));
      }
    }, interval);
  }

  private identify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        op: 2,
        d: {
          token: this.botToken,
          intents: 513, // Guilds + GuildMessages + DirectMessages
          properties: {
            os: "linux",
            browser: "kendaliai",
            device: "kendaliai",
          },
        },
      }),
    );
  }

  private handleDispatchEvent(eventType: string, data: unknown): void {
    switch (eventType) {
      case "READY":
        const ready = data as DiscordReadyEvent;
        this.sessionId = ready.session_id;
        console.log(`[Discord] Ready as ${ready.user.username}`);
        break;

      case "MESSAGE_CREATE":
        const message = data as DiscordMessage;
        // Ignore own messages
        if (message.author.id === this.config.botId) return;
        this.handleMessage(this.convertMessage(message));
        break;

      case "MESSAGE_UPDATE":
        const editedMessage = data as DiscordMessage;
        if (editedMessage.author?.id === this.config.botId) return;
        if (editedMessage.content) {
          this.handleMessage(this.convertMessage(editedMessage));
        }
        break;

      case "INTERACTION_CREATE":
        const interaction = data as DiscordInteraction;
        this.handleInteraction(interaction);
        break;
    }
  }

  private handleInteraction(interaction: DiscordInteraction): void {
    if (interaction.type === 2 && interaction.data && interaction.user) {
      // Application command
      const query: CallbackQuery = {
        id: interaction.id,
        data: interaction.data.name,
        userId: interaction.user.id,
        username: interaction.user.username,
        chatId: interaction.channel_id,
      };
      this.handleCallback(query);
    } else if (interaction.type === 3 && interaction.data && interaction.user) {
      // Message component (button)
      const query: CallbackQuery = {
        id: interaction.id,
        data: interaction.data.custom_id || "",
        message: interaction.message
          ? this.convertMessage(interaction.message)
          : undefined,
        userId: interaction.user.id,
        username: interaction.user.username,
        chatId: interaction.channel_id,
      };
      this.handleCallback(query);
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
      console.log(
        `[Discord] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
      );
      setTimeout(() => this.connectGateway(), delay);
    }
  }

  private convertMessage(msg: DiscordMessage): ChannelMessage {
    const attachments: MessageAttachment[] = msg.attachments.map((att) => {
      let type: MessageAttachment["type"] = "document";

      if (att.content_type?.startsWith("image/")) {
        type = "image";
      } else if (att.content_type?.startsWith("video/")) {
        type = "video";
      } else if (att.content_type?.startsWith("audio/")) {
        type = "audio";
      }

      return {
        type,
        url: att.url,
        filename: att.filename,
        mimeType: att.content_type,
        size: att.size,
      };
    });

    return {
      id: msg.id,
      channelType: "discord",
      chatId: msg.channel_id,
      userId: msg.author.id,
      username: msg.author.username,
      displayName: msg.author.global_name || msg.author.username,
      text: msg.content,
      timestamp: new Date(msg.timestamp),
      replyTo: msg.referenced_message?.id,
      attachments: attachments.length > 0 ? attachments : undefined,
      raw: msg,
    };
  }

  private convertKeyboard(
    keyboard: import("./types").InlineKeyboard,
  ): unknown[] {
    // Convert to Discord action rows
    return [
      {
        type: 1, // Action Row
        components: keyboard.buttons.flat().map((btn) => ({
          type: 2, // Button
          style: btn.url ? 5 : 1, // Link or Primary
          label: btn.text,
          custom_id: btn.callbackData,
          url: btn.url,
        })),
      },
    ];
  }
}

// ============================================
// Factory Function
// ============================================

export function createDiscordChannel(config: ChannelConfig): DiscordChannel {
  return new DiscordChannel(config);
}
