/**
 * KendaliAI Channel Types
 * 
 * Defines the interface and types for messaging channels.
 * Supports Telegram, Discord, Slack, and Webhook channels.
 */

// ============================================
// Core Types
// ============================================

export type ChannelType = 'telegram' | 'discord' | 'slack' | 'webhook' | 'whatsapp';

export type ChannelStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface ChannelConfig {
  /** Channel type identifier */
  type: ChannelType;
  /** Unique channel name/identifier */
  name: string;
  /** Bot token or API key */
  token?: string;
  /** Additional authentication */
  apiKey?: string;
  /** Webhook URL (for incoming messages) */
  webhookUrl?: string;
  /** Bot user ID */
  botId?: string;
  /** Default chat/channel ID */
  defaultChatId?: string;
  /** Enabled flag */
  enabled?: boolean;
  /** Channel-specific options */
  options?: Record<string, unknown>;
}

// ============================================
// Message Types
// ============================================

export interface ChannelMessage {
  /** Unique message ID */
  id: string;
  /** Channel type */
  channelType: ChannelType;
  /** Channel/Chat ID */
  chatId: string;
  /** Sender user ID */
  userId: string;
  /** Sender username */
  username?: string;
  /** Sender display name */
  displayName?: string;
  /** Message text content */
  text: string;
  /** Message timestamp */
  timestamp: Date;
  /** Reply to message ID */
  replyTo?: string;
  /** Attachments */
  attachments?: MessageAttachment[];
  /** Raw message data */
  raw?: unknown;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface MessageAttachment {
  /** Attachment type */
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact';
  /** File URL */
  url?: string;
  /** File path (for local files) */
  path?: string;
  /** File name */
  filename?: string;
  /** MIME type */
  mimeType?: string;
  /** File size in bytes */
  size?: number;
  /** Caption */
  caption?: string;
  /** Thumbnail URL */
  thumbnailUrl?: string;
  /** Additional data */
  data?: Record<string, unknown>;
}

export interface SendMessageOptions {
  /** Chat/Channel ID */
  chatId?: string;
  /** Reply to message ID */
  replyTo?: string;
  /** Parse mode */
  parseMode?: 'text' | 'markdown' | 'html';
  /** Disable notification */
  silent?: boolean;
  /** Attachments */
  attachments?: MessageAttachment[];
  /** Inline keyboard/buttons */
  keyboard?: InlineKeyboard;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface InlineKeyboard {
  /** Keyboard buttons */
  buttons: InlineKeyboardButton[][];
  /** One-time keyboard */
  oneTime?: boolean;
  /** Resize keyboard */
  resize?: boolean;
}

export interface InlineKeyboardButton {
  /** Button text */
  text: string;
  /** Callback data */
  callbackData?: string;
  /** URL */
  url?: string;
}

export interface EditMessageOptions {
  /** New text */
  text: string;
  /** Parse mode */
  parseMode?: 'text' | 'markdown' | 'html';
  /** Inline keyboard */
  keyboard?: InlineKeyboard;
}

export interface DeleteMessageOptions {
  /** Revoke (delete for everyone) */
  revoke?: boolean;
}

// ============================================
// Channel Events
// ============================================

export interface ChannelEvent {
  /** Event type */
  type: ChannelEventType;
  /** Channel name */
  channel: string;
  /** Channel type */
  channelType: ChannelType;
  /** Event timestamp */
  timestamp: Date;
  /** Event data */
  data?: unknown;
}

export type ChannelEventType =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'message_received'
  | 'message_sent'
  | 'message_edited'
  | 'message_deleted'
  | 'user_joined'
  | 'user_left'
  | 'callback_query'
  | 'command';

export interface CallbackQuery {
  /** Query ID */
  id: string;
  /** Message that triggered the callback */
  message?: ChannelMessage;
  /** Callback data */
  data: string;
  /** User who triggered */
  userId: string;
  /** Username */
  username?: string;
  /** Chat ID */
  chatId: string;
}

export interface CommandContext {
  /** Command name */
  command: string;
  /** Command arguments */
  args: string[];
  /** Full message */
  message: ChannelMessage;
  /** Channel instance */
  channel: Channel;
}

// ============================================
// Channel Interface
// ============================================

export interface Channel {
  /** Channel name */
  readonly name: string;
  /** Channel type */
  readonly type: ChannelType;
  /** Channel status */
  readonly status: ChannelStatus;
  /** Channel config */
  readonly config: ChannelConfig;
  
  /** Initialize the channel */
  initialize(): Promise<void>;
  /** Connect to the channel */
  connect(): Promise<void>;
  /** Disconnect from the channel */
  disconnect(): Promise<void>;
  /** Check if channel is healthy */
  healthCheck(): Promise<boolean>;
  /** Send a message */
  sendMessage(text: string, options?: SendMessageOptions): Promise<ChannelMessage>;
  /** Edit a message */
  editMessage(messageId: string, options: EditMessageOptions): Promise<ChannelMessage>;
  /** Delete a message */
  deleteMessage(messageId: string, options?: DeleteMessageOptions): Promise<boolean>;
  /** Get chat info */
  getChatInfo(chatId: string): Promise<ChatInfo>;
  /** Get user info */
  getUserInfo(userId: string): Promise<UserInfo>;
  /** Set typing indicator */
  setTyping(chatId: string): Promise<void>;
  /** Register command handler */
  onCommand(command: string, handler: (ctx: CommandContext) => Promise<void>): void;
  /** Register message handler */
  onMessage(handler: (message: ChannelMessage) => Promise<void>): void;
  /** Register callback handler */
  onCallback(handler: (query: CallbackQuery) => Promise<void>): void;
  /** Add event handler */
  addEventHandler(handler: ChannelEventHandler): void;
  /** Remove event handler */
  removeEventHandler(handler: ChannelEventHandler): void;
  /** Dispose resources */
  dispose(): Promise<void>;
}

// ============================================
// Info Types
// ============================================

export interface ChatInfo {
  /** Chat ID */
  id: string;
  /** Chat type */
  type: 'private' | 'group' | 'supergroup' | 'channel';
  /** Chat title */
  title?: string;
  /** Chat username */
  username?: string;
  /** Member count */
  memberCount?: number;
  /** Chat description */
  description?: string;
  /** Chat photo URL */
  photoUrl?: string;
}

export interface UserInfo {
  /** User ID */
  id: string;
  /** Username */
  username?: string;
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Display name */
  displayName?: string;
  /** Profile photo URL */
  photoUrl?: string;
  /** Is bot */
  isBot?: boolean;
  /** Language code */
  languageCode?: string;
}

// ============================================
// Channel Factory
// ============================================

export interface ChannelFactory {
  /** Create a channel instance */
  create(config: ChannelConfig): Channel;
  /** Get channel type */
  type: ChannelType;
  /** Get channel name */
  name: string;
}

// ============================================
// Channel Manager Types
// ============================================

export interface ChannelBinding {
  /** Binding ID */
  id: string;
  /** Gateway name */
  gateway: string;
  /** Channel name */
  channel: string;
  /** Routing mode */
  routingMode: 'prefix' | 'keyword' | 'interactive' | 'broadcast' | 'round-robin';
  /** Routing prefix (for prefix mode) */
  prefix?: string;
  /** Routing keywords (for keyword mode) */
  keywords?: string[];
  /** Is default gateway */
  isDefault?: boolean;
  /** Enabled flag */
  enabled: boolean;
}

export type ChannelEventHandler = (event: ChannelEvent) => void;
