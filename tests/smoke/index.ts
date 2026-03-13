/**
 * Smoke Test Runner
 *
 * Main entry point for running all smoke tests.
 * Run with: bun test tests/smoke/index.ts
 */

import { testCredentials } from "./test-config";

// Test status tracking
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

/**
 * Run a single test and track results
 */
async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - start,
    });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      duration: Date.now() - start,
      error: (error as Error).message,
    });
    console.log(`❌ ${name} (${Date.now() - start}ms)`);
    console.log(`   Error: ${(error as Error).message}`);
  }
}

/**
 * Test DeepSeek Provider
 */
async function testDeepSeekProvider(): Promise<void> {
  const { DeepSeekProvider } =
    await import("../../src/server/providers/deepseek");

  const provider = new DeepSeekProvider({
    type: "deepseek",
    apiKey: testCredentials.provider.apiKey,
    defaultModel: testCredentials.provider.model,
  });

  await runTest("DeepSeek: Initialize provider", async () => {
    await provider.initialize();
    if (!provider.name) throw new Error("Provider name not set");
  });

  await runTest("DeepSeek: List models", async () => {
    const models = await provider.listModels();
    if (!Array.isArray(models)) throw new Error("Models should be an array");
    if (models.length === 0) throw new Error("No models returned");
  });

  await runTest("DeepSeek: Generate response", async () => {
    const result = await provider.generate({
      messages: [{ role: "user", content: 'Say "test ok"' }],
      maxTokens: 20,
      temperature: 0,
    });
    if (!result.text) throw new Error("No text in response");
  });

  await runTest("DeepSeek: Stream response", async () => {
    let hasContent = false;
    for await (const chunk of provider.stream({
      messages: [{ role: "user", content: "Say hi" }],
      maxTokens: 10,
    })) {
      if (chunk.delta) hasContent = true;
    }
    if (!hasContent) throw new Error("No content streamed");
  });

  await runTest("DeepSeek: Health check", async () => {
    const isHealthy = await provider.healthCheck();
    if (typeof isHealthy !== "boolean")
      throw new Error("Health check should return boolean");
  });
}

/**
 * Test Embeddings API
 */
async function testEmbeddings(): Promise<void> {
  const { embeddings } = testCredentials;

  await runTest("Embeddings: Generate single embedding", async () => {
    const response = await fetch(embeddings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${embeddings.apiKey}`,
      },
      body: JSON.stringify({
        model: embeddings.model,
        input: "Test embedding",
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    if (!data.data?.[0]?.embedding) throw new Error("No embedding returned");
    if (data.data[0].embedding.length === 0) throw new Error("Empty embedding");
  });

  await runTest("Embeddings: Generate multiple embeddings", async () => {
    const response = await fetch(embeddings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${embeddings.apiKey}`,
      },
      body: JSON.stringify({
        model: embeddings.model,
        input: ["Text 1", "Text 2", "Text 3"],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    if (data.data.length !== 3) throw new Error("Expected 3 embeddings");
  });

  await runTest("Embeddings: Reject invalid key", async () => {
    const response = await fetch(embeddings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid-key",
      },
      body: JSON.stringify({
        model: embeddings.model,
        input: "Test",
      }),
    });

    if (response.ok) throw new Error("Should have rejected invalid key");
    if (response.status !== 401)
      throw new Error(`Expected 401, got ${response.status}`);
  });
}

/**
 * Test Telegram Bot API
 */
async function testTelegram(): Promise<void> {
  const { channel } = testCredentials;
  const apiUrl = `https://api.telegram.org/bot${channel.botToken}`;

  async function apiCall<T>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${apiUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: params ? JSON.stringify(params) : undefined,
    });
    const data = (await response.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    if (!data.ok) throw new Error(data.description || "API error");
    return data.result as T;
  }

  await runTest("Telegram: Get bot info", async () => {
    const me = await apiCall<{ id: number; is_bot: boolean; username: string }>(
      "getMe",
    );
    if (!me.is_bot) throw new Error("Should be a bot");
    if (!me.username) throw new Error("Should have username");
  });

  await runTest("Telegram: Get webhook info", async () => {
    const info = await apiCall<{ url: string; pending_update_count: number }>(
      "getWebhookInfo",
    );
    if (typeof info.url !== "string") throw new Error("URL should be string");
  });

  await runTest("Telegram: Delete webhook", async () => {
    await apiCall<boolean>("deleteWebhook");
  });

  await runTest("Telegram: Get updates", async () => {
    const updates = await apiCall<unknown[]>("getUpdates", {
      limit: 5,
      timeout: 0,
    });
    if (!Array.isArray(updates)) throw new Error("Updates should be array");
  });

  await runTest("Telegram: Reject invalid token", async () => {
    const response = await fetch(
      `https://api.telegram.org/botinvalid-token/getMe`,
    );
    const data = (await response.json()) as { ok: boolean };
    if (data.ok) throw new Error("Should have rejected invalid token");
  });
}

/**
 * Print test summary
 */
function printSummary(): void {
  console.log("\n" + "=".repeat(60));
  console.log("SMOKE TEST SUMMARY");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => r.passed === false).length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Duration: ${totalDuration}ms`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ❌ ${r.name}`);
        console.log(`     ${r.error}`);
      });
  }

  console.log("\n" + "=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
  console.log("🚀 Starting Smoke Tests\n");
  console.log("Test credentials loaded from docs/test.txt");
  console.log("─".repeat(60) + "\n");

  console.log("📦 Testing DeepSeek Provider...");
  await testDeepSeekProvider();
  console.log("");

  console.log("📦 Testing Embeddings (Maia Router)...");
  await testEmbeddings();
  console.log("");

  console.log("📦 Testing Telegram Channel...");
  await testTelegram();
  console.log("");

  printSummary();
}

// Run tests
main().catch(console.error);
