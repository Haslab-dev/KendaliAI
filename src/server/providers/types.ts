/**
 * KendaliAI Provider Types
 *
 * Defines the interface and types for AI providers.
 * Supports OpenAI-compatible and native providers.
 */

// ============================================
// Core Types
// ============================================

export type ProviderType =
  | "openai"
  | "deepseek"
  | "zai"
  | "anthropic"
  | "ollama"
  | "openrouter"
  | "groq"
  | "together"
  | "custom";

export interface ProviderConfig {
  /** Provider type identifier */
  type: ProviderType;
  /** API key for authentication */
  apiKey?: string;
  /** Base URL for API requests */
  baseURL?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "function" | "tool";
  content: string;
  name?: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface GenerateOptions {
  /** Model to use (overrides default) */
  model?: string;
  /** System prompt */
  system?: string;
  /** Chat messages */
  messages?: ChatMessage[];
  /** Simple prompt (alternative to messages) */
  prompt?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for randomness (0-2) */
  temperature?: number;
  /** Top-p sampling (0-1) */
  topP?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Tools/functions available */
  tools?: ToolDefinition[];
  /** Tool choice strategy */
  toolChoice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
  /** Response format */
  responseFormat?: { type: "text" | "json_object" };
  /** Seed for reproducibility */
  seed?: number;
  /** User identifier for tracking */
  user?: string;
  /** Stream response */
  stream?: boolean;
}

export interface GenerateResult {
  /** Generated text content */
  text: string;
  /** Model used */
  model: string;
  /** Finish reason */
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | "unknown";
  /** Tool calls if any */
  toolCalls?: ToolCall[];
  /** Usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Raw response from provider */
  raw?: unknown;
}

export interface StreamChunk {
  /** Chunk content */
  delta: string;
  /** Is this the final chunk */
  done: boolean;
  /** Finish reason if done */
  finishReason?:
    | "stop"
    | "length"
    | "tool_calls"
    | "content_filter"
    | "unknown";
  /** Tool calls if any */
  toolCalls?: ToolCall[];
  /** Usage statistics (usually in final chunk) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingOptions {
  /** Model to use */
  model?: string;
  /** Input text or texts */
  input: string | string[];
  /** Dimensions for embeddings (if supported) */
  dimensions?: number;
  /** User identifier */
  user?: string;
}

export interface EmbeddingResult {
  /** Embedding vectors */
  embeddings: number[][];
  /** Model used */
  model: string;
  /** Usage statistics */
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface ModelInfo {
  /** Model ID */
  id: string;
  /** Display name */
  name?: string;
  /** Model provider */
  provider: string;
  /** Context window size */
  contextWindow?: number;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Supports vision */
  supportsVision?: boolean;
  /** Supports function calling */
  supportsFunctionCalling?: boolean;
  /** Supports streaming */
  supportsStreaming?: boolean;
  /** Input cost per 1M tokens */
  inputCostPer1M?: number;
  /** Output cost per 1M tokens */
  outputCostPer1M?: number;
}

export interface ProviderCapabilities {
  /** Supports chat completions */
  chat: boolean;
  /** Supports streaming */
  streaming: boolean;
  /** Supports function/tool calling */
  functionCalling: boolean;
  /** Supports vision */
  vision: boolean;
  /** Supports embeddings */
  embeddings: boolean;
  /** Supports JSON mode */
  jsonMode: boolean;
  /** Maximum context length */
  maxContextLength: number;
}

// ============================================
// Provider Interface
// ============================================

export interface AIProvider {
  /** Provider name */
  readonly name: string;
  /** Provider type */
  readonly type: ProviderType;
  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities;

  /** Initialize the provider */
  initialize(): Promise<void>;
  /** Check if provider is healthy */
  healthCheck(): Promise<boolean>;
  /** List available models */
  listModels(): Promise<ModelInfo[]>;
  /** Get model info */
  getModel(modelId: string): Promise<ModelInfo | null>;
  /** Generate text */
  generate(options: GenerateOptions): Promise<GenerateResult>;
  /** Stream text generation */
  stream(options: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown>;
  /** Generate embeddings */
  embed(options: EmbeddingOptions): Promise<EmbeddingResult>;
  /** Dispose resources */
  dispose(): Promise<void>;
}

// ============================================
// Provider Factory
// ============================================

export interface ProviderFactory {
  /** Create a provider instance */
  create(config: ProviderConfig): AIProvider;
  /** Get provider type */
  type: ProviderType;
  /** Get provider name */
  name: string;
}

// ============================================
// Provider Events
// ============================================

export interface ProviderEvent {
  type: "initialized" | "error" | "rate_limit" | "timeout" | "disposed";
  provider: string;
  timestamp: Date;
  data?: unknown;
}

export type ProviderEventHandler = (event: ProviderEvent) => void;
