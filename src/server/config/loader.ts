import { existsSync } from "fs";
import { join } from "path";
import { log } from "../core";
import { defaultConfig } from "./defaults";
import { KendaliAIConfig, ProviderConfig } from "./types";

class ConfigLoader {
  private config: KendaliAIConfig;
  private configPath: string | null = null;

  constructor() {
    this.config = JSON.parse(JSON.stringify(defaultConfig));
  }

  /**
   * Load configuration from kendaliai.config.ts
   */
  async load(configPath?: string): Promise<KendaliAIConfig> {
    const possiblePaths = [
      configPath,
      join(process.cwd(), "kendaliai.config.ts"),
      join(process.cwd(), "kendaliai.config.js"),
    ].filter(Boolean) as string[];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        this.configPath = path;
        break;
      }
    }

    if (this.configPath) {
      try {
        log.info(`[Config] Loading configuration from ${this.configPath}`);

        // Dynamic import for config file
        const imported = await import(this.configPath);
        const userConfig = imported.default || imported.config || imported;

        if (typeof userConfig === "object") {
          this.config = this.mergeConfig(
            this.config as unknown as Record<string, unknown>,
            userConfig as Record<string, unknown>,
          );
          log.info("[Config] Configuration loaded successfully");
        }
      } catch (error) {
        log.warn(`[Config] Failed to load config file: ${error}`);
        log.info("[Config] Using default configuration");
      }
    } else {
      log.info("[Config] No config file found, using defaults");
    }

    // Override with environment variables
    this.loadFromEnv();

    return this.config;
  }

  /**
   * Deep merge user config with defaults
   */
  private mergeConfig(
    defaults: Record<string, unknown>,
    user: Record<string, unknown>,
  ): KendaliAIConfig {
    const result = { ...defaults };

    for (const key of Object.keys(user)) {
      if (user[key] !== undefined) {
        if (
          defaults[key] !== null &&
          typeof defaults[key] === "object" &&
          !Array.isArray(defaults[key]) &&
          user[key] !== null &&
          typeof user[key] === "object" &&
          !Array.isArray(user[key])
        ) {
          result[key] = this.mergeConfig(
            defaults[key] as Record<string, unknown>,
            user[key] as Record<string, unknown>,
          );
        } else {
          result[key] = user[key];
        }
      }
    }

    return result as KendaliAIConfig;
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnv(): void {
    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.config.providers = this.config.providers || {};
      this.config.providers.openai = {
        ...this.config.providers.openai,
        apiKey: process.env.OPENAI_API_KEY,
      };
    }

    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      this.config.providers = this.config.providers || {};
      this.config.providers.anthropic = {
        ...this.config.providers.anthropic,
        apiKey: process.env.ANTHROPIC_API_KEY,
      };
    }

    // Server
    if (process.env.PORT) {
      this.config.server = this.config.server || {};
      this.config.server.port = parseInt(process.env.PORT, 10);
    }

    if (process.env.HOST) {
      this.config.server = this.config.server || {};
      this.config.server.host = process.env.HOST;
    }

    // Database
    if (process.env.DATABASE_URL) {
      this.config.database = this.config.database || {};
      this.config.database.url = process.env.DATABASE_URL;
    }

    // Logging
    if (process.env.LOG_LEVEL) {
      this.config.logging = this.config.logging || {};
      const level = process.env.LOG_LEVEL;
      if (["debug", "info", "warn", "error"].includes(level)) {
        this.config.logging.level = level as
          | "debug"
          | "info"
          | "warn"
          | "error";
      }
    }
  }

  /**
   * Get current configuration
   */
  get(): KendaliAIConfig {
    return this.config;
  }

  /**
   * Get a specific config value by path
   */
  getAtPath(path: string): unknown {
    const parts = path.split(".");
    let current: unknown = this.config;

    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Get provider configuration
   */
  getProvider(providerName: string): ProviderConfig | undefined {
    return this.config.providers?.[
      providerName as keyof typeof this.config.providers
    ];
  }

  /**
   * Get tool permission
   */
  getToolPermission(toolName: string): "allowed" | "restricted" | "disabled" {
    return this.config.tools?.[toolName] || "allowed";
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(feature: string): boolean {
    const features: Record<string, () => boolean> = {
      apiKeys: () => this.config.security?.apiKeysEnabled ?? true,
      localLogin: () => this.config.security?.localLoginEnabled ?? true,
    };

    return features[feature]?.() ?? false;
  }
}

export const configLoader = new ConfigLoader();
export { ConfigLoader };
