/**
 * KendaliAI Provider Types
 *
 * Type definitions for AI providers using AI SDK.
 */

import type { LanguageModel } from "ai";

export type ProviderType = "zai" | "deepseek" | "openai" | "anthropic";

export interface ModelInfo {
  id: string;
  name: string;
  type: "chat" | "embedding" | "completion";
  contextLength?: number;
  pricing?: {
    input: number; // per 1K tokens
    output: number; // per 1K tokens
  };
}

export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  finishReason?: "stop" | "length" | "content_filter";
}

export interface EmbeddingResponse {
  embedding: number[];
  usage?: {
    promptTokens: number;
  };
}

export interface ProviderInstance {
  name: string;
  type: ProviderType;
  isConfigured(): boolean;
  getModel(modelId?: string): LanguageModel;
  listModels(): ModelInfo[];
  chat(prompt: string, options?: { systemPrompt?: string }): Promise<string>;
  chatCompletion(
    messages: ChatMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<ChatCompletionResponse>;
  embeddings(input: string): Promise<EmbeddingResponse>;
}
