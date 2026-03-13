/**
 * KendaliAI OpenAI Provider
 *
 * Implementation for OpenAI GPT models.
 * Supports GPT-4, GPT-3.5, and all OpenAI models.
 */

import { BaseProvider } from "./base";
import type { ProviderConfig, ProviderCapabilities, ModelInfo } from "./types";

// ============================================
// OpenAI Provider Implementation
// ============================================

export class OpenAIProvider extends BaseProvider {
  readonly name = "OpenAI";
  readonly type = "openai" as const;

  constructor(config: ProviderConfig) {
    super(config);
  }

  get capabilities(): ProviderCapabilities {
    return {
      chat: true,
      streaming: true,
      functionCalling: true,
      vision: true,
      embeddings: true,
      jsonMode: true,
      maxContextLength: 128000, // GPT-4 Turbo context
    };
  }

  getDefaultBaseUrl(): string {
    return "https://api.openai.com/v1";
  }

  getDefaultModel(): string {
    return "gpt-4o";
  }

  protected getProviderSpecificHeaders(): Record<string, string> {
    return {};
  }

  protected override getDefaultEmbeddingModel(): string {
    return "text-embedding-3-small";
  }

  async listModels(): Promise<ModelInfo[]> {
    // Return known OpenAI models with detailed info
    return [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: this.name,
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 5.0,
        outputCostPer1M: 15.0,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: this.name,
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.6,
      },
      {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        provider: this.name,
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 10.0,
        outputCostPer1M: 30.0,
      },
      {
        id: "gpt-4",
        name: "GPT-4",
        provider: this.name,
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 30.0,
        outputCostPer1M: 60.0,
      },
      {
        id: "gpt-4-32k",
        name: "GPT-4 32K",
        provider: this.name,
        contextWindow: 32768,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 60.0,
        outputCostPer1M: 120.0,
      },
      {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5 Turbo",
        provider: this.name,
        contextWindow: 16385,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsStreaming: true,
        inputCostPer1M: 0.5,
        outputCostPer1M: 1.5,
      },
      {
        id: "o1-preview",
        name: "o1 Preview",
        provider: this.name,
        contextWindow: 128000,
        maxOutputTokens: 32768,
        supportsVision: false,
        supportsFunctionCalling: false,
        supportsStreaming: false,
        inputCostPer1M: 15.0,
        outputCostPer1M: 60.0,
      },
      {
        id: "o1-mini",
        name: "o1 Mini",
        provider: this.name,
        contextWindow: 128000,
        maxOutputTokens: 65536,
        supportsVision: false,
        supportsFunctionCalling: false,
        supportsStreaming: false,
        inputCostPer1M: 3.0,
        outputCostPer1M: 12.0,
      },
      {
        id: "text-embedding-3-small",
        name: "Text Embedding 3 Small",
        provider: this.name,
        contextWindow: 8191,
        supportsStreaming: false,
      },
      {
        id: "text-embedding-3-large",
        name: "Text Embedding 3 Large",
        provider: this.name,
        contextWindow: 8191,
        supportsStreaming: false,
      },
    ];
  }
}

// ============================================
// Factory Function
// ============================================

export function createOpenAIProvider(config: ProviderConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}
