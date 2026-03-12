/**
 * KendaliAI Base Provider
 * 
 * Base class for OpenAI-compatible providers.
 * Implements common functionality for all providers.
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderCapabilities,
  GenerateOptions,
  GenerateResult,
  StreamChunk,
  EmbeddingOptions,
  EmbeddingResult,
  ModelInfo,
  ChatMessage,
  ToolCall,
} from './types';

// ============================================
// OpenAI-Compatible API Types
// ============================================

interface OpenAIMessage {
  role: string;
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  tools?: OpenAITool[];
  tool_choice?: string | { type: 'function'; function: { name: string } };
  response_format?: { type: string };
  seed?: number;
  user?: string;
  stream?: boolean;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: {
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================
// Base Provider Implementation
// ============================================

export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string;
  abstract readonly type: import('./types').ProviderType;
  
  protected config: ProviderConfig;
  protected baseUrl: string;
  protected defaultHeaders: Record<string, string>;
  protected initialized = false;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = config.baseURL || this.getDefaultBaseUrl();
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    
    if (config.apiKey) {
      this.defaultHeaders['Authorization'] = `Bearer ${config.apiKey}`;
    }
  }

  abstract get capabilities(): ProviderCapabilities;
  abstract getDefaultBaseUrl(): string;
  abstract getDefaultModel(): string;
  protected abstract getProviderSpecificHeaders(): Record<string, string>;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Add provider-specific headers
    this.defaultHeaders = {
      ...this.defaultHeaders,
      ...this.getProviderSpecificHeaders(),
    };
    
    this.initialized = true;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.defaultHeaders,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.defaultHeaders,
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = await response.json() as { data?: { id: string; owned_by?: string }[] };
      
      return (data.data || []).map((model) => ({
        id: model.id,
        provider: this.name,
        name: model.id,
      }));
    } catch (error) {
      console.error(`[${this.name}] Error listing models:`, error);
      return [];
    }
  }

  async getModel(modelId: string): Promise<ModelInfo | null> {
    const models = await this.listModels();
    return models.find((m) => m.id === modelId) || null;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model || this.config.defaultModel || this.getDefaultModel();
    const messages = this.buildMessages(options);
    
    const request: OpenAIRequest = {
      model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      stop: options.stopSequences,
      seed: options.seed,
      user: options.user,
    };

    if (options.tools && options.tools.length > 0) {
      request.tools = options.tools.map((t) => ({
        type: 'function' as const,
        function: t.function,
      }));
      request.tool_choice = options.toolChoice as string | { type: 'function'; function: { name: string } };
    }

    if (options.responseFormat) {
      request.response_format = options.responseFormat;
    }

    const response = await this.makeRequest('/chat/completions', request);
    const data = await response.json() as OpenAIResponse;

    return this.parseResponse(data);
  }

  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const model = options.model || this.config.defaultModel || this.getDefaultModel();
    const messages = this.buildMessages(options);

    const request: OpenAIRequest = {
      model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      stop: options.stopSequences,
      seed: options.seed,
      user: options.user,
      stream: true,
    };

    if (options.tools && options.tools.length > 0) {
      request.tools = options.tools.map((t) => ({
        type: 'function' as const,
        function: t.function,
      }));
      request.tool_choice = options.toolChoice as string | { type: 'function'; function: { name: string } };
    }

    const response = await this.makeRequest('/chat/completions', request, true);
    
    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { delta: '', done: true, finishReason: 'stop' };
            return;
          }

          try {
            const chunk = JSON.parse(data) as OpenAIStreamChunk;
            const choice = chunk.choices[0];
            
            if (!choice) continue;

            const delta = choice.delta.content || '';
            const finishReason = this.parseFinishReason(choice.finish_reason);
            
            // Handle tool calls in streaming
            let toolCalls: ToolCall[] | undefined;
            if (choice.delta.tool_calls) {
              toolCalls = choice.delta.tool_calls.map((tc) => ({
                id: tc.id || '',
                type: 'function' as const,
                function: {
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                },
              }));
            }

            yield {
              delta,
              done: finishReason !== null,
              finishReason: finishReason || undefined,
              toolCalls,
              usage: chunk.usage ? {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              } : undefined,
            };
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embed(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = options.model || this.getDefaultEmbeddingModel();
    
    const response = await this.makeRequest('/embeddings', {
      model,
      input: options.input,
      dimensions: options.dimensions,
      user: options.user,
    });

    const data = await response.json() as {
      data: { embedding: number[] }[];
      model: string;
      usage: { prompt_tokens: number; total_tokens: number };
    };

    return {
      embeddings: data.data.map((d) => d.embedding),
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }

  async dispose(): Promise<void> {
    this.initialized = false;
  }

  // ============================================
  // Protected Methods
  // ============================================

  protected buildMessages(options: GenerateOptions): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [];

    // Add system message
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }

    // Add conversation messages
    if (options.messages) {
      for (const msg of options.messages) {
        const openaiMsg: OpenAIMessage = {
          role: msg.role,
          content: msg.content,
        };
        
        if (msg.name) openaiMsg.name = msg.name;
        if (msg.functionCall) {
          openaiMsg.function_call = msg.functionCall;
        }
        if (msg.toolCalls) {
          openaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: tc.function,
          }));
        }
        if (msg.toolCallId) {
          openaiMsg.tool_call_id = msg.toolCallId;
        }
        
        messages.push(openaiMsg);
      }
    }
    // Add simple prompt
    else if (options.prompt) {
      messages.push({ role: 'user', content: options.prompt });
    }

    return messages;
  }

  protected async makeRequest(
    endpoint: string,
    body: unknown,
    stream = false
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      ...this.defaultHeaders,
    };

    if (stream) {
      headers['Accept'] = 'text/event-stream';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: this.config.timeout 
        ? AbortSignal.timeout(this.config.timeout)
        : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    return response;
  }

  protected parseResponse(data: OpenAIResponse): GenerateResult {
    const choice = data.choices[0];
    
    let toolCalls: ToolCall[] | undefined;
    if (choice.message.tool_calls) {
      toolCalls = choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      }));
    }

    return {
      text: choice.message.content || '',
      model: data.model,
      finishReason: this.parseFinishReason(choice.finish_reason),
      toolCalls,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      raw: data,
    };
  }

  protected parseFinishReason(reason: string | null): GenerateResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'unknown';
    }
  }

  protected getDefaultEmbeddingModel(): string {
    return 'text-embedding-3-small';
  }
}
