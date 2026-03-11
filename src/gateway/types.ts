/**
 * KendaliAI Gateway Types
 *
 * Type definitions for gateway configuration.
 */

// Re-export provider types from providers module
export type {
  ProviderType,
  ProviderConfig,
  ModelInfo,
} from "../providers/types";

export type ChannelType = "telegram" | "discord" | "whatsapp";
export type GatewayStatus = "running" | "stopped" | "error";

export interface HookConfig {
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface GatewayProviderConfig {
  type: import("../providers/types").ProviderType;
  apiKey: string;
  baseURL?: string;
  model: string;
}

export interface GatewayChannelConfig {
  type: ChannelType;
  botToken: string;
  enabled?: boolean;
}

export interface GatewayConfig {
  id: string;
  name: string;
  agentName?: string; // Custom name for the AI agent (e.g., "Anita")
  provider: GatewayProviderConfig;
  channel: GatewayChannelConfig;
  skills: string[];
  hooks: HookConfig[];
  createdAt: string;
  status: GatewayStatus;
}

export interface GatewayInfo {
  id: string;
  name: string;
  provider: string;
  channel: string;
  status: string;
}

export interface GatewayRuntime {
  config: GatewayConfig;
  provider: import("../providers/types").ProviderInstance;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): GatewayStatus;
}
