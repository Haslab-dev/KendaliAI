/**
 * KendaliAI AI SDK Integration
 * 
 * Provides AI abstraction using Vercel AI SDK for OpenAI-compatible providers.
 * Supports: OpenAI, DeepSeek, ZAI, and any OpenAI-compatible endpoint.
 * 
 * @example
 * ```typescript
 * import { createProvider, generateText, streamText } from './ai';
 * 
 * const provider = createProvider('deepseek', 'api-key');
 * const { text } = await generateText(provider, 'deepseek-chat', 'Hello!');
 * ```
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateText as aiGenerateText,
  streamText as aiStreamText,
  type ModelMessage,
} from "ai";

// ============================================
// Types
// ============================================

export interface AIProviderConfig {
  name: string;
  apiKey: string;
  baseURL: string;
  defaultModel?: string;
  headers?: Record<string, string>;
}

export interface AIGenerateOptions {
  model?: string;
  system?: string;
  messages?: ModelMessage[];
  prompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface AIGenerateResult {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export type AIProvider = ReturnType<typeof createOpenAICompatible>;

// ============================================
// Provider Presets
// ============================================

export interface ProviderPreset {
  name: string;
  baseURL: string;
  defaultModel: string;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
  },
  deepseek: {
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  zai: {
    name: "ZAI",
    baseURL: "https://api.z.ai/api/coding/paas/v4",
    defaultModel: "zai-1",
  },
  openrouter: {
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
  },
  groq: {
    name: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.1-70b-versatile",
  },
  together: {
    name: "Together",
    baseURL: "https://api.together.xyz/v1",
    defaultModel: "togethercomputer/CodeLlama-34b-Instruct",
  },
};

// ============================================
// Provider Factory
// ============================================

/**
 * Create an AI SDK provider for OpenAI-compatible APIs
 */
export function createProvider(
  providerType: string,
  apiKey: string,
  customBaseURL?: string
): AIProvider {
  const preset = PROVIDER_PRESETS[providerType];

  if (!preset && !customBaseURL) {
    throw new Error(
      `Unknown provider: ${providerType}. Provide --api-url or use a known provider.`
    );
  }

  const baseURL = customBaseURL || preset?.baseURL || "";
  const name = preset?.name || providerType;

  // Build provider config
  const config: {
    name: string;
    apiKey: string;
    baseURL: string;
    headers?: Record<string, string>;
  } = {
    name,
    apiKey,
    baseURL,
  };

  // Add custom headers for OpenRouter
  if (providerType === "openrouter") {
    config.headers = {
      "HTTP-Referer": "https://kendaliai.dev",
      "X-Title": "KendaliAI",
    };
  }

  return createOpenAICompatible(config);
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(providerType: string): string {
  const preset = PROVIDER_PRESETS[providerType];
  return preset?.defaultModel || "gpt-4o";
}

// ============================================
// Generate Text
// ============================================

/**
 * Generate text using AI SDK with a simple prompt
 */
export async function generateText(
  provider: AIProvider,
  modelId: string,
  options: AIGenerateOptions
): Promise<AIGenerateResult> {
  const model = provider(modelId);

  try {
    // Use prompt-based generation for simple cases
    if (options.prompt && !options.messages) {
      const result = await aiGenerateText({
        model,
        prompt: options.prompt,
        system: options.system,
      });

      return {
        text: result.text,
        finishReason: result.finishReason,
      };
    }

    // Use messages-based generation
    const messages = options.messages || [];
    
    const result = await aiGenerateText({
      model,
      messages,
      system: options.system,
    });

    return {
      text: result.text,
      finishReason: result.finishReason,
    };
  } catch (error) {
    throw new Error(`Failed to generate text: ${error}`);
  }
}

/**
 * Generate text with a simple prompt
 */
export async function generateTextSimple(
  provider: AIProvider,
  modelId: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const result = await generateText(provider, modelId, {
    prompt,
    system: systemPrompt,
  });
  return result.text;
}

// ============================================
// Stream Text
// ============================================

/**
 * Stream text using AI SDK
 */
export async function* streamText(
  provider: AIProvider,
  modelId: string,
  options: AIGenerateOptions
): AsyncGenerator<string, void, unknown> {
  const model = provider(modelId);

  try {
    // Use prompt-based streaming for simple cases
    if (options.prompt && !options.messages) {
      const result = await aiStreamText({
        model,
        prompt: options.prompt,
        system: options.system,
      });

      for await (const chunk of result.textStream) {
        yield chunk;
      }
      return;
    }

    // Use messages-based streaming
    const messages = options.messages || [];
    
    const result = await aiStreamText({
      model,
      messages,
      system: options.system,
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  } catch (error) {
    throw new Error(`Failed to stream text: ${error}`);
  }
}

// ============================================
// AI Client (High-level API)
// ============================================

export class AIClient {
  private provider: AIProvider;
  private defaultModel: string;
  private defaultSystemPrompt?: string;

  constructor(
    provider: AIProvider,
    defaultModel: string,
    defaultSystemPrompt?: string
  ) {
    this.provider = provider;
    this.defaultModel = defaultModel;
    this.defaultSystemPrompt = defaultSystemPrompt;
  }

  /**
   * Generate a response to a prompt
   */
  async generate(
    prompt: string,
    options?: Omit<AIGenerateOptions, "prompt">
  ): Promise<string> {
    const result = await generateText(
      this.provider,
      options?.model || this.defaultModel,
      {
        prompt,
        system: options?.system || this.defaultSystemPrompt,
        ...options,
      }
    );
    return result.text;
  }

  /**
   * Generate a response with conversation history
   */
  async chat(
    messages: ModelMessage[],
    options?: Omit<AIGenerateOptions, "messages">
  ): Promise<string> {
    const result = await generateText(
      this.provider,
      options?.model || this.defaultModel,
      {
        messages,
        system: options?.system || this.defaultSystemPrompt,
        ...options,
      }
    );
    return result.text;
  }

  /**
   * Stream a response
   */
  async *stream(
    prompt: string,
    options?: Omit<AIGenerateOptions, "prompt">
  ): AsyncGenerator<string> {
    yield* streamText(this.provider, options?.model || this.defaultModel, {
      prompt,
      system: options?.system || this.defaultSystemPrompt,
      ...options,
    });
  }

  /**
   * Stream a chat response
   */
  async *streamChat(
    messages: ModelMessage[],
    options?: Omit<AIGenerateOptions, "messages">
  ): AsyncGenerator<string> {
    yield* streamText(this.provider, options?.model || this.defaultModel, {
      messages,
      system: options?.system || this.defaultSystemPrompt,
      ...options,
    });
  }

  /**
   * Get the underlying provider
   */
  getProvider(): AIProvider {
    return this.provider;
  }

  /**
   * Get the default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create an AI client with default settings
 */
export function createAIClient(
  providerType: string,
  apiKey: string,
  customBaseURL?: string,
  systemPrompt?: string
): AIClient {
  const provider = createProvider(providerType, apiKey, customBaseURL);
  const defaultModel = getDefaultModel(providerType);
  return new AIClient(provider, defaultModel, systemPrompt);
}

// ============================================
// Singleton Instance
// ============================================

let defaultClient: AIClient | null = null;

export function getDefaultClient(): AIClient | null {
  return defaultClient;
}

export function setDefaultClient(client: AIClient): void {
  defaultClient = client;
}

// Re-export types from AI SDK
export type { ModelMessage };
