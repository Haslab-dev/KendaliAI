import { Database } from "bun:sqlite";
import { decrypt } from "./security/encryption";
import { loadGatewayContext } from "../cli/gateway";
import { getSkillsManager } from "./skills/index";
import { autonomousPipeline } from "../executors/index";
import { createRAGEngine } from "./rag/engine";
import { Retriever } from "../rag/retriever";
import { createProvider } from "./providers/registry";

/**
 * Direct execution of an agent pipeline from a server context (Like TUI)
 * Reuse logic from handleAgent in CLI
 */
export async function runAgentDirect(
  db: Database,
  gatewayName: string,
  message: string,
): Promise<string> {
  const gateway = db
    .query<
      {
        id: string;
        name: string;
        provider: string;
        default_model: string;
        endpoint: string | null;
        api_key_encrypted: string | null;
      },
      [string]
    >(
      `
      SELECT id, name, provider, default_model, endpoint, api_key_encrypted 
      FROM gateways 
      WHERE name = ?
    `,
    )
    .get(gatewayName);

  if (!gateway) throw new Error(`Gateway '${gatewayName}' not found.`);

  // API Key Fallback
  let apiKey: string | undefined;
  try {
    apiKey = gateway.api_key_encrypted
      ? decrypt(gateway.api_key_encrypted)
      : undefined;
  } catch {
    apiKey = gateway.api_key_encrypted || undefined;
  }

  if (!apiKey) {
    const provider = gateway.provider.toLowerCase();
    if (provider === "openai") apiKey = process.env.OPENAI_API_KEY;
    else if (provider === "deepseek") apiKey = process.env.DEEPSEEK_API_KEY;
    else if (provider === "anthropic") apiKey = process.env.ANTHROPIC_API_KEY;
    else if (provider === "zai") apiKey = process.env.ZAI_API_KEY;
  }

  if (!apiKey) throw new Error(`No API key configured for ${gatewayName}.`);

  // Provider
  const apiUrl =
    gateway.endpoint ||
    (gateway.provider === "deepseek"
      ? "https://api.deepseek.com/v1"
      : undefined);
  const provider = await createProvider(gateway.name, gateway.provider as any, {
    type: gateway.provider as any,
    apiKey,
    baseURL: apiUrl || undefined,
  });

  // Skills
  const skillsManager = getSkillsManager(db);
  const enabledTools = skillsManager.getEnabledTools(gateway.id);

  // Register built-in suites if not done yet
  const { toolRegistry } = await import("./tools/registry");
  const { HermesSuite } = await import("./tools/hermes");
  if (toolRegistry.list().length === 0) {
    toolRegistry.registerSuite(new HermesSuite({ root: process.cwd() }));
  }

  // Identity
  let systemPrompt = "You are KendaliAI, a powerful AI orchestrator.\n";
  const gatewayContext = loadGatewayContext(gateway.name);
  if (gatewayContext) {
    systemPrompt +=
      "\n# Gateway Context (System Rules & Identity)\n" + gatewayContext + "\n";
  }

  // RAG
  const ragEngine = await createRAGEngine(db);
  const retriever = new Retriever(ragEngine);
  const embedder = { embed: (text: string) => ragEngine.embedText(text) };

  // Run
  const result = await autonomousPipeline(message, {
    provider,
    db,
    gatewayId: gateway.id,
    model: gateway.default_model,
    embedder,
    retriever,
    agentSystemPrompt: systemPrompt,
  });

  return result.response;
}
