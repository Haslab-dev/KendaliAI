/**
 * KendaliAI ZAI Provider
 * 
 * Implementation for ZAI models.
 * ZAI is an OpenAI-compatible provider with coding-focused models.
 */

import { BaseProvider } from './base';
import type { ProviderConfig, ProviderCapabilities, ModelInfo } from './types';

// ============================================
// ZAI Provider Implementation
// ============================================

export class ZAIProvider extends BaseProvider {
  readonly name = 'ZAI';
  readonly type = 'zai' as const;

  constructor(config: ProviderConfig) {
    super(config);
  }

  get capabilities(): ProviderCapabilities {
    return {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      jsonMode: true,
      maxContextLength: 128000,
    };
  }

  getDefaultBaseUrl(): string {
    return 'https://api.z.ai/api/coding/paas/v4';
  }

  getDefaultModel(): string {
    return 'zai-1';
  }

  protected getProviderSpecificHeaders(): Record<string, string> {
    return {};
  }

  async listModels(): Promise<ModelInfo[]> {
    // Return known ZAI models with detailed info
    return [
      {
        id: 'zai-1',
        name: 'ZAI-1',
        provider: this.name,
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 0.50,
        outputCostPer1M: 1.50,
      },
      {
        id: 'zai-1-mini',
        name: 'ZAI-1 Mini',
        provider: this.name,
        contextWindow: 32000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.60,
      },
      {
        id: 'zai-coder',
        name: 'ZAI Coder',
        provider: this.name,
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 0.30,
        outputCostPer1M: 0.90,
      },
    ];
  }
}

// ============================================
// Factory Function
// ============================================

export function createZAIProvider(config: ProviderConfig): ZAIProvider {
  return new ZAIProvider(config);
}
