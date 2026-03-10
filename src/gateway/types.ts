/**
 * KendaliAI Gateway Types
 *
 * Type definitions for gateway configuration.
 */

export type ProviderType = "zai" | "deepseek" | "openai" | "anthropic";
export type ChannelType = "telegram" | "discord" | "whatsapp";
export type GatewayStatus = "running" | "stopped" | "error";

export interface HookConfig {
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface GatewayConfig {
  id: string;
  name: string;
  provider: {
    type: ProviderType;
    apiKey: string;
    baseURL?: string;
    model: string;
  };
  channel: {
    type: ChannelType;
    botToken: string;
    enabled?: boolean;
  };
  skills: string[];
  hooks: HookConfig[];
  createdAt: string;
  status: GatewayStatus;
}

export interface GatewayInfo {
  name: string;
  provider: string;
  channel: string;
  status: string;
}
