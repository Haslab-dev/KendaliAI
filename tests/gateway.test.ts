import { expect, test, describe, beforeEach } from "bun:test";
import { gateway } from "../src/server/gateway/gateway";
import { OpenAIProvider } from "../src/server/gateway/providers/openai";
import { AnthropicProvider } from "../src/server/gateway/providers/anthropic";
import { OllamaProvider } from "../src/server/gateway/providers/ollama";

describe("Gateway", () => {
  beforeEach(() => {
    // Clear providers before each test
    gateway["providers"].clear();
  });

  test("gateway registers OpenAI provider correctly", () => {
    const provider = new OpenAIProvider({ apiKey: "test-key" });
    gateway.register(provider);
    expect(provider.name).toBe("openai");
  });

  test("gateway registers Anthropic provider correctly", () => {
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    gateway.register(provider);
    expect(provider.name).toBe("anthropic");
  });

  test("gateway registers Ollama provider correctly", () => {
    const provider = new OllamaProvider({ endpoint: "http://localhost:11434" });
    gateway.register(provider);
    expect(provider.name).toBe("ollama");
  });

  test("gateway lists models from registered providers", async () => {
    const provider = new OllamaProvider({ endpoint: "http://localhost:11434" });
    gateway.register(provider);

    const models = await gateway.listModels();
    expect(models).toBeDefined();
    expect(models.data).toBeInstanceOf(Array);
  });

  test("gateway routes to correct provider", async () => {
    const provider = new OllamaProvider({ endpoint: "http://localhost:11434" });
    gateway.register(provider);

    // Test that the gateway can determine the provider from model name
    // by checking the listModels output includes ollama models
    const models = await gateway.listModels();
    const ollamaModel = models.data.find((m: any) => m.id === "llama3");
    expect(ollamaModel).toBeDefined();
    expect(ollamaModel.owned_by).toBe("ollama");
  });
});

describe("OpenAI Provider", () => {
  test("creates provider with config", () => {
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      defaultModel: "gpt-4o",
    });
    expect(provider.name).toBe("openai");
    expect(provider.isConfigured()).toBe(true);
  });

  test("creates provider without config", () => {
    const provider = new OpenAIProvider();
    expect(provider.name).toBe("openai");
  });

  test("returns available models", () => {
    const provider = new OpenAIProvider({ apiKey: "test-key" });
    const models = provider.getModels();
    expect(models).toBeInstanceOf(Array);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty("id");
    expect(models[0]).toHaveProperty("object");
    expect(models[0]).toHaveProperty("owned_by");
  });

  test("throws error when API key not configured", async () => {
    const provider = new OpenAIProvider({ apiKey: undefined });
    expect(provider.isConfigured()).toBe(false);

    await expect(async () => {
      await provider.chatCompletion({
        model: "gpt-4o",
        messages: [{ role: "user", content: "test" }],
      });
    }).toThrow();
  });
});

describe("Anthropic Provider", () => {
  test("creates provider with config", () => {
    const provider = new AnthropicProvider({
      apiKey: "test-key",
      defaultModel: "claude-3-opus",
    });
    expect(provider.name).toBe("anthropic");
    expect(provider.isConfigured()).toBe(true);
  });

  test("returns available models", () => {
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const models = provider.getModels();
    expect(models).toBeInstanceOf(Array);
    expect(models.length).toBeGreaterThan(0);
  });
});

describe("Ollama Provider", () => {
  test("creates provider with config", () => {
    const provider = new OllamaProvider({
      endpoint: "http://localhost:11434",
      defaultModel: "llama3",
    });
    expect(provider.name).toBe("ollama");
    expect(provider.isConfigured()).toBe(true);
  });

  test("returns available models", () => {
    const provider = new OllamaProvider({ endpoint: "http://localhost:11434" });
    const models = provider.getModels();
    expect(models).toBeInstanceOf(Array);
    expect(models.length).toBeGreaterThan(0);
  });

  test("checkAvailability returns boolean", async () => {
    const provider = new OllamaProvider({ endpoint: "http://localhost:11434" });
    const isAvailable = await provider.checkAvailability();
    expect(typeof isAvailable).toBe("boolean");
  });

  test("fetchAvailableModels returns array", async () => {
    const provider = new OllamaProvider({ endpoint: "http://localhost:11434" });
    const models = await provider.fetchAvailableModels();
    expect(models).toBeInstanceOf(Array);
  });
});
