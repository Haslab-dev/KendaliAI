/**
 * KendaliAI Trait-Based Architecture - ZeroClaw Style
 *
 * All subsystems are traits - swap implementations with config change, zero code changes.
 *
 * Traits:
 * - Provider: AI model providers
 * - Channel: Messaging channels
 * - Tool: Executable tools
 * - Memory: Memory/storage backends
 * - Tunnel: Tunnel providers
 * - Observer: Observability/monitoring
 */

// ============================================
// PROVIDER TRAIT
// ============================================

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export interface ProviderToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ProviderResponse {
  id: string;
  model: string;
  content: string | null;
  toolCalls?: ProviderToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: "stop" | "tool_calls" | "length" | "error";
  latencyMs?: number;
}

export interface ProviderStreamChunk {
  id: string;
  model: string;
  delta: {
    content?: string;
    toolCalls?: ProviderToolCall[];
  };
  finishReason?: "stop" | "tool_calls" | "length" | "error";
}

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface ProviderTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Provider trait - AI model providers
 */
export interface Provider {
  /** Provider identifier */
  readonly id: string;

  /** Provider display name */
  readonly name: string;

  /** List available models */
  listModels(): Promise<string[]>;

  /** Check if provider is available */
  isAvailable(): Promise<boolean>;

  /** Send a chat completion request */
  chat(
    messages: ProviderMessage[],
    config: ProviderConfig,
    tools?: ProviderTool[],
  ): Promise<ProviderResponse>;

  /** Stream a chat completion request */
  chatStream?(
    messages: ProviderMessage[],
    config: ProviderConfig,
    tools?: ProviderTool[],
  ): AsyncGenerator<ProviderStreamChunk>;

  /** Generate embeddings */
  embed?(texts: string[], model?: string): Promise<number[][]>;
}

// ============================================
// CHANNEL TRAIT
// ============================================

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName?: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ChannelSendMessage {
  content: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelConfig {
  enabled: boolean;
  allowedUsers: string[]; // Empty = deny all, ["*"] = allow all
}

export interface ChannelAttachment {
  type: "image" | "document" | "video" | "audio" | "voice";
  path: string; // Local path or URL
  caption?: string;
}

/**
 * Channel trait - Messaging channels
 */
export interface Channel {
  /** Channel identifier */
  readonly id: string;

  /** Channel type */
  readonly type: string;

  /** Channel display name */
  readonly name: string;

  /** Start the channel */
  start(): Promise<void>;

  /** Stop the channel */
  stop(): Promise<void>;

  /** Check if channel is running */
  isRunning(): boolean;

  /** Send a message */
  send(message: ChannelSendMessage): Promise<void>;

  /** Send message with attachment */
  sendWithAttachment?(
    message: ChannelSendMessage,
    attachment: ChannelAttachment,
  ): Promise<void>;

  /** Set message handler */
  onMessage(handler: (message: ChannelMessage) => Promise<void>): void;

  /** Get channel status */
  getStatus(): ChannelStatus;
}

export interface ChannelStatus {
  running: boolean;
  connected: boolean;
  lastMessageAt?: Date;
  error?: string;
}

// ============================================
// TOOL TRAIT
// ============================================

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }
  >;
  required?: string[];
}

export interface ToolPermission {
  level: "allowed" | "restricted" | "forbidden";
  requiresConfirmation: boolean;
  allowedInSandbox: boolean;
}

/**
 * Tool trait - Executable tools
 */
export interface Tool {
  /** Tool identifier */
  readonly id: string;

  /** Tool name (for LLM) */
  readonly name: string;

  /** Tool description (for LLM) */
  readonly description: string;

  /** Input schema */
  readonly schema: ToolSchema;

  /** Permission level */
  readonly permission: ToolPermission;

  /** Execute the tool */
  execute(input: ToolInput): Promise<ToolResult>;

  /** Validate input against schema */
  validate(input: ToolInput): { valid: boolean; errors?: string[] };
}

