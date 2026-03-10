// Configuration types for KendaliAI

export interface ProviderConfig {
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
  models?: string[];
  [key: string]: unknown;
}

export interface ToolPermissionConfig {
  [toolName: string]: "allowed" | "restricted" | "disabled";
}

export interface SecurityConfig {
  apiKeysEnabled?: boolean;
  localLoginEnabled?: boolean;
  sessionSecret?: string;
  tokenExpiry?: string;
}

export interface RoutingConfig {
  mode?: "static" | "latency" | "cost" | "fallback";
  fallbackChain?: string[];
}

export interface LoggingConfig {
  level?: "debug" | "info" | "warn" | "error";
  file?: string;
  console?: boolean;
}

export interface KendaliAIConfig {
  // AI Providers configuration
  providers?: {
    openai?: ProviderConfig;
    anthropic?: ProviderConfig;
    ollama?: ProviderConfig;
    vllm?: ProviderConfig;
    [key: string]: ProviderConfig | undefined;
  };

  // Plugins to load
  plugins?: string[];

  // Tool permissions
  tools?: ToolPermissionConfig;

  // Security settings
  security?: SecurityConfig;

  // AI routing configuration
  routing?: RoutingConfig;

  // Logging configuration
  logging?: LoggingConfig;

  // Database configuration
  database?: {
    url?: string;
  };

  // Server configuration
  server?: {
    port?: number;
    host?: string;
  };

  // Workflow configuration
  workflows?: {
    maxConcurrentRuns?: number;
    defaultTimeout?: number;
  };
}

export function defineConfig(config: KendaliAIConfig): KendaliAIConfig {
  return config;
}
