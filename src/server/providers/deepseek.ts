/**
 * KendaliAI DeepSeek Provider
 * 
 * Implementation for DeepSeek AI models.
 * Supports DeepSeek-V3, DeepSeek-Coder, and other DeepSeek models.
 */

import { BaseProvider } from './base';
import type { ProviderConfig, ProviderCapabilities, ModelInfo } from './types';

// ============================================
// DeepSeek Provider Implementation
// ============================================

export class DeepSeekProvider extends BaseProvider {
  readonly name = 'DeepSeek';
  readonly type = 'deepseek' as const;

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
      maxContextLength: 64000,
    };
  }

  getDefaultBaseUrl(): string {
    return 'https://api.deepseek.com/v1';
  }

  getDefaultModel(): string {
    return 'deepseek-chat';
  }

  protected getProviderSpecificHeaders(): Record<string, string> {
    return {};
  }

  async listModels(): Promise<ModelInfo[]> {
    // Return known DeepSeek models with detailed info
    return [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        provider: this.name,
        contextWindow: 64000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 0.14,
        outputCostPer1M: 0.28,
      },
      {
        id: 'deepseek-coder',
        name: 'DeepSeek Coder',
        provider: this.name,
        contextWindow: 16000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 0.14,
        outputCostPer1M: 0.28,
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner (R1)',
        provider: this.name,
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsFunctionCalling: false,
        supportsStreaming: true,
        inputCostPer1M: 0.55,
        outputCostPer1M: 2.19,
      },
    ];
  }
}

// ============================================
// Factory Function
// ============================================

export function createDeepSeekProvider(config: ProviderConfig): DeepSeekProvider {
  return new DeepSeekProvider(config);
}
