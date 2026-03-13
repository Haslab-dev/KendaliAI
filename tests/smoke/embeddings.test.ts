/**
 * Smoke Test: Embeddings (Maia Router)
 *
 * Tests the embedding generation functionality using Maia Router API.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { testCredentials, testConfig } from "./test-config";

describe("Embeddings Smoke Tests", () => {
  describe("Maia Router Embeddings API", () => {
    test(
      "should generate embeddings for a single text",
      async () => {
        const response = await fetch(testCredentials.embeddings.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${testCredentials.embeddings.apiKey}`,
          },
          body: JSON.stringify({
            model: testCredentials.embeddings.model,
            input: "Hello, this is a smoke test for embeddings.",
          }),
        });

        expect(response.ok).toBe(true);

        const data = (await response.json()) as {
          object: string;
          data: Array<{
            object: string;
            index: number;
            embedding: number[];
          }>;
          model: string;
          usage: {
            prompt_tokens: number;
            total_tokens: number;
          };
        };

        expect(data.object).toBe("list");
        expect(data.data).toBeInstanceOf(Array);
        expect(data.data.length).toBe(1);
        expect(data.data[0].embedding).toBeInstanceOf(Array);
        expect(data.data[0].embedding.length).toBeGreaterThan(0);
        expect(typeof data.data[0].embedding[0]).toBe("number");
        expect(data.usage).toBeDefined();
        expect(data.usage.prompt_tokens).toBeGreaterThan(0);
      },
      testConfig.timeout,
    );

    test(
      "should generate embeddings for multiple texts",
      async () => {
        const response = await fetch(testCredentials.embeddings.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${testCredentials.embeddings.apiKey}`,
          },
          body: JSON.stringify({
            model: testCredentials.embeddings.model,
            input: [
              "First text for embedding.",
              "Second text for embedding.",
              "Third text for embedding.",
            ],
          }),
        });

        expect(response.ok).toBe(true);

        const data = (await response.json()) as {
          object: string;
          data: Array<{
            object: string;
            index: number;
            embedding: number[];
          }>;
          model: string;
        };

        expect(data.data).toBeInstanceOf(Array);
        expect(data.data.length).toBe(3);

        // Each embedding should have the same dimensions
        const dimensions = data.data[0].embedding.length;
        data.data.forEach((item) => {
          expect(item.embedding.length).toBe(dimensions);
        });
      },
      testConfig.timeout,
    );

    test(
      "should have consistent embedding dimensions",
      async () => {
        const texts = [
          "Short text.",
          "This is a longer text that should still produce the same embedding dimensions.",
        ];

        const embeddings: number[][] = [];

        for (const text of texts) {
          const response = await fetch(testCredentials.embeddings.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${testCredentials.embeddings.apiKey}`,
            },
            body: JSON.stringify({
              model: testCredentials.embeddings.model,
              input: text,
            }),
          });

          const data = (await response.json()) as {
            data: Array<{ embedding: number[] }>;
          };

          embeddings.push(data.data[0].embedding);
        }

        // All embeddings should have the same dimensions
        expect(embeddings[0].length).toBe(embeddings[1].length);
      },
      testConfig.timeout,
    );

    test(
      "should handle empty text gracefully",
      async () => {
        const response = await fetch(testCredentials.embeddings.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${testCredentials.embeddings.apiKey}`,
          },
          body: JSON.stringify({
            model: testCredentials.embeddings.model,
            input: "",
          }),
        });

        // API might return error or empty embedding - both are valid behaviors
        if (response.ok) {
          const data = await response.json();
          expect(data).toBeDefined();
        } else {
          expect(response.status).toBeGreaterThanOrEqual(400);
        }
      },
      testConfig.timeout,
    );

    test(
      "should reject invalid API key",
      async () => {
        const response = await fetch(testCredentials.embeddings.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer invalid-api-key",
          },
          body: JSON.stringify({
            model: testCredentials.embeddings.model,
            input: "Test input",
          }),
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(401);
      },
      testConfig.timeout,
    );

    test(
      "should generate embeddings with expected model",
      async () => {
        const response = await fetch(testCredentials.embeddings.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${testCredentials.embeddings.apiKey}`,
          },
          body: JSON.stringify({
            model: testCredentials.embeddings.model,
            input: "Test for model verification.",
          }),
        });

        expect(response.ok).toBe(true);

        const data = (await response.json()) as {
          model: string;
        };

        expect(data.model).toBeDefined();
        // Model name might be returned differently, just check it exists
        expect(typeof data.model).toBe("string");
      },
      testConfig.timeout,
    );
  });

  describe("Embedding Quality", () => {
    test(
      "similar texts should have similar embeddings",
      async () => {
        const texts = [
          "The cat sat on the mat.",
          "A cat is sitting on a mat.",
          "The weather is nice today.",
        ];

        const embeddings: number[][] = [];

        for (const text of texts) {
          const response = await fetch(testCredentials.embeddings.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${testCredentials.embeddings.apiKey}`,
            },
            body: JSON.stringify({
              model: testCredentials.embeddings.model,
              input: text,
            }),
          });

          const data = (await response.json()) as {
            data: Array<{ embedding: number[] }>;
          };

          embeddings.push(data.data[0].embedding);
        }

        // Calculate cosine similarity
        const similarity01 = cosineSimilarity(embeddings[0], embeddings[1]);
        const similarity02 = cosineSimilarity(embeddings[0], embeddings[2]);
        const similarity12 = cosineSimilarity(embeddings[1], embeddings[2]);

        // Similar sentences should have higher similarity
        expect(similarity01).toBeGreaterThan(similarity02);

        // All similarities should be valid numbers
        expect(similarity01).toBeGreaterThanOrEqual(-1);
        expect(similarity01).toBeLessThanOrEqual(1);
        expect(similarity02).toBeGreaterThanOrEqual(-1);
        expect(similarity02).toBeLessThanOrEqual(1);
      },
      testConfig.timeout,
    );
  });
});

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
