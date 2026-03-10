import { defineConfig } from "./src/server/config";

export default defineConfig({
  // AI Providers configuration
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    ollama: {
      endpoint: "http://localhost:11434",
    },
  },

  // Plugins to load
  plugins: [],

  // Tool permissions
  tools: {
    "filesystem.write": "restricted",
    "system.exec": "disabled",
    "browser.open": "allowed",
  },

  // Security settings
  security: {
    apiKeysEnabled: true,
    localLoginEnabled: true,
    sessionSecret: process.env.SESSION_SECRET || "change-me-in-production",
  },

  // Routing configuration
  routing: {
    mode: "static",
    fallbackChain: ["openai", "anthropic", "ollama"],
  },

  // Logging configuration
  logging: {
    level: "info",
    console: true,
  },

  // Database configuration
  database: {
    url: "file:src/server/database/kendaliai.sqlite",
  },

  // Server configuration
  server: {
    port: 3000,
    host: "0.0.0.0",
  },

  // Workflow configuration
  workflows: {
    maxConcurrentRuns: 10,
    defaultTimeout: 300000, // 5 minutes
  },
});