// ============================================
// MEMORY TRAIT
// ============================================

export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  source?: string;
  importance?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  searchType: "vector" | "keyword" | "hybrid";
}

export interface MemoryConfig {
  backend: "sqlite" | "markdown" | "none";
  embeddingProvider: "openai" | "none" | "custom";
  vectorWeight: number;
  keywordWeight: number;
  maxResults: number;
}

/**
 * Memory trait - Memory/storage backends
 */
export interface Memory {
  /** Memory backend identifier */
  readonly id: string;

  /** Initialize memory backend */
  init(): Promise<void>;

  /** Store a memory */
  store(content: string, metadata?: Record<string, unknown>): Promise<string>;

  /** Recall memories (hybrid search) */
  recall(query: string, limit?: number): Promise<MemorySearchResult[]>;

  /** Search by vector similarity */
  searchVector(
    embedding: number[],
    limit?: number,
  ): Promise<MemorySearchResult[]>;

  /** Search by keyword (FTS) */
  searchKeyword(query: string, limit?: number): Promise<MemorySearchResult[]>;

  /** Get memory by ID */
  get(id: string): Promise<MemoryEntry | null>;

  /** Delete memory by ID */
  delete(id: string): Promise<void>;

  /** Clear all memories */
  clear(): Promise<void>;

  /** Get memory count */
  count(): Promise<number>;
}

// ============================================
// TUNNEL TRAIT
// ============================================

export interface TunnelStatus {
  running: boolean;
  publicUrl?: string;
  error?: string;
}

export interface TunnelConfig {
  provider: "none" | "cloudflare" | "tailscale" | "ngrok" | "custom";
  port: number;
  customUrl?: string;
}

/**
 * Tunnel trait - Tunnel providers
 */
export interface Tunnel {
  /** Tunnel provider identifier */
  readonly id: string;

  /** Provider name */
  readonly name: string;

  /** Start the tunnel */
  start(config: TunnelConfig): Promise<TunnelStatus>;

  /** Stop the tunnel */
  stop(): Promise<void>;

  /** Get tunnel status */
  getStatus(): TunnelStatus;
}

// ============================================
// OBSERVER TRAIT
// ============================================

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  type: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
  correlationId?: string;
}

/**
 * Observer trait - Observability/monitoring
 */
export interface Observer {
  /** Observer identifier */
  readonly id: string;

  /** Log an event */
  log(entry: LogEntry): void;

  /** Log debug */
  debug(type: string, message: string, data?: Record<string, unknown>): void;

  /** Log info */
  info(type: string, message: string, data?: Record<string, unknown>): void;

  /** Log warning */
  warn(type: string, message: string, data?: Record<string, unknown>): void;

  /** Log error */
  error(type: string, message: string, data?: Record<string, unknown>): void;

  /** Get recent logs */
  getLogs?(limit?: number, level?: string): LogEntry[];
}

// ============================================
// REGISTRY INTERFACES
// ============================================

export interface ProviderRegistry {
  register(provider: Provider): void;
  get(id: string): Provider | undefined;
  list(): Provider[];
  getDefault(): Provider | undefined;
}

export interface ChannelRegistry {
  register(channel: Channel): void;
  get(id: string): Channel | undefined;
  list(): Channel[];
  getByType(type: string): Channel[];
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(id: string): Tool | undefined;
  getByName(name: string): Tool | undefined;
  list(): Tool[];
  listByCategory(category: string): Tool[];
}

export interface MemoryRegistry {
  register(memory: Memory): void;
  get(id: string): Memory | undefined;
  getDefault(): Memory | undefined;
}

export interface TunnelRegistry {
  register(tunnel: Tunnel): void;
  get(id: string): Tunnel | undefined;
  list(): Tunnel[];
}

export interface ObserverRegistry {
  register(observer: Observer): void;
  get(id: string): Observer | undefined;
  getDefault(): Observer | undefined;
}
