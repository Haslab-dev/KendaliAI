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

export interface OllamaConfig {
  endpoint?: string;
  defaultModel?: string;
  models?: string[];
}

export class OllamaProvider {
  name = "ollama";
  private endpoint: string = "http://localhost:11434";
  private defaultModel: string = "llama3";
  private availableModels: string[] = [
    "llama3",
    "llama3:8b",
    "llama3:70b",
    "mistral",
    "codellama",
    "phi3",
    "gemma",
  ];

  constructor(config?: OllamaConfig) {
    const providerConfig = config || configLoader.getProvider("ollama");

    this.endpoint =
      providerConfig?.endpoint ||
      process.env.OLLAMA_ENDPOINT ||
      "http://localhost:11434";
    this.defaultModel = providerConfig?.defaultModel || "llama3";

    if (providerConfig?.models) {
      this.availableModels = providerConfig.models;
    }
  }

  isConfigured(): boolean {
    return true; // Ollama doesn't require API key, just needs to be running
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: "GET",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`);
      if (!response.ok) return this.availableModels;

      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        return data.models.map((m: any) => m.name);
      }
      return this.availableModels;
    } catch {
      return this.availableModels;
    }
  }

  getModels(): ModelInfo[] {
    return this.availableModels.map((id) => ({
      id,
      object: "model" as const,
      created: 1700000000,
      owned_by: "ollama",
    }));
  }

  /**
   * Convert OpenAI-format request to Ollama format
   */
  private toOllamaRequest(request: ChatCompletionRequest): {
    model: string;
    messages: { role: string; content: string }[];
    stream: boolean;
    options?: {
      temperature?: number;
      top_p?: number;
      num_predict?: number;
      stop?: string[];
    };
  } {
    const messages = request.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    return {
      model: request.model || this.defaultModel,
      messages,
      stream: false,
      options: {
        temperature: request.temperature,
        top_p: request.top_p,
        num_predict: request.max_tokens,
        stop: Array.isArray(request.stop)
          ? request.stop
          : request.stop
            ? [request.stop]
            : undefined,
      },
    };
  }

  /**
   * Convert Ollama response to OpenAI format
   */
  private toOpenAIResponse(
    ollamaResponse: any,
    model: string,
  ): ChatCompletionResponse {
    return {
      id: `ollama-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: ollamaResponse.message?.content || "",
          },
          finish_reason: ollamaResponse.done ? "stop" : null,
        },
      ],
      usage: {
        prompt_tokens: ollamaResponse.prompt_eval_count || 0,
        completion_tokens: ollamaResponse.eval_count || 0,
        total_tokens:
          (ollamaResponse.prompt_eval_count || 0) +
          (ollamaResponse.eval_count || 0),
      },
    };
  }

  async chatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const model = request.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const ollamaRequest = this.toOllamaRequest(request);

      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ollamaRequest),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${error}`);
      }

      const data = await response.json();

      log.info(
        `[Ollama] Chat completion: ${model} (${Date.now() - startTime}ms)`,
      );

      return this.toOpenAIResponse(data, model);
    } catch (error) {
      log.error(`[Ollama] Chat completion error: ${error}`);
      throw error;
    }
  }

  async *streamChatCompletion(
    request: ChatCompletionRequest,
  ): AsyncGenerator<ChatCompletionStreamChunk> {
    const model = request.model || this.defaultModel;
    const completionId = `ollama-${Date.now()}`;

    const ollamaRequest = this.toOllamaRequest(request);
    ollamaRequest.stream = true;

    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
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
        if (trimmed === "") continue;

        try {
          const data = JSON.parse(trimmed);

          yield {
            id: completionId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: {
                  content: data.message?.content || "",
                },
                finish_reason: data.done ? "stop" : null,
              },
            ],
          };
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || "nomic-embed-text";
    const input = Array.isArray(request.input)
      ? request.input
      : [request.input];

    const response = await fetch(`${this.endpoint}/api/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: input.join("\n"),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      object: "list",
      data: [
        {
          object: "embedding",
          index: 0,
          embedding: data.embedding || [],
        },
      ],
      model,
      usage: {
        prompt_tokens: 0,
        total_tokens: 0,
      },
    };
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

export const ollamaProvider = new OllamaProvider();
