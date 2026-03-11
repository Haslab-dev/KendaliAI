/**
 * KendaliAI ZAI (Zhipu AI) Provider
 *
 * ZAI provider implementation using AI SDK with OpenAI-compatible mode.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, embedMany } from "ai";
import type {
  ProviderInstance,
  ModelInfo,
  ChatMessage,
  ChatCompletionResponse,
  EmbeddingResponse,
} from "./types";

// ZAI (Zhipu AI) models
const ZAI_MODELS: ModelInfo[] = [
  {
    id: "glm-5",
    name: "GLM-5",
    type: "chat",
    contextLength: 128000,
    pricing: { input: 1.0, output: 0.2 },
  },
  {
    id: "glm-5-code",
    name: "GLM-5 Code",
    type: "chat",
    contextLength: 128000,
    pricing: { input: 1.2, output: 0.3 },
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    type: "chat",
    contextLength: 128000,
    pricing: { input: 0.6, output: 0.11 },
  },
  {
    id: "glm-4.7-flashx",
    name: "GLM-4.7 FlashX",
    type: "chat",
    contextLength: 128000,
    pricing: { input: 0.07, output: 0.01 },
  },
];

export interface ZaiConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
}

/**
 * Create a ZAI provider instance using OpenAI-compatible mode
 */
export function createZaiProvider(config: ZaiConfig): ProviderInstance {
  const apiKey = config.apiKey;
  const baseURL = config.baseURL || "https://api.z.ai/api/paas/v4";
  const defaultModel = config.defaultModel || "glm-4.7-flashx";

  // Create OpenAI-compatible client for ZAI
  const zai = createOpenAICompatible({
    name: "zai",
    apiKey,
    baseURL,
  });

  return {
    name: "zai",
    type: "zai",

    isConfigured(): boolean {
      return Boolean(apiKey && apiKey.length > 0);
    },

    getModel(modelId?: string) {
      return zai(modelId || defaultModel);
    },

    listModels(): ModelInfo[] {
      return ZAI_MODELS;
    },

    async chat(
      prompt: string,
      options?: { systemPrompt?: string },
    ): Promise<string> {
      const model = zai(defaultModel);
      const messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [];

      if (options?.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      const result = await generateText({
        model,
        messages,
      });

      return result.text;
    },

    async chatCompletion(
      messages: ChatMessage[],
      options?: { temperature?: number; maxTokens?: number },
    ): Promise<ChatCompletionResponse> {
      const model = zai(defaultModel);

      const result = await generateText({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
      });

      return {
        content: result.text,
        usage: {
          promptTokens: result.usage?.inputTokens ?? 0,
          completionTokens: result.usage?.outputTokens ?? 0,
        },
        finishReason: result.finishReason as
          | "stop"
          | "length"
          | "content_filter"
          | undefined,
      };
    },

    async embeddings(input: string): Promise<EmbeddingResponse> {
      const embeddingModel = zai.textEmbeddingModel("text-embedding-3-small");

      const result = await embedMany({
        model: embeddingModel,
        values: [input],
      });

      return {
        embedding: result.embeddings[0] ?? [],
        usage: {
          promptTokens: result.usage?.tokens ?? 0,
        },
      };
    },
  };
}

/**
 * Default ZAI provider (unconfigured)
 */
export const zaiProvider: ProviderInstance = {
  name: "zai",
  type: "zai",

  isConfigured(): boolean {
    return false;
  },

  getModel(): never {
    throw new Error("ZAI provider not configured. Please set ZAI_API_KEY.");
  },

  listModels(): ModelInfo[] {
    return ZAI_MODELS;
  },

  async chat(): Promise<never> {
    throw new Error("ZAI provider not configured. Please set ZAI_API_KEY.");
  },

  async chatCompletion(): Promise<never> {
    throw new Error("ZAI provider not configured. Please set ZAI_API_KEY.");
  },

  async embeddings(): Promise<never> {
    throw new Error("ZAI provider not configured. Please set ZAI_API_KEY.");
  },
};
