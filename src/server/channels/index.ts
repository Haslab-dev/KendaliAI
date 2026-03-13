/**
 * KendaliAI Channels Module
 *
 * Exports all channel-related functionality.
 */

// Types
export type {
  ChannelType,
  ChannelStatus,
  ChannelConfig,
  ChannelMessage,
  MessageAttachment,
  SendMessageOptions,
  InlineKeyboard,
  InlineKeyboardButton,
  EditMessageOptions,
  DeleteMessageOptions,
  ChannelEvent,
  ChannelEventType,
  CallbackQuery,
  CommandContext,
  Channel,
  ChatInfo,
  UserInfo,
  ChannelFactory,
  ChannelBinding,
  ChannelEventHandler,
} from "./types";

// Base class
export { BaseChannel } from "./base";

// Channels
export { TelegramChannel, createTelegramChannel } from "./telegram";
export { DiscordChannel, createDiscordChannel } from "./discord";
export { SlackChannel, createSlackChannel } from "./slack";
export {
  WebhookChannel,
  createWebhookChannel,
  type WebhookPayload,
} from "./webhook";

// Manager
export {
  channelManager,
  createChannel,
  getChannel,
  hasChannel,
  removeChannel,
  getAllChannels,
} from "./manager";

// ============================================
// Convenience Functions
// ============================================

import { channelManager } from "./manager";
import { TelegramChannel } from "./telegram";
import { DiscordChannel } from "./discord";
import { SlackChannel } from "./slack";
import { WebhookChannel } from "./webhook";
import type { ChannelConfig, ChannelType } from "./types";

/**
 * Quick setup for a channel
 */
export function setupChannel(
  type: ChannelType,
  name: string,
  config: Partial<ChannelConfig>,
): ReturnType<typeof channelManager.create> {
  const fullConfig: ChannelConfig = {
    type,
    name,
    ...config,
  };

  return channelManager.create(type, fullConfig);
}

/**
 * Create Telegram channel quickly
 */
export function telegram(name: string, token: string): TelegramChannel {
  return new TelegramChannel({
    type: "telegram",
    name,
    token,
  });
}

/**
 * Create Discord channel quickly
 */
export function discord(name: string, token: string): DiscordChannel {
  return new DiscordChannel({
    type: "discord",
    name,
    token,
  });
}

/**
 * Create Slack channel quickly
 */
export function slack(
  name: string,
  botToken: string,
  appToken?: string,
): SlackChannel {
  return new SlackChannel({
    type: "slack",
    name,
    token: botToken,
    apiKey: appToken,
  });
}

/**
 * Create Webhook channel quickly
 */
export function webhook(
  name: string,
  webhookUrl?: string,
  secret?: string,
): WebhookChannel {
  return new WebhookChannel({
    type: "webhook",
    name,
    webhookUrl,
    apiKey: secret,
  });
}
