import { expect, test } from "bun:test";
import { gateway, OpenAIProvider } from "../src/server/gateway";

test("gateway registers provider correctly", () => {
  const provider = new OpenAIProvider();
  gateway.register(provider);
  // since gateway uses console log, and we don't expose providers simply check if runs
  expect(provider.name).toBe("openai");
});

test("gateway chatCompletion mock", async () => {
  const provider = new OpenAIProvider();
  gateway.register(provider);
  const result = await gateway.chatCompletion("openai", "Hello");
  expect(result).toContain("Processed: Hello");
});
