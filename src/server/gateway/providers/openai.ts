import { log } from "../../core";
import { configLoader } from "../../config";
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelInfo,
} from "../types";

export interface OpenAIConfig {
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
  models?: string[];
}

export class OpenAIProvider {
  name = "openai";
  private apiKey: string | null = null;
  private endpoint: string = "https://api.openai.com/v1";
  private defaultModel: string = "gpt-4o";
  private availableModels: string[] = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
    "text-embedding-ada-002",
    "text-embedding-3-small",
    "text-embedding-3-large",
  ];

  constructor(config?: OpenAIConfig) {
    // Load from config or environment
    const providerConfig = config || configLoader.getProvider("openai");

    this.apiKey = providerConfig?.apiKey || process.env.OPENAI_API_KEY || null;
    this.endpoint = providerConfig?.endpoint || "https://api.openai.com/v1";
    this.defaultModel = providerConfig?.defaultModel || "gpt-4o";

    if (providerConfig?.models) {
      this.availableModels = providerConfig.models;
    }
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  getModels(): ModelInfo[] {
    return this.availableModels.map((id) => ({
      id,
      object: "model" as const,
      created: 1700000000,
      owned_by: "openai",
    }));
  }

  async chatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const model = request.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          top_p: request.top_p,
          n: request.n,
          stream: false,
          stop: request.stop,
          max_tokens: request.max_tokens,
          presence_penalty: request.presence_penalty,
          frequency_penalty: request.frequency_penalty,
          user: request.user,
          tools: request.tools,
          tool_choice: request.tool_choice,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();

      log.info(
        `[OpenAI] Chat completion: ${model} (${Date.now() - startTime}ms)`,
      );

      return data as ChatCompletionResponse;
    } catch (error) {
      log.error(`[OpenAI] Chat completion error: ${error}`);
      throw error;
    }
  }

  async *streamChatCompletion(
    request: ChatCompletionRequest,
  ): AsyncGenerator<ChatCompletionStreamChunk> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const model = request.model || this.defaultModel;

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        top_p: request.top_p,
        n: request.n,
        stream: true,
        stop: request.stop,
        max_tokens: request.max_tokens,
        presence_penalty: request.presence_penalty,
        frequency_penalty: request.frequency_penalty,
        user: request.user,
        tools: request.tools,
        tool_choice: request.tool_choice,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "" || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const chunk = JSON.parse(data);
          yield chunk as ChatCompletionStreamChunk;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const model = request.model || "text-embedding-ada-002";

    const response = await fetch(`${this.endpoint}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: request.input,
        encoding_format: request.encoding_format || "float",
        dimensions: request.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<EmbeddingResponse>;
  }

  // Simple chat method for backward compatibility
  async chat(prompt: string, options?: { model?: string }): Promise<string> {
    const response = await this.chatCompletion({
      model: options?.model || this.defaultModel,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0]?.message?.content || "";
  }
}

export const openaiProvider = new OpenAIProvider();
