import { log } from "../../core";
import { configLoader } from "../../config";
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStreamChunk,
  ModelInfo,
} from "../types";

export interface AnthropicConfig {
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
  models?: string[];
}

export class AnthropicProvider {
  name = "anthropic";
  private apiKey: string | null = null;
  private endpoint: string = "https://api.anthropic.com/v1";
  private defaultModel: string = "claude-sonnet-4-20250514";
  private availableModels: string[] = [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-haiku-20240307",
  ];

  constructor(config?: AnthropicConfig) {
    const providerConfig = config || configLoader.getProvider("anthropic");

    this.apiKey =
      providerConfig?.apiKey || process.env.ANTHROPIC_API_KEY || null;
    this.endpoint = providerConfig?.endpoint || "https://api.anthropic.com/v1";
    this.defaultModel =
      providerConfig?.defaultModel || "claude-sonnet-4-20250514";

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
      owned_by: "anthropic",
    }));
  }

  /**
   * Convert OpenAI-format request to Anthropic format
   */
  private toAnthropicRequest(request: ChatCompletionRequest): {
    model: string;
    max_tokens: number;
    messages: { role: string; content: string }[];
    system?: string;
  } {
    const messages: { role: string; content: string }[] = [];
    let system: string | undefined;

    for (const msg of request.messages) {
      if (msg.role === "system") {
        system = msg.content;
      } else {
        messages.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content,
        });
      }
    }

    return {
      model: request.model || this.defaultModel,
      max_tokens: request.max_tokens || 4096,
      messages,
      system,
    };
  }

  /**
   * Convert Anthropic response to OpenAI format
   */
  private toOpenAIResponse(
    anthropicResponse: any,
    model: string,
  ): ChatCompletionResponse {
    return {
      id: `anthropic-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: anthropicResponse.content[0]?.text || "",
          },
          finish_reason:
            anthropicResponse.stop_reason === "end_turn" ? "stop" : "length",
        },
      ],
      usage: {
        prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
        completion_tokens: anthropicResponse.usage?.output_tokens || 0,
        total_tokens:
          (anthropicResponse.usage?.input_tokens || 0) +
          (anthropicResponse.usage?.output_tokens || 0),
      },
    };
  }

  async chatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key not configured");
    }

    const model = request.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const anthropicRequest = this.toAnthropicRequest(request);

      const response = await fetch(`${this.endpoint}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          ...anthropicRequest,
          temperature: request.temperature,
          top_p: request.top_p,
          stop_sequences: Array.isArray(request.stop)
            ? request.stop
            : request.stop
              ? [request.stop]
              : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = await response.json();

      log.info(
        `[Anthropic] Chat completion: ${model} (${Date.now() - startTime}ms)`,
      );

      return this.toOpenAIResponse(data, model);
    } catch (error) {
      log.error(`[Anthropic] Chat completion error: ${error}`);
      throw error;
    }
  }

  async *streamChatCompletion(
    request: ChatCompletionRequest,
  ): AsyncGenerator<ChatCompletionStreamChunk> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key not configured");
    }

    const anthropicRequest = this.toAnthropicRequest(request);
    const model = request.model || this.defaultModel;
    const completionId = `anthropic-${Date.now()}`;

    const response = await fetch(`${this.endpoint}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        ...anthropicRequest,
        stream: true,
        temperature: request.temperature,
        top_p: request.top_p,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
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

        try {
          const event = JSON.parse(data);

          if (event.type === "content_block_delta") {
            yield {
              id: completionId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: event.delta?.text || "",
                  },
                  finish_reason: null,
                },
              ],
            };
          } else if (event.type === "message_stop") {
            yield {
              id: completionId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            };
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
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

export const anthropicProvider = new AnthropicProvider();
