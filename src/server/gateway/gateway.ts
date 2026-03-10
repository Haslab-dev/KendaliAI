import { randomUUID } from "crypto";
import { log } from "../core";
import { dbManager } from "../database";
import { cache, aiUsage, gateways } from "../database/schema";
import { eq, and, gt } from "drizzle-orm";
import { configLoader } from "../config";
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelInfo,
  ModelsResponse,
  UsageRecord,
} from "./types";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { OllamaProvider } from "./providers/ollama";

export interface Provider {
  name: string;
  isConfigured(): boolean;
  getModels(): ModelInfo[];
  chatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse>;
  streamChatCompletion?(
    request: ChatCompletionRequest,
  ): AsyncGenerator<ChatCompletionStreamChunk>;
  embeddings?(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  chat(prompt: string, options?: any): Promise<string>;
}

// Pricing per 1K tokens (approximate)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },
  llama3: { input: 0, output: 0 }, // Local, free
  "llama3:8b": { input: 0, output: 0 },
  mistral: { input: 0, output: 0 },
};

export class AIGateway {
  private providers: Map<string, Provider> = new Map();
  private modelToProvider: Map<string, string> = new Map();
  private cacheEnabled: boolean = true;
  private cacheTTL: number = 3600000; // 1 hour in ms

  constructor() {
    // Register default providers
    this.register(new OpenAIProvider());
    this.register(new AnthropicProvider());
    this.register(new OllamaProvider());
  }

  /**
   * Register a provider
   */
  register(provider: Provider): void {
    this.providers.set(provider.name, provider);

    // Build model to provider mapping
    const models = provider.getModels();
    for (const model of models) {
      this.modelToProvider.set(model.id, provider.name);
    }

    log.info(
      `[AIGateway] Registered provider: ${provider.name} (${models.length} models)`,
    );
  }

  /**
   * Get all registered providers
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider for a model
   */
  getProviderForModel(model: string): Provider | undefined {
    // Check exact match first
    let providerName = this.modelToProvider.get(model);

    // Check for prefix match (e.g., "llama3:70b" matches "llama3")
    if (!providerName) {
      for (const [modelId, provider] of this.modelToProvider) {
        if (
          model.startsWith(modelId) ||
          modelId.startsWith(model.split(":")[0])
        ) {
          providerName = provider;
          break;
        }
      }
    }

    return providerName ? this.providers.get(providerName) : undefined;
  }

