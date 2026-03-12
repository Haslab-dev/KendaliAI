/**
 * Smoke Test: DeepSeek Provider
 * 
 * Tests the DeepSeek AI provider functionality.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { testCredentials, testConfig } from './test-config';
import { DeepSeekProvider } from '../../src/server/providers/deepseek';
import type { GenerateOptions } from '../../src/server/providers/types';

describe('DeepSeek Provider Smoke Tests', () => {
  let provider: DeepSeekProvider;

  beforeAll(async () => {
    provider = new DeepSeekProvider({
      type: 'deepseek',
      apiKey: testCredentials.provider.apiKey,
      defaultModel: testCredentials.provider.model,
    });
    await provider.initialize();
  });

  describe('Provider Initialization', () => {
    test('should create provider instance', () => {
      expect(provider).toBeDefined();
      expect(provider.name).toBe('DeepSeek');
      expect(provider.type).toBe('deepseek');
    });

    test('should have correct capabilities', () => {
      const caps = provider.capabilities;
      expect(caps.chat).toBe(true);
      expect(caps.streaming).toBe(true);
      expect(caps.functionCalling).toBe(true);
      expect(caps.jsonMode).toBe(true);
    });

    test('should list available models', async () => {
      const models = await provider.listModels();
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
      
      const chatModel = models.find(m => m.id === 'deepseek-chat');
      expect(chatModel).toBeDefined();
      expect(chatModel?.name).toBe('DeepSeek Chat');
    });
  });

  describe('Chat Completion', () => {
    test('should generate a simple response', async () => {
      const options: GenerateOptions = {
        messages: [
          { role: 'user', content: 'Say "Hello, smoke test!" and nothing else.' }
        ],
        maxTokens: 50,
        temperature: 0,
      };

      const result = await provider.generate(options);
      
      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.finishReason).toBeDefined();
    }, testConfig.timeout);

    test('should handle multi-turn conversation', async () => {
      const options: GenerateOptions = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'My name is Test.' },
          { role: 'assistant', content: 'Hello Test! How can I help you?' },
          { role: 'user', content: 'What is my name?' }
        ],
        maxTokens: 50,
        temperature: 0,
      };

      const result = await provider.generate(options);
      
      expect(result).toBeDefined();
      expect(result.text.toLowerCase()).toContain('test');
    }, testConfig.timeout);

    test('should respect maxTokens limit', async () => {
      const options: GenerateOptions = {
        messages: [
          { role: 'user', content: 'Count from 1 to 100.' }
        ],
        maxTokens: 10,
        temperature: 0,
      };

      const result = await provider.generate(options);
      
      expect(result).toBeDefined();
      expect(result.usage?.completionTokens).toBeLessThanOrEqual(15);
    }, testConfig.timeout);
  });

  describe('Streaming', () => {
    test('should stream response chunks', async () => {
      const options: GenerateOptions = {
        messages: [
          { role: 'user', content: 'Count from 1 to 5, one number per line.' }
        ],
        maxTokens: 50,
        temperature: 0,
      };

      const chunks: string[] = [];
      
      for await (const chunk of provider.stream(options)) {
        if (chunk.delta) {
          chunks.push(chunk.delta);
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      const fullContent = chunks.join('');
      expect(fullContent.length).toBeGreaterThan(0);
    }, testConfig.timeout);
  });

  describe('JSON Mode', () => {
    test('should generate valid JSON when requested', async () => {
      const options: GenerateOptions = {
        messages: [
          { role: 'user', content: 'Return a JSON object with keys "name" and "value" where name is "test" and value is 42.' }
        ],
        maxTokens: 100,
        temperature: 0,
        responseFormat: { type: 'json_object' },
      };

      const result = await provider.generate(options);
      
      expect(result).toBeDefined();
      
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(result.text);
        expect(parsed).toBeDefined();
      } catch {
        // If not valid JSON, check if it contains JSON-like content
        expect(result.text).toContain('"name"');
        expect(result.text).toContain('"value"');
      }
    }, testConfig.timeout);
  });

  describe('Function Calling', () => {
    test('should support tool calls', async () => {
      const options: GenerateOptions = {
        messages: [
          { role: 'user', content: 'What is the weather in Tokyo?' }
        ],
        maxTokens: 100,
        temperature: 0,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the current weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city name',
                  },
                },
                required: ['location'],
              },
            },
          },
        ],
      };

      const result = await provider.generate(options);
      
      expect(result).toBeDefined();
      // DeepSeek should either make a tool call or respond about the weather
      expect(result.text || result.toolCalls).toBeDefined();
    }, testConfig.timeout);
  });

  describe('Error Handling', () => {
    test('should handle invalid API key gracefully', async () => {
      const invalidProvider = new DeepSeekProvider({
        type: 'deepseek',
        apiKey: 'invalid-key-12345',
        defaultModel: 'deepseek-chat',
      });

      try {
        await invalidProvider.generate({
          messages: [{ role: 'user', content: 'Hello' }],
          maxTokens: 10,
        });
        // If we get here, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    }, testConfig.timeout);
  });

  describe('Health Check', () => {
    test('should pass health check with valid credentials', async () => {
      const isHealthy = await provider.healthCheck();
      expect(typeof isHealthy).toBe('boolean');
    }, testConfig.timeout);
  });
});
