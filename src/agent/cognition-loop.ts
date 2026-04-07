import type { AIProvider, ChatMessage } from "../server/providers/types";
import { toolRegistry } from "../server/tools/registry";
import { Database } from "bun:sqlite";
import { log } from "../server/core";
import { getSkillsManager } from "../server/skills";

export interface CognitionOptions {
  gatewayId: string;
  db: Database;
  provider: AIProvider;
  model?: string;
  intervalMs?: number;
  maxIterations?: number;
  systemPrompt?: string;
  reflectionEnabled?: boolean;
}

/**
 * Autonomous Cognition Loop (v2)
 * Implements the Perceive -> Plan -> Act -> Reflect cycle.
 */
export class CognitionLoop {
  private options: CognitionOptions;
  private isRunning: boolean = false;
  private iterations: number = 0;
  private messages: ChatMessage[] = [];

  constructor(options: CognitionOptions) {
    this.options = {
      intervalMs: 30000,
      maxIterations: 10,
      reflectionEnabled: true,
      ...options,
    };

    const sysPrompt =
      this.options.systemPrompt ||
      `You are an autonomous AI staff member.
Your goal is to be proactive and helpful within your workspace.
Follow the Perceive-Plan-Act-Reflect cycle.
1. Perceive: Check current context and recent events.
2. Plan: Decide on the next steps to move closer to your goals.
3. Act: Use tools to execute your plan.
4. Reflect: Evaluate what happened and update your knowledge.

Stay within your persona and be resourceful.`;

    this.messages = [{ role: "system", content: sysPrompt }];
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    log.info(
      `[CognitionLoop] Starting loop for gateway: ${this.options.gatewayId}`,
    );

    while (this.isRunning && this.iterations < this.options.maxIterations!) {
      this.iterations++;
      log.info(
        `[CognitionLoop] Iteration ${this.iterations}/${this.options.maxIterations} for ${this.options.gatewayId}`,
      );

      try {
        await this.runCycle();
      } catch (err) {
        log.error(`[CognitionLoop] Error in cycle: ${err}`);
      }

      if (this.isRunning) {
        await new Promise((r) => setTimeout(r, this.options.intervalMs!));
      }
    }

    this.isRunning = false;
    log.info(
      `[CognitionLoop] Loop finished for gateway: ${this.options.gatewayId}`,
    );
  }

  stop() {
    this.isRunning = false;
    log.info(
      `[CognitionLoop] Stopping loop for gateway: ${this.options.gatewayId}`,
    );
  }

  private async runCycle() {
    // 1. Perceive
    const context = await this.perceive();
    this.messages.push({
      role: "user",
      content: `CURRENT CONTEXT:\n${context}\n\nWhat is your plan?`,
    });

    // 2. Plan & Act
    const result = await this.planAndAct();

    // 3. Reflect
    if (this.options.reflectionEnabled) {
      await this.reflect(result);
    }
  }

  private async perceive(): Promise<string> {
    const { gatewayId, db } = this.options;

    // Load gateway context (markdown files)
    const { loadGatewayContext } = await import("../cli/gateway");
    let context = loadGatewayContext(gatewayId);

    // Add recent messages from DB
    const recentMessages = db
      .query(
        "SELECT role, content FROM messages WHERE gateway_id = ? ORDER BY created_at DESC LIMIT 5",
      )
      .all(gatewayId) as any[];
    if (recentMessages.length > 0) {
      context +=
        "\n--- [Recent Conversations] ---\n" +
        recentMessages
          .reverse()
          .map((m) => `[${m.role}] ${m.content}`)
          .join("\n");
    }

    return context;
  }

  private async planAndAct(): Promise<string> {
    const { provider, model, gatewayId, db } = this.options;

    const skillsManager = await getSkillsManager(db);
    const enabledTools = skillsManager.getEnabledTools(gatewayId);
    const toolsList =
      enabledTools.length > 0 ? enabledTools : toolRegistry.list();

    const toolDefinitions = toolsList.map((t: any) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await provider.generate({
      model,
      messages: this.messages,
      tools: toolDefinitions,
      toolChoice: "auto",
    });

    if (response.toolCalls && response.toolCalls.length > 0) {
      this.messages.push({
        role: "assistant",
        content: response.text || "",
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = { input: toolCall.function.arguments };
        }

        log.info(`[CognitionLoop] Executing tool: ${toolName}`);

        try {
          const result = await toolRegistry.execute(toolName, toolArgs);
          const resultStr =
            typeof result === "object"
              ? JSON.stringify(result, null, 2)
              : String(result);

          this.messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            name: toolName,
            content: resultStr,
          });
        } catch (err: any) {
          log.error(`[CognitionLoop] Tool error (${toolName}): ${err.message}`);
          this.messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            name: toolName,
            content: `Error: ${err.message}`,
          });
        }
      }

      // After tool execution, let the agent potentially finish its thought or act again
      // In this simple version we'll just return the current state
      return response.text || "Executed tools.";
    }

    this.messages.push({ role: "assistant", content: response.text });
    return response.text;
  }

  private async reflect(lastAction: string) {
    const { provider, model, gatewayId } = this.options;
    log.info(`[CognitionLoop] Reflecting on actions for ${gatewayId}...`);

    // 1. Ask the AI to summarize learning for identity
    const reflectionPrompt = `Reflect on your recent actions and the current state.
What did you learn about the user or your own identity?
Provide a brief, updated entry for either IDENTITY.md, USER.md, or AGENTS.md if applicable.
Return the result in this format:
FILE: <filename>
CONTENT: <new content to append or update>
REASON: <why this update is needed>`;

    const response = await provider.generate({
      model,
      messages: [
        ...this.messages.slice(-5),
        { role: "user", content: reflectionPrompt },
      ],
    });

    log.info(`[CognitionLoop] Reflection: ${response.text.slice(0, 100)}...`);

    // 2. Process reflection results (Simplified)
    const fileMatch = response.text.match(
      /FILE:\s*(IDENTITY\.md|USER\.md|AGENTS\.md)/i,
    );
    const contentMatch = response.text.match(
      /CONTENT:\s*([\s\S]+?)(?:\s*REASON:|$)/i,
    );

    if (fileMatch && contentMatch) {
      const filename = fileMatch[1].toUpperCase();
      const newContent = contentMatch[1].trim();

      const { getGatewayPaths } = await import("../cli/gateway");
      const paths = getGatewayPaths(gatewayId) as any;
      const filePath = paths[filename.split(".")[0].toLowerCase()];

      if (filePath) {
        log.info(`[CognitionLoop] Updating ${filename} for ${gatewayId}...`);
        const { appendFileSync, writeFileSync, existsSync, readFileSync } =
          await import("fs");

        let currentContent = "";
        if (existsSync(filePath)) {
          currentContent = readFileSync(filePath, "utf-8");
        }

        if (!currentContent.includes(newContent)) {
          appendFileSync(
            filePath,
            `\n\n## Reflected Insight (${new Date().toLocaleDateString()})\n${newContent}\n`,
          );
          log.info(`[CognitionLoop] Added new insight to ${filename}.`);
        }
      }
    }
  }
}
