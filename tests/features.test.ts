import { describe, expect, it, beforeAll } from "bun:test";
import { authManager } from "../src/server/auth/manager";

const BASE_URL = "http://localhost:3000/api";

let globalApiToken: string | undefined;

async function fetchApi(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(globalApiToken ? { Authorization: `Bearer ${globalApiToken}` } : {}),
      ...options?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
}

describe("End-to-End Feature Tests", () => {
  let gatewayId: string;
  let workflowId: string;
  let agentId: string;

  beforeAll(async () => {
    const adminUser = await authManager.createUser(
      `test_admin_${Date.now()}`,
      "password123!",
      "admin",
    );
    const { key } = await authManager.createApiKey(
      adminUser.id,
      "test_admin_key",
      ["admin"],
    );
    globalApiToken = key;
  });

  it("1. Create gateway (DeepSeek)", async () => {
    const payload = {
      id: "test-gateway-deepseek-" + Date.now(),
      name: "DeepSeek Tests",
      provider: "openai",
      endpoint: "https://api.deepseek.com/v1",
      apiKey: "sk-dcf85a16e0e74185aafb63447030da4c",
      models: JSON.stringify(["deepseek-chat"]),
      defaultModel: "deepseek-chat",
    };

    const res = await fetchApi("/gateways", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    expect(res).toBeDefined();
    expect(res.id).toBe(payload.id);
    gatewayId = res.id;
  });

  it("2. Create Workflow", async () => {
    const payload = {
      id: "test-workflow-" + Date.now(),
      name: "Test Workflow",
      description: "Testing workflow feature",
      triggers: JSON.stringify([
        { type: "webhook", webhookId: "test-webhook" },
      ]),
      nodes: JSON.stringify([
        {
          id: "trigger_1",
          type: "trigger",
          config: { type: "manual" },
          position: { x: 0, y: 0 },
        },
      ]),
      edges: "[]",
    };

    const res = await fetchApi("/workflows", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    expect(res).toBeDefined();
    expect(res.id).toBe(payload.id);
    workflowId = res.id;
  });

  it("3. Run Workflow", async () => {
    const res = await fetchApi("/workflows/run", {
      method: "POST",
      body: JSON.stringify({ workflowId, input: { test: true } }),
    });

    // Currently engine logs and returns input (or execution result depending on engine implementation)
    expect(res).toBeDefined();
  });

  it("4. Create Agent", async () => {
    const payload = {
      id: "test-agent-" + Date.now(),
      name: "Test DeepSeek Agent",
      gatewayId: gatewayId,
      model: "deepseek-chat",
      systemPrompt: "You are a helpful assistant.",
    };

    const res = await fetchApi("/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(res);

    expect(res).toBeDefined();
    expect(res.id).toBe(payload.id);
    agentId = res.id;
  });

  it("5. Test Get Agents (Ingest Agent)", async () => {
    const res = await fetchApi("/agents");
    expect(Array.isArray(res)).toBe(true);
    const agent = res.find((a: any) => a.id === agentId);
    expect(agent).toBeDefined();
  });

  it("6. Test Call Agent", async () => {
    const res = await fetchApi(`/agents/${agentId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message: "Hello, how are you?" }),
    });
    console.log(res);

    expect(res).toBeDefined();
    // Agent chat result depends on the agent setup, we expect it to return something without crashing.
  });

  it("7. Test Get Messages", async () => {
    const res = await fetchApi("/messages");
    expect(Array.isArray(res)).toBe(true);
  });

  it("8. Create and test call webhook", async () => {
    // The webhook route we added will trigger the event.
    const res = await fetchApi("/webhooks/test-webhook", {
      method: "POST",
      body: JSON.stringify({ event: "test-event" }),
    });

    expect(res.success).toBe(true);
    expect(res.message).toBe("Webhook test-webhook triggered");
  });
});
