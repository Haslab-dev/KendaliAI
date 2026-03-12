/**
 * KendaliAI Provider Registry
 * 
 * Manages AI provider instances and provides factory methods.
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderType,
  ProviderFactory,
  ProviderEventHandler,
  ProviderEvent,
} from './types';
import { OpenAIProvider } from './openai';
import { DeepSeekProvider } from './deepseek';
import { ZAIProvider } from './zai';
import { CustomProvider } from './custom';

// ============================================
// Provider Registry
// ============================================

class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();
  private factories: Map<ProviderType, ProviderFactory> = new Map();
  private eventHandlers: ProviderEventHandler[] = [];

  constructor() {
    // Register built-in provider factories
    this.registerFactory({
      type: 'openai',
      name: 'OpenAI',
      create: (config) => new OpenAIProvider(config),
    });

    this.registerFactory({
      type: 'deepseek',
      name: 'DeepSeek',
      create: (config) => new DeepSeekProvider(config),
    });

    this.registerFactory({
      type: 'zai',
      name: 'ZAI',
      create: (config) => new ZAIProvider(config),
    });

    this.registerFactory({
      type: 'custom',
      name: 'Custom',
      create: (config) => new CustomProvider(config),
    });
  }

  /**
   * Register a provider factory
   */
  registerFactory(factory: ProviderFactory): void {
    this.factories.set(factory.type, factory);
  }

  /**
   * Create a provider instance
   */
  create(type: ProviderType, config: ProviderConfig): AIProvider {
    const factory = this.factories.get(type);
    
    if (!factory) {
      throw new Error(`Unknown provider type: ${type}`);
    }

    return factory.create(config);
  }

  /**
   * Register a provider instance
   */
  register(name: string, provider: AIProvider): void {
    this.providers.set(name, provider);
    this.emitEvent({
      type: 'initialized',
      provider: name,
      timestamp: new Date(),
    });
  }

  /**
   * Get a registered provider
   */
  get(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Check if a provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Remove a provider
   */
  async remove(name: string): Promise<void> {
    const provider = this.providers.get(name);
    if (provider) {
      await provider.dispose();
      this.providers.delete(name);
      this.emitEvent({
        type: 'disposed',
        provider: name,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get all registered providers
   */
  getAll(): Map<string, AIProvider> {
    return new Map(this.providers);
  }

  /**
   * Get all provider names
   */
  getNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get available provider types
   */
  getAvailableTypes(): ProviderType[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get factory for a provider type
   */
  getFactory(type: ProviderType): ProviderFactory | undefined {
    return this.factories.get(type);
  }

  /**
   * Initialize all registered providers
   */
  async initializeAll(): Promise<void> {
    const promises = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          await provider.initialize();
        } catch (error) {
          this.emitEvent({
            type: 'error',
            provider: name,
            timestamp: new Date(),
            data: error,
          });
        }
      }
    );
    await Promise.all(promises);
  }

  /**
   * Health check all providers
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.healthCheck();
      } catch {
        results[name] = false;
      }
    }
    
    return results;
  }

  /**
   * Dispose all providers
   */
  async disposeAll(): Promise<void> {
    const promises = Array.from(this.providers.keys()).map((name) =>
      this.remove(name)
    );
    await Promise.all(promises);
  }

  /**
   * Add event handler
   */
  onEvent(handler: ProviderEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  offEvent(handler: ProviderEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit event to handlers
   */
  private emitEvent(event: ProviderEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[ProviderRegistry] Error in event handler:', error);
      }
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

export const providerRegistry = new ProviderRegistry();

// ============================================
// Convenience Functions
// ============================================

/**
 * Create and register a provider
 */
export async function createProvider(
  name: string,
  type: ProviderType,
  config: ProviderConfig
): Promise<AIProvider> {
  const provider = providerRegistry.create(type, config);
  await provider.initialize();
  providerRegistry.register(name, provider);
  return provider;
}

/**
 * Get a provider by name
 */
export function getProvider(name: string): AIProvider | undefined {
  return providerRegistry.get(name);
}

/**
 * Check if provider exists
 */
export function hasProvider(name: string): boolean {
  return providerRegistry.has(name);
}

/**
 * Remove a provider
 */
export async function removeProvider(name: string): Promise<void> {
  await providerRegistry.remove(name);
}

/**
 * Get all providers
 */
export function getAllProviders(): Map<string, AIProvider> {
  return providerRegistry.getAll();
}