  /**
   * Get all available models
   */
  async listModels(): Promise<ModelsResponse> {
    const models: ModelInfo[] = [];

    for (const provider of this.providers.values()) {
      if (provider.isConfigured()) {
        models.push(...provider.getModels());
      }
    }

    return {
      object: "list",
      data: models,
    };
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(request: ChatCompletionRequest): string {
    const data = JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
    });
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(data);
    return hasher.digest("hex");
  }

  /**
   * Get cached response
   */
  private async getCached(key: string): Promise<ChatCompletionResponse | null> {
    if (!this.cacheEnabled) return null;

    try {
      const result = await dbManager.db
        .select()
        .from(cache)
        .where(
          and(
            eq(cache.key, key),
            gt(cache.expiresAt, new Date().toISOString()),
          ),
        )
        .limit(1);

      if (result.length > 0) {
        // Update hit count
        await dbManager.db
          .update(cache)
          .set({ hits: result[0].hits + 1 })
          .where(eq(cache.key, key));

        return JSON.parse(result[0].value);
      }
    } catch (error) {
      log.warn(`[AIGateway] Cache read error: ${error}`);
    }

    return null;
  }

  /**
   * Set cached response
   */
  private async setCached(
    key: string,
    response: ChatCompletionResponse,
  ): Promise<void> {
    if (!this.cacheEnabled) return;

    try {
      const expiresAt = new Date(Date.now() + this.cacheTTL).toISOString();

      await dbManager.db
        .insert(cache)
        .values({
          key,
          value: JSON.stringify(response),
          expiresAt,
        })
        .onConflictDoUpdate({
          target: cache.key,
          set: {
            value: JSON.stringify(response),
            expiresAt,
            hits: 0,
          },
        });
    } catch (error) {
      log.warn(`[AIGateway] Cache write error: ${error}`);
    }
  }

  /**
   * Record usage to database
   */
  private async recordUsage(
    record: UsageRecord,
    requestId?: string,
    agentId?: string,
  ): Promise<void> {
    try {
      await dbManager.db.insert(aiUsage).values({
        provider: record.provider,
        model: record.model,
        requestId,
        tokensIn: record.tokensIn,
        tokensOut: record.tokensOut,
        totalTokens: record.tokensIn + record.tokensOut,
        cost: record.cost.toString(),
        latencyMs: record.latencyMs,
        status: record.status,
        errorMessage: record.errorMessage,
        agentId,
      });
    } catch (error) {
      log.warn(`[AIGateway] Usage recording error: ${error}`);
    }
  }

  /**
   * Calculate cost for request
   */
  private calculateCost(
    model: string,
    tokensIn: number,
    tokensOut: number,
  ): number {
    const pricing = MODEL_PRICING[model] || { input: 0, output: 0 };
    return (
      (tokensIn / 1000) * pricing.input + (tokensOut / 1000) * pricing.output
    );
  }

  /**
   * Chat completion with caching, routing, and usage tracking
   */
  async chatCompletion(
    request: ChatCompletionRequest,
    options?: { agentId?: string; skipCache?: boolean },
  ): Promise<ChatCompletionResponse> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const model = request.model;

    // Check cache first
    if (!options?.skipCache && !request.stream) {
      const cacheKey = this.getCacheKey(request);
      const cached = await this.getCached(cacheKey);
      if (cached) {
        log.info(`[AIGateway] Cache hit for model ${model}`);
        return cached;
      }
    }

    // Get provider for model
    let provider = this.getProviderForModel(model);

    // Fallback to default provider if model not found
    if (!provider) {
      const config = configLoader.get();
      const defaultProvider = config.routing?.fallbackChain?.[0] || "openai";
      provider = this.providers.get(defaultProvider);

      if (!provider) {
        throw new Error(`No provider available for model: ${model}`);
      }

      log.warn(
        `[AIGateway] Model ${model} not found, using fallback provider: ${provider.name}`,
      );
    }

    // Check if provider is configured
    if (!provider.isConfigured()) {
      // Try fallback providers
      const config = configLoader.get();
      const fallbackChain = config.routing?.fallbackChain || [
        "openai",
        "anthropic",
        "ollama",
      ];

      for (const fallbackName of fallbackChain) {
        const fallback = this.providers.get(fallbackName);
        if (fallback && fallback.isConfigured()) {
          log.info(`[AIGateway] Falling back to ${fallbackName}`);
          provider = fallback;
          break;
        }
      }

      if (!provider.isConfigured()) {
        throw new Error(`Provider ${provider.name} is not configured`);
      }
    }

    try {
      const response = await provider.chatCompletion(request);
      const latencyMs = Date.now() - startTime;

      // Record usage
      const usage: UsageRecord = {
        provider: provider.name,
        model,
        tokensIn: response.usage?.prompt_tokens || 0,
        tokensOut: response.usage?.completion_tokens || 0,
        cost: this.calculateCost(
          model,
          response.usage?.prompt_tokens || 0,
          response.usage?.completion_tokens || 0,
        ),
        latencyMs,
        status: "success",
      };

      await this.recordUsage(usage, requestId, options?.agentId);

      // Cache response
      if (!request.stream) {
        const cacheKey = this.getCacheKey(request);
        await this.setCached(cacheKey, response);
      }

      log.info(
        `[AIGateway] Chat completion: ${model} via ${provider.name} (${latencyMs}ms, ${usage.tokensIn}+${usage.tokensOut} tokens)`,
      );

      return response;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      // Record error
      await this.recordUsage(
        {
          provider: provider.name,
          model,
          tokensIn: 0,
          tokensOut: 0,
          cost: 0,
          latencyMs,
          status: "error",
          errorMessage: error.message,
        },
        requestId,
        options?.agentId,
      );

      throw error;
    }
  }

  /**
   * Streaming chat completion
   */
  async *streamChatCompletion(
    request: ChatCompletionRequest,
    options?: { agentId?: string },
  ): AsyncGenerator<ChatCompletionStreamChunk> {
    const provider = this.getProviderForModel(request.model);

    if (!provider) {
      throw new Error(`No provider available for model: ${request.model}`);
    }

    if (!provider.streamChatCompletion) {
      throw new Error(`Provider ${provider.name} does not support streaming`);
    }

    if (!provider.isConfigured()) {
      throw new Error(`Provider ${provider.name} is not configured`);
    }

    log.info(
      `[AIGateway] Starting stream: ${request.model} via ${provider.name}`,
    );

    yield* provider.streamChatCompletion(request);
  }

  /**
   * Embeddings
   */
  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const provider = this.getProviderForModel(request.model);

    if (!provider) {
      throw new Error(`No provider available for model: ${request.model}`);
    }

    if (!provider.embeddings) {
      throw new Error(`Provider ${provider.name} does not support embeddings`);
    }

    if (!provider.isConfigured()) {
      throw new Error(`Provider ${provider.name} is not configured`);
    }

    log.info(`[AIGateway] Embeddings: ${request.model} via ${provider.name}`);

    return provider.embeddings(request);
  }

  /**
   * Simple chat for backward compatibility
   */
  async chat(
    providerName: string,
    prompt: string,
    options?: any,
  ): Promise<string> {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    return provider.chat(prompt, options);
  }

  /**
   * Get gateway stats
   */
  async getStats(): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    providerStats: Record<
      string,
      { requests: number; tokens: number; cost: number }
    >;
  }> {
    // This would query the ai_usage table for stats
    // Simplified implementation
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      providerStats: {},
    };
  }
}

export const gateway = new AIGateway();
