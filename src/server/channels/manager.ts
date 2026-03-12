/**
 * KendaliAI Channel Manager
 * 
 * Manages channel instances and provides factory methods.
 */

import type {
  Channel,
  ChannelConfig,
  ChannelType,
  ChannelFactory,
  ChannelEventHandler,
  ChannelEvent,
  ChannelBinding,
  ChannelMessage,
} from './types';
import { TelegramChannel } from './telegram';
import { DiscordChannel } from './discord';
import { SlackChannel } from './slack';
import { WebhookChannel } from './webhook';

// ============================================
// Channel Manager
// ============================================

class ChannelManager {
  private channels: Map<string, Channel> = new Map();
  private factories: Map<ChannelType, ChannelFactory> = new Map();
  private eventHandlers: ChannelEventHandler[] = [];
  private bindings: ChannelBinding[] = [];

  constructor() {
    // Register built-in channel factories
    this.registerFactory({
      type: 'telegram',
      name: 'Telegram',
      create: (config) => new TelegramChannel(config),
    });

    this.registerFactory({
      type: 'discord',
      name: 'Discord',
      create: (config) => new DiscordChannel(config),
    });

    this.registerFactory({
      type: 'slack',
      name: 'Slack',
      create: (config) => new SlackChannel(config),
    });

    this.registerFactory({
      type: 'webhook',
      name: 'Webhook',
      create: (config) => new WebhookChannel(config),
    });
  }

  /**
   * Register a channel factory
   */
  registerFactory(factory: ChannelFactory): void {
    this.factories.set(factory.type, factory);
  }

  /**
   * Create a channel instance
   */
  create(type: ChannelType, config: ChannelConfig): Channel {
    const factory = this.factories.get(type);
    
    if (!factory) {
      throw new Error(`Unknown channel type: ${type}`);
    }

    return factory.create(config);
  }

  /**
   * Register a channel instance
   */
  register(name: string, channel: Channel): void {
    this.channels.set(name, channel);
    
    // Forward channel events
    channel.addEventHandler((event) => {
      this.emitEvent(event);
    });
    
    this.emitEvent({
      type: 'connected',
      channel: name,
      channelType: channel.type,
      timestamp: new Date(),
    });
  }

