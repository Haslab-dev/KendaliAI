export interface ModelItem {
  id: string;
  name?: string;
  enabled: boolean;
}

export interface GlobalModelOption {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  providerType?: string;
  isDefault?: boolean;
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
  role?: string;
  department?: string;
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
  isSuper?: boolean;
  engine?: 'rakit' | 'acp';
  acpAgent?: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'default';
  soulStack?: {
    soul?: string;
    style?: string;
    instructions?: string;
    memory?: string;
  };
  telegramConnected?: boolean;
  telegramBot?: TelegramBotConfig;
  createdAt?: number;
  updatedAt?: number;
}

export interface ChatParticipant {
  id: string;
  chatId: string;
  participantType: 'agent' | 'user';
  participantId: string;
  role?: 'owner' | 'member';
  joinedAt?: number;
}

export interface SessionMetadata {
  mode?: 'agent' | 'chat';
  workspace?: string;
  workspaceName?: string;
  kind?: string;
  engine?: 'acp' | 'builtin';
  acpAgent?: string;
  acpSession?: string;
  model?: string;
  autoApprove?: boolean;
  [key: string]: any;
}

/** Safe metadata parse — session.metadata is a JSON string column. */
export function parseSessionMetadata(sess?: Session | null): SessionMetadata {
  if (!sess?.metadata) return {};
  try {
    return JSON.parse(sess.metadata) as SessionMetadata;
  } catch {
    return {};
  }
}

/** True when the session is an agent task (agent workspace / ACP backed). */
export function isAgentTaskSession(sess?: Session | null): boolean {
  if (!sess) return false;
  if (sess.id.startsWith('subtask_')) return false;
  if (sess.type === 'agent') return true;
  return parseSessionMetadata(sess).mode === 'agent';
}

export type AgentExecutionMode = 'ask' | 'code' | 'plan' | 'bypass';
export type AgentReasoningLevel = 'off' | 'low' | 'medium' | 'high';

export interface Session {
  id: string;
  agentId: string;
  title: string;
  type?: 'direct' | 'group' | 'general' | 'agent';
  avatar?: string;
  summary?: string;
  channelId: string;
  userId: string;
  status: string;
  pinned: boolean;
  metadata?: string;
  participants?: ChatParticipant[];
  lastMessage?: SessionMessage;
  createdAt: number;
  updatedAt: number;
}

export interface AgentGroup {
  id: string;
  name: string;
  title?: string;
  brief: string;
  avatar?: string;
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ComposioToolkit {
  slug: string;
  name: string;
  description: string;
  logoUrl?: string;
  connected: boolean;
  connectedAccountId?: string;
  status?: string;
  redirectUrl?: string;
}


export interface ToolCallRecord {
  id: string;
  tool: string;
  arguments: Record<string, any>;
  output?: string;
  status?: 'running' | 'success' | 'error' | 'denied' | 'completed' | 'failed' | string;
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
  senderType?: 'user' | 'agent' | 'routine' | 'system';
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  recipientAgentId?: string;
  content: string;
  thought?: string;
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
  tokens?: number;
  model?: string;
  ragSources?: RagSource[];
  reactions?: MessageReaction[];
  durationMs?: number;
  createdAt: number;
}

export interface MessageReaction {
  emoji: string;
  senderId: string;
  senderName?: string;
}

export interface RoutineTask {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  targetType?: 'agent' | 'group';
  targetId?: string;
  sessionId?: string;
  deliverTelegram?: boolean;
  channel?: string;
  enabled: boolean;
  createdAt?: string;
  nextRun?: string;
  lastRun?: string;
  runCount?: number;
  lastOutput?: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command: string;
  args: string[];
  url: string;
  env: Record<string, string>;
  headers?: Record<string, string>;
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
  tools?: string[];
  category?: string;
  version?: string;
  path?: string;
}

export interface PolicyRule {
  id: string;
  agentId: string;
  toolName: string;
  effect: 'ALLOW' | 'APPROVAL' | 'DENY';
  createdAt?: number;
}

export interface TelegramBotConfig {
  id?: string;
  name?: string;
  username?: string;
  token?: string;
  agentId?: string;
  model?: string;
  providerId?: string;
  enabled?: boolean;
  status?: 'running' | 'stopped' | 'error' | 'connected' | 'unlinked';
  mode?: 'direct' | 'topic_group';
  chatId?: string;
  topicId?: number;
  topicName?: string;
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

export interface BackgroundTask {
  id: string;
  sessionId: string;
  agentId: string;
  title: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  finishedAt?: number;
  error?: string;
  result?: string;
}

export interface ReminderNotification {
  id?: string;
  title: string;
  time?: string;
  triggeredAt: number;
}

export interface TelegramAuthorizedUser {
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  authMethod: 'otp' | 'admin_approval' | 'manual';
  botId?: string;
  createdAt: number;
}

export interface TelegramPendingRequest {
  userId: number;
  chatId: number;
  username: string;
  firstName: string;
  lastName: string;
  botId?: string;
  lastMessage?: string;
  createdAt: number;
}

export interface TelegramAuthStatus {
  authRequired: boolean;
  authorizedUsersCount: number;
  pendingRequestsCount: number;
}

/* ---- ACP (Agent Client Protocol) — external agent tasks ------------------ */

export interface ACPAgentDescriptor {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: string[];
  defaultModel?: string;
  supportedModels?: string[];
  available: boolean;
  acp: boolean;
}

export interface ACPSessionInfo {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  cwd: string;
  model?: string;
  status: 'idle' | 'running' | 'awaiting_permission' | 'error' | 'closed';
  autoApprove: boolean;
  acpSessionId?: string;
  promptCount: number;
  createdAt: number;
  updatedAt: number;
  running: boolean;
}

export interface ACPPermissionOption {
  optionId: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
}

export interface ACPPermissionRequest {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  title: string;
  kind: string;
  options: ACPPermissionOption[];
  createdAt: number;
}



