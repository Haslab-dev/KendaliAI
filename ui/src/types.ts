export interface ModelItem {
  id: string;
  name?: string;
  enabled: boolean;
}

export const isReasoningModel = (modelId?: string): boolean => {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  return (
    id.includes('reasoner') ||
    id.includes('r1') ||
    id.includes('o1') ||
    id.includes('o3') ||
    id.includes('thinking') ||
    id.includes('claude-3-7-sonnet')
  );
};

export interface ProviderConfig {
  id: string;
  name: string;
  type: string; // deepseek, openai, anthropic, ollama, custom
  apiKey: string;
  endpoint: string;
  models: ModelItem[];
  isDefault: boolean;
  enabled: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  providerId: string;
  model: string;
  systemPrompt: string;
  skills: string[];
  tools: string[];
  mcp: string[];
  memoryScopes: string[];
  policy: Record<string, string>;
  avatar: string;
  isDefault: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface Session {
  id: string;
  agentId: string;
  title: string;
  channelId: string;
  userId: string;
  status: string;
  pinned: boolean;
  metadata?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ToolCallRecord {
  id: string;
  tool: string;
  arguments: Record<string, any>;
  output?: string;
  status?: 'running' | 'success' | 'error' | 'denied';
  durationMs?: number;
}

// A document used as RAG grounding context for an assistant turn.
export interface RagSource {
  title: string;
  score?: number;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  agentId?: string;
  channel: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  thought?: string;
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
  tokens?: number;
  model?: string;
  ragSources?: RagSource[];
  createdAt: number;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  command: string;
  args: string[];
  url: string;
  env: Record<string, string>;
  enabled: boolean;
  status: string;
  toolsCached?: { name: string; description: string; schema?: string }[];
  createdAt?: number;
  updatedAt?: number;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  content?: string;
}

export interface PolicyRule {
  id: string;
  agentId: string;
  toolName: string;
  effect: 'ALLOW' | 'APPROVAL' | 'DENY';
  createdAt?: number;
}

export interface TelegramBotConfig {
  id: string;
  name: string;
  token: string;
  agentId: string;
  model?: string;
  providerId?: string;
  enabled: boolean;
  status: 'running' | 'stopped' | 'error';
  lastActiveAt?: number;
  createdAt?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  signature: string;
  category: string;
}

export interface GatewayLogEvent {
  id: string;
  type: string;
  sessionId: string;
  agentId?: string;
  channel?: 'web' | 'telegram' | 'api' | string;
  payload?: any;
  timestamp: string | number;
}

export interface EmbeddingConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  dimensions: number;
  enabled: boolean;
  updatedAt?: number;
}

export interface DocumentItem {
  id: string;
  sessionId?: string;
  title: string;
  source?: string;
  content?: string;
  charCount: number;
  chunkCount: number;
  createdAt: number;
}


