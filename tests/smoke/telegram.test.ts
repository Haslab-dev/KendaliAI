/**
 * Smoke Test: Telegram Channel
 * 
 * Tests the Telegram Bot API functionality.
 * Note: Some tests require a chat_id to be set in environment variables.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { testCredentials, testConfig } from './test-config';

// Telegram API types
interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: TelegramUser;
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

class TelegramTestClient {
  private apiUrl: string;

  constructor(botToken: string) {
    this.apiUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async apiCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${this.apiUrl}/${method}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = await response.json() as TelegramResponse<T>;
    
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || data.error_code}`);
    }
    
    return data.result as T;
  }
}

describe('Telegram Channel Smoke Tests', () => {
  let client: TelegramTestClient;
  let botInfo: TelegramBotInfo;

  beforeAll(async () => {
    client = new TelegramTestClient(testCredentials.channel.botToken);
  });

  describe('Bot Initialization', () => {
    test('should authenticate with valid bot token', async () => {
      const me = await client.apiCall<TelegramBotInfo>('getMe');
      
      expect(me).toBeDefined();
      expect(me.id).toBeDefined();
      expect(me.is_bot).toBe(true);
      expect(me.first_name).toBeDefined();
      expect(me.username).toBeDefined();
      
      botInfo = me;
    }, testConfig.timeout);

    test('should have bot username', async () => {
      const me = await client.apiCall<TelegramBotInfo>('getMe');
      
      expect(me.username).toBeDefined();
      expect(typeof me.username).toBe('string');
      expect(me.username.length).toBeGreaterThan(0);
    }, testConfig.timeout);

    test('should have bot capabilities info', async () => {
      const me = await client.apiCall<TelegramBotInfo>('getMe');
      
      expect(typeof me.can_join_groups).toBe('boolean');
      expect(typeof me.can_read_all_group_messages).toBe('boolean');
      expect(typeof me.supports_inline_queries).toBe('boolean');
    }, testConfig.timeout);
  });

  describe('Invalid Token Handling', () => {
    test('should reject invalid bot token', async () => {
      const invalidClient = new TelegramTestClient('invalid-token-12345');

      try {
        await invalidClient.apiCall<TelegramBotInfo>('getMe');
        // If we get here, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Telegram API error');
      }
    }, testConfig.timeout);
  });

  describe('Webhook Management', () => {
    test('should get webhook info', async () => {
      const webhookInfo = await client.apiCall<TelegramWebhookInfo>('getWebhookInfo');
      
      expect(webhookInfo).toBeDefined();
      expect(typeof webhookInfo.url).toBe('string');
      expect(typeof webhookInfo.pending_update_count).toBe('number');
    }, testConfig.timeout);

    test('should be able to delete webhook', async () => {
      const result = await client.apiCall<boolean>('deleteWebhook');
      expect(result).toBe(true);
    }, testConfig.timeout);

    test('should have empty webhook URL after deletion', async () => {
      const webhookInfo = await client.apiCall<TelegramWebhookInfo>('getWebhookInfo');
      expect(webhookInfo.url).toBe('');
    }, testConfig.timeout);
  });

  describe('Updates', () => {
    test('should get updates without error', async () => {
      // Ensure webhook is deleted for polling to work
      await client.apiCall<boolean>('deleteWebhook');
      
      const updates = await client.apiCall<TelegramUpdate[]>('getUpdates', {
        limit: 10,
        timeout: 0,
      });
      
      expect(Array.isArray(updates)).toBe(true);
    }, testConfig.timeout);

    test('should handle allowed_updates parameter', async () => {
      const updates = await client.apiCall<TelegramUpdate[]>('getUpdates', {
        limit: 5,
        timeout: 0,
        allowed_updates: ['message', 'edited_message'],
      });
      
      expect(Array.isArray(updates)).toBe(true);
    }, testConfig.timeout);
  });

  describe('Chat Actions', () => {
    // Note: This test requires a valid chat_id
    // Set TELEGRAM_CHAT_ID environment variable to test
    const chatId = process.env.TELEGRAM_CHAT_ID;

    (chatId ? test : test.skip)('should send a message to a chat', async () => {
      const result = await client.apiCall<{ message_id: number }>('sendMessage', {
        chat_id: chatId,
        text: '🧪 Smoke test message from KendaliAI test suite.',
      });
      
      expect(result).toBeDefined();
      expect(result.message_id).toBeDefined();
      expect(typeof result.message_id).toBe('number');
    }, testConfig.timeout);

    (chatId ? test : test.skip)('should send typing action', async () => {
      const result = await client.apiCall<boolean>('sendChatAction', {
        chat_id: chatId,
        action: 'typing',
      });
      
      expect(result).toBe(true);
    }, testConfig.timeout);

    (chatId ? test : test.skip)('should edit a message', async () => {
      // First send a message
      const sent = await client.apiCall<{ message_id: number }>('sendMessage', {
        chat_id: chatId,
        text: 'Original message to edit.',
      });
      
      // Then edit it
      const result = await client.apiCall<{ message_id: number }>('editMessageText', {
        chat_id: chatId,
        message_id: sent.message_id,
        text: '✅ Edited message - smoke test passed!',
      });
      
      expect(result).toBeDefined();
      expect(result.message_id).toBe(sent.message_id);
    }, testConfig.timeout);

    (chatId ? test : test.skip)('should delete a message', async () => {
      // First send a message
      const sent = await client.apiCall<{ message_id: number }>('sendMessage', {
        chat_id: chatId,
        text: 'Message to be deleted.',
      });
      
      // Then delete it
      const result = await client.apiCall<boolean>('deleteMessage', {
        chat_id: chatId,
        message_id: sent.message_id,
      });
      
      expect(result).toBe(true);
    }, testConfig.timeout);
  });

  describe('Me Info', () => {
    test('should have consistent bot info across calls', async () => {
      const me1 = await client.apiCall<TelegramBotInfo>('getMe');
      const me2 = await client.apiCall<TelegramBotInfo>('getMe');
      
      expect(me1.id).toBe(me2.id);
      expect(me1.username).toBe(me2.username);
      expect(me1.first_name).toBe(me2.first_name);
    }, testConfig.timeout);
  });
});
