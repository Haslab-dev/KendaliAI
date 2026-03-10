import { KendaliAIConfig } from "./types";

export const defaultConfig: KendaliAIConfig = {
  providers: {
    openai: {
      endpoint: "https://api.openai.com/v1",
      defaultModel: "gpt-4o",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    anthropic: {
      endpoint: "https://api.anthropic.com/v1",
      defaultModel: "claude-sonnet-4-20250514",
      models: [
        "claude-sonnet-4-20250514",
        "claude-3-5-sonnet-20241022",
        "claude-3-haiku-20240307",
      ],
    },
    ollama: {
      endpoint: "http://localhost:11434",
      defaultModel: "llama3",
      models: ["llama3", "llama3:8b", "llama3:70b", "mistral", "codellama"],
    },
  },

  plugins: [],

  tools: {
    "filesystem.write": "restricted",
    "system.exec": "disabled",
    "browser.open": "allowed",
  },

  security: {
    apiKeysEnabled: true,
    localLoginEnabled: true,
    sessionSecret:
      process.env.SESSION_SECRET || "kendaliai-secret-change-in-production",
    tokenExpiry: "24h",
  },

  routing: {
    mode: "static",
    fallbackChain: ["openai", "anthropic"],
  },

  logging: {
    level: "info",
    console: true,
  },

  database: {
    url: "file:src/server/database/kendaliai.sqlite",
  },

  server: {
    port: 3000,
    host: "0.0.0.0",
  },

  workflows: {
    maxConcurrentRuns: 10,
    defaultTimeout: 300000, // 5 minutes
  },
};
