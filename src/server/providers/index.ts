/**
 * KendaliAI Providers Module
 *
 * Exports all provider-related functionality.
 */

// Types
export type {
  ProviderType,
  ProviderConfig,
  ChatMessage,
  ToolCall,
  ToolDefinition,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
  EmbeddingOptions,
  EmbeddingResult,
  ModelInfo,
  ProviderCapabilities,
  AIProvider,
  ProviderFactory,
  ProviderEvent,
  ProviderEventHandler,
} from "./types";

// Base class
export { BaseProvider } from "./base";

// Providers
export { OpenAIProvider, createOpenAIProvider } from "./openai";
export { DeepSeekProvider, createDeepSeekProvider } from "./deepseek";
export { ZAIProvider, createZAIProvider } from "./zai";
export { CustomProvider, createCustomProvider } from "./custom";

// Registry
export {
  providerRegistry,
  createProvider,
  getProvider,
  hasProvider,
  removeProvider,
  getAllProviders,
} from "./registry";

// ============================================
// Convenience Functions
// ============================================

import { providerRegistry } from "./registry";
import { OpenAIProvider } from "./openai";
import { DeepSeekProvider } from "./deepseek";
import { ZAIProvider } from "./zai";
import { CustomProvider } from "./custom";
import type { ProviderConfig, ProviderType } from "./types";

/**
 * Quick setup for a provider
 */
export function setupProvider(
  type: ProviderType,
  apiKey: string,
  options?: Partial<ProviderConfig>,
): ReturnType<typeof providerRegistry.create> {
  const config: ProviderConfig = {
    type,
    apiKey,
    ...options,
  };

  return providerRegistry.create(type, config);
}

/**
 * Create OpenAI provider quickly
 */
export function openai(apiKey: string, model?: string): OpenAIProvider {
  return new OpenAIProvider({
    type: "openai",
    apiKey,
    defaultModel: model,
  });
}

/**
 * Create DeepSeek provider quickly
 */
export function deepseek(apiKey: string, model?: string): DeepSeekProvider {
  return new DeepSeekProvider({
    type: "deepseek",
    apiKey,
    defaultModel: model,
  });
}

/**
 * Create ZAI provider quickly
 */
export function zai(apiKey: string, model?: string): ZAIProvider {
  return new ZAIProvider({
    type: "zai",
    apiKey,
    defaultModel: model,
  });
}

/**
 * Create custom provider quickly
 */
export function custom(
  baseURL: string,
  apiKey?: string,
  model?: string,
): CustomProvider {
  return new CustomProvider({
    type: "custom",
    baseURL,
    apiKey,
    defaultModel: model,
  });
}