  /**
   * Get a registered channel
   */
  get(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  /**
   * Check if a channel is registered
   */
  has(name: string): boolean {
    return this.channels.has(name);
  }

  /**
   * Remove a channel
   */
  async remove(name: string): Promise<void> {
    const channel = this.channels.get(name);
    if (channel) {
      await channel.dispose();
      this.channels.delete(name);
      this.emitEvent({
        type: 'disconnected',
        channel: name,
        channelType: channel.type,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get all registered channels
   */
  getAll(): Map<string, Channel> {
    return new Map(this.channels);
  }

  /**
   * Get all channel names
   */
  getNames(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Get available channel types
   */
  getAvailableTypes(): ChannelType[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get factory for a channel type
   */
  getFactory(type: ChannelType): ChannelFactory | undefined {
    return this.factories.get(type);
  }

  /**
   * Initialize all registered channels
   */
  async initializeAll(): Promise<void> {
    const promises = Array.from(this.channels.entries()).map(
      async ([name, channel]) => {
        try {
          await channel.initialize();
        } catch (error) {
          this.emitEvent({
            type: 'error',
            channel: name,
            channelType: channel.type,
            timestamp: new Date(),
            data: error,
          });
        }
      }
    );
    await Promise.all(promises);
  }

  /**
   * Connect all channels
   */
  async connectAll(): Promise<void> {
    const promises = Array.from(this.channels.entries()).map(
      async ([name, channel]) => {
        try {
          await channel.connect();
        } catch (error) {
          this.emitEvent({
            type: 'error',
            channel: name,
            channelType: channel.type,
            timestamp: new Date(),
            data: error,
          });
        }
      }
    );
    await Promise.all(promises);
  }

  /**
   * Disconnect all channels
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.channels.entries()).map(
      async ([name, channel]) => {
        try {
          await channel.disconnect();
        } catch (error) {
          console.error(`[ChannelManager] Error disconnecting ${name}:`, error);
        }
      }
    );
    await Promise.all(promises);
  }

  /**
   * Health check all channels
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [name, channel] of this.channels) {
      try {
        results[name] = await channel.healthCheck();
      } catch {
        results[name] = false;
      }
    }
    
    return results;
  }

  /**
   * Dispose all channels
   */
  async disposeAll(): Promise<void> {
    const promises = Array.from(this.channels.keys()).map((name) =>
      this.remove(name)
    );
    await Promise.all(promises);
  }

  // ============================================
  // Channel Bindings
  // ============================================

  /**
   * Bind a channel to a gateway
   */
  bindChannel(binding: ChannelBinding): void {
    // Remove existing binding for same gateway/channel
    this.bindings = this.bindings.filter(
      (b) => !(b.gateway === binding.gateway && b.channel === binding.channel)
    );
    this.bindings.push(binding);
  }

  /**
   * Unbind a channel from a gateway
   */
  unbindChannel(gateway: string, channel: string): void {
    this.bindings = this.bindings.filter(
      (b) => !(b.gateway === gateway && b.channel === channel)
    );
  }

  /**
   * Get bindings for a gateway
   */
  getBindingsForGateway(gateway: string): ChannelBinding[] {
    return this.bindings.filter((b) => b.gateway === gateway && b.enabled);
  }

  /**
   * Get bindings for a channel
   */
  getBindingsForChannel(channel: string): ChannelBinding[] {
    return this.bindings.filter((b) => b.channel === channel && b.enabled);
  }

  /**
   * Get all bindings
   */
  getAllBindings(): ChannelBinding[] {
    return [...this.bindings];
  }

  /**
   * Route message to appropriate gateway
   */
  routeMessage(message: ChannelMessage): string | null {
    const bindings = this.getBindingsForChannel(message.chatId);
    
    if (bindings.length === 0) {
      return null;
    }

    // Try prefix-based routing first
    for (const binding of bindings) {
      if (binding.routingMode === 'prefix' && binding.prefix) {
        if (message.text.startsWith(binding.prefix)) {
          return binding.gateway;
        }
      }
    }

    // Try keyword-based routing
    for (const binding of bindings) {
      if (binding.routingMode === 'keyword' && binding.keywords) {
        const text = message.text.toLowerCase();
        if (binding.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
          return binding.gateway;
        }
      }
    }

    // Return default gateway
    const defaultBinding = bindings.find((b) => b.isDefault);
    if (defaultBinding) {
      return defaultBinding.gateway;
    }

    // Return first binding (round-robin could be implemented here)
    return bindings[0]?.gateway || null;
  }

  // ============================================
  // Event Handling
  // ============================================

  /**
   * Add event handler
   */
  onEvent(handler: ChannelEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  offEvent(handler: ChannelEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit event to handlers
   */
  private emitEvent(event: ChannelEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[ChannelManager] Error in event handler:', error);
      }
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

export const channelManager = new ChannelManager();

// ============================================
// Convenience Functions
// ============================================

/**
 * Create and register a channel
 */
export async function createChannel(
  name: string,
  type: ChannelType,
  config: ChannelConfig
): Promise<Channel> {
  const channel = channelManager.create(type, config);
  await channel.initialize();
  channelManager.register(name, channel);
  return channel;
}

/**
 * Get a channel by name
 */
export function getChannel(name: string): Channel | undefined {
  return channelManager.get(name);
}

/**
 * Check if channel exists
 */
export function hasChannel(name: string): boolean {
  return channelManager.has(name);
}

/**
 * Remove a channel
 */
export async function removeChannel(name: string): Promise<void> {
  await channelManager.remove(name);
}

/**
 * Get all channels
 */
export function getAllChannels(): Map<string, Channel> {
  return channelManager.getAll();
}
