/**
 * KendaliAI Channel Factory
 *
 * Factory for creating messaging channel instances.
 */

import type {
  ChannelInstance,
  ChannelConfig,
  ChannelType,
  MessageCallback,
} from "./types";
import {
  createTelegramChannel,
  telegramChannel,
  type TelegramConfig,
} from "./telegram";

// Re-export types
export type {
  ChannelInstance,
  ChannelConfig,
  ChannelType,
  ChannelStatus,
  IncomingMessage,
  OutgoingMessage,
  MessageCallback,
  MessageHandler,
} from "./types";
export type { TelegramConfig } from "./telegram";

/**
 * Error thrown when a channel is not yet implemented
 */
export class ChannelNotImplementedError extends Error {
  constructor(public readonly channelType: ChannelType) {
    super(
      `Channel '${channelType}' is not yet implemented. Available channels: telegram`,
    );
    this.name = "ChannelNotImplementedError";
  }
}

/**
 * Error thrown when an unknown channel type is requested
 */
export class UnknownChannelError extends Error {
  constructor(public readonly channelType: string) {
    super(
      `Unknown channel type: '${channelType}'. Valid types: telegram, discord, whatsapp`,
    );
    this.name = "UnknownChannelError";
  }
}

// Channel registry
const channels = new Map<ChannelType, ChannelInstance>();

/**
 * Initialize channels from configuration
 *
 * Skips channels that are not yet implemented or have missing configuration.
 * Errors are caught and logged to prevent initialization failures.
 */
export function initializeChannels(
  configs: Record<string, ChannelConfig>,
): void {
  for (const [type, config] of Object.entries(configs)) {
    if (config.botToken) {
      try {
        const channel = createChannel(type as ChannelType, config);
        channels.set(type as ChannelType, channel);
      } catch (error) {
        if (error instanceof ChannelNotImplementedError) {
          console.warn(`Skipping ${type}: ${error.message}`);
        } else {
          throw error;
        }
      }
    }
  }
}

/**
 * Create a channel instance based on type
 *
 * @param type - The channel type (telegram, discord, whatsapp)
 * @param config - Channel configuration including bot token
 * @returns Channel instance
 * @throws {ChannelNotImplementedError} If channel type is valid but not yet implemented
 * @throws {UnknownChannelError} If channel type is not recognized
 */
export function createChannel(
  type: ChannelType,
  config: ChannelConfig,
): ChannelInstance {
  switch (type) {
    case "telegram":
      return createTelegramChannel({
        type: "telegram",
        botToken: config.botToken,
        enabled: config.enabled,
        webhookUrl: config.webhookUrl,
      });

    case "discord":
    case "whatsapp":
      throw new ChannelNotImplementedError(type);

    default:
      throw new UnknownChannelError(type);
  }
}

/**
 * Get a channel by type
 */
export function getChannel(type: ChannelType): ChannelInstance | undefined {
  return channels.get(type);
}

/**
 * Get all configured channels
 */
export function getAllChannels(): ChannelInstance[] {
  return Array.from(channels.values());
}

/**
 * Check if a channel is configured
 */
export function isChannelConfigured(type: ChannelType): boolean {
  const channel = channels.get(type);
  return channel?.isConfigured() ?? false;
}

/**
 * Get default channel
 *
 * Returns the first configured channel, preferring telegram.
 *
 * @returns The default channel instance, or undefined if none configured
 */
export function getDefaultChannel(): ChannelInstance | undefined {
  if (isChannelConfigured("telegram")) {
    return getChannel("telegram");
  }
  return getAllChannels()[0];
}

/**
 * Start all configured channels
 */
export async function startAllChannels(): Promise<void> {
  const startPromises = Array.from(channels.values()).map(async (channel) => {
    try {
      await channel.start();
    } catch (error) {
      console.error(`Failed to start ${channel.name} channel:`, error);
    }
  });

  await Promise.all(startPromises);
}

/**
 * Stop all configured channels
 */
export async function stopAllChannels(): Promise<void> {
  const stopPromises = Array.from(channels.values()).map(async (channel) => {
    try {
      await channel.stop();
    } catch (error) {
      console.error(`Failed to stop ${channel.name} channel:`, error);
    }
  });

  await Promise.all(stopPromises);
}

/**
 * Set message handler for all channels
 */
export function setGlobalMessageHandler(handler: MessageCallback): void {
  for (const channel of channels.values()) {
    channel.onMessage(handler);
  }
}

/**
 * Set error handler for all channels
 */
export function setGlobalErrorHandler(
  handler: (error: Error) => void | Promise<void>,
): void {
  for (const channel of channels.values()) {
    channel.onError(handler);
  }
}

// Export default unconfigured channels for reference
export { telegramChannel };
