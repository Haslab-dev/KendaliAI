/**
 * KendaliAI Custom Provider
 * 
 * Implementation for custom OpenAI-compatible endpoints.
 * Allows connecting to any OpenAI-compatible API.
 */

import { BaseProvider } from './base';
import type { ProviderConfig, ProviderCapabilities, ModelInfo } from './types';

// ============================================
// Custom Provider Implementation
// ============================================

export class CustomProvider extends BaseProvider {
  readonly name: string;
  readonly type = 'custom' as const;

  constructor(config: ProviderConfig) {
    super(config);
    this.name = config.options?.name as string || 'Custom';
  }

  get capabilities(): ProviderCapabilities {
    // Return capabilities based on config or defaults
    return {
      chat: true,
      streaming: this.config.options?.supportsStreaming as boolean ?? true,
      functionCalling: this.config.options?.supportsFunctionCalling as boolean ?? true,
      vision: this.config.options?.supportsVision as boolean ?? false,
      embeddings: this.config.options?.supportsEmbeddings as boolean ?? false,
      jsonMode: this.config.options?.supportsJsonMode as boolean ?? true,
      maxContextLength: (this.config.options?.maxContextLength as number) ?? 8192,
    };
  }

  getDefaultBaseUrl(): string {
    // Custom provider requires baseURL to be specified
    if (!this.config.baseURL) {
      throw new Error('Custom provider requires baseURL to be specified');
    }
    return this.config.baseURL;
  }

  getDefaultModel(): string {
    return this.config.defaultModel || 'default';
  }

  protected getProviderSpecificHeaders(): Record<string, string> {
    // Include any custom headers from config
    return this.config.headers || {};
  }

  async listModels(): Promise<ModelInfo[]> {
    // Try to fetch models from the custom endpoint
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.defaultHeaders,
      });

      if (!response.ok) {
        // If models endpoint not available, return default model
        return [{
          id: this.getDefaultModel(),
          name: this.getDefaultModel(),
          provider: this.name,
          supportsStreaming: this.capabilities.streaming,
          supportsFunctionCalling: this.capabilities.functionCalling,
        }];
      }

      const data = await response.json() as { data?: { id: string; owned_by?: string }[] };
      
      return (data.data || []).map((model) => ({
        id: model.id,
        provider: this.name,
        name: model.id,
        supportsStreaming: this.capabilities.streaming,
        supportsFunctionCalling: this.capabilities.functionCalling,
      }));
    } catch (error) {
      // Return default model on error
      return [{
        id: this.getDefaultModel(),
        name: this.getDefaultModel(),
        provider: this.name,
        supportsStreaming: this.capabilities.streaming,
        supportsFunctionCalling: this.capabilities.functionCalling,
      }];
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createCustomProvider(config: ProviderConfig): CustomProvider {
  return new CustomProvider(config);
}
