import type { AIProvider, ChatMessage } from "../server/providers/types";
import { toolRegistry } from "../server/tools/registry";
import { executeToolAction } from "./tool-executor";
import { Database } from "bun:sqlite";
import { eventBus, SystemEvent } from "../server/eventbus";
import { log } from "../server/core";
import os from "os";

/**
 * Agent Loop v3.2 - Bulletproof Stream Merging
 */
export async function agentLoop(
  initialMessage: string,
  provider: AIProvider,
  db: Database,
  gatewayId: string,
  options: {
    model?: string;
    maxSteps?: number;
    systemPrompt?: string;
  },
): Promise<string> {
  const maxSteps = options.maxSteps || 15;
  const skillsManager = await import("../server/skills").then((m) =>
    m.getSkillsManager(db),
  );
  const enabledTools = skillsManager.getEnabledTools(gatewayId);
  const toolsList =
    enabledTools.length > 0 ? enabledTools : toolRegistry.list();

  const systemPrompt = `You are KendaliAI, an elite terminal agent.

ROOT: ${process.cwd()}
OS: ${os.type()} ${os.release()} (${os.userInfo().username}'s computer)

Your mission:
- Use tools instantly. No narration.
- If you see a file mentioned, READ IT or LIST it.
- NEVER assume you don't have access. You have FULL root access.`;

  const messages: ChatMessage[] = [
    { role: "system", content: options.systemPrompt || systemPrompt },
    { role: "user", content: initialMessage },
  ];

  let lastStepResult = "";

  for (let step = 0; step < maxSteps; step++) {
    log.info(`[Cognition] Cycle ${step + 1}/${maxSteps}`);

    const toolDefinitions = toolsList.map((t: any) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    let stepContent = "";
    const toolCallsMap = new Map<number, any>();
    eventBus.emit(SystemEvent.AGENT_RESPONSE_DELTA, {
      content: "",
      status: "start",
    });

    try {
      const stream = provider.stream({
        model: options.model,
        messages,
        tools: toolDefinitions,
        toolChoice: "auto",
      });

      for await (const chunk of stream) {
        if (chunk.delta) {
          stepContent += chunk.delta;
          eventBus.emit(SystemEvent.AGENT_RESPONSE_DELTA, {
            content: chunk.delta,
          });
        }
        if (chunk.toolCalls) {
          for (const tc of chunk.toolCalls as any[]) {
            const index = tc.index ?? 0;
            if (!toolCallsMap.has(index)) {
              toolCallsMap.set(index, {
                id: tc.id,
                type: "function",
                function: {
                  name: tc.function?.name || "",
                  arguments: tc.function?.arguments || "",
                },
              });
            } else {
              const existing = toolCallsMap.get(index);
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name = tc.function.name;
              if (tc.function?.arguments)
                existing.function.arguments += tc.function.arguments;
            }
          }
        }
      }
    } catch (err) {
      log.error(`Stream error, falling back to generate: ${err}`);
      const res = await provider.generate({ messages, tools: toolDefinitions });
      stepContent = res.text || "";
      (res.toolCalls || []).forEach((tc, i) => toolCallsMap.set(i, tc));
      eventBus.emit(SystemEvent.AGENT_RESPONSE_DELTA, { content: stepContent });
    }

    const toolCalls = Array.from(toolCallsMap.values());

    if (stepContent || toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: stepContent || "",
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    }

    // Process Actions
    let actions: Array<{
      name: string;
      args: any;
      id?: string;
      isNative: boolean;
    }> = [];

    if (toolCalls.length > 0) {
      actions = toolCalls.map((tc) => {
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = { raw: tc.function.arguments };
        }
        return {
          name: tc.function.name,
          args,
          id: tc.id,
          isNative: true,
        };
      });
    } else if (stepContent) {
      const mdRegex =
        /```(bash|sh|shell|terminal|python|js|ts)(?:\n|\s)([\s\S]*?)```/gi;
      let match;
      while ((match = mdRegex.exec(stepContent)) !== null) {
        actions.push({
          name:
            match[1].startsWith("b") || match[1].startsWith("s")
              ? "terminal"
              : "execute_code",
          args: { command: match[2].trim() },
          id: `act-${Math.random().toString(36).slice(2, 5)}`,
          isNative: false,
        });
      }
    }

    if (actions.length > 0) {
      for (const action of actions) {
        const toolId = action.id || `call-${Date.now()}`;
        eventBus.emit(SystemEvent.TOOL_CALL_START, {
          name: action.name,
          input: action.args,
          id: toolId,
        });

        try {
          let result = await executeToolAction(
            action.name,
            action.args,
            gatewayId,
            db,
          );

          if (result && result.toString().includes("[SAFETY_PAUSE]")) {
            eventBus.emit(SystemEvent.TOOL_WAITING_APPROVAL, {
              id: toolId,
              name: action.name,
              command: action.args.command || JSON.stringify(action.args),
            });
            const approved = await new Promise<boolean>((resolve) => {
              const onRes = (data: any) => {
                if (data.id === toolId || !data.id) {
                  eventBus.off("USER_APPROVAL_RESPONSE", onRes);
                  resolve(data.approved);
                }
              };
              eventBus.on("USER_APPROVAL_RESPONSE", onRes);
            });
            if (!approved) result = "Action rejected by user.";
            else {
              process.env.KENDALIAI_YOLO = "true";
              result = await executeToolAction(
                action.name,
                action.args,
                gatewayId,
                db,
              );
              delete process.env.KENDALIAI_YOLO;
            }
          }

          const resultStr = String(result);
          eventBus.emit(SystemEvent.TOOL_CALL_OUTPUT, {
            name: action.name,
            output: resultStr,
            id: toolId,
          });

          if (action.isNative) {
            messages.push({
              role: "tool",
              content: resultStr,
              toolCallId: toolId,
            } as any);
          } else {
            messages.push({
              role: "user",
              content: `ACTION RESULT (${action.name}):\n${resultStr}`,
            });
          }
        } catch (err: any) {
          if (action.isNative) {
            messages.push({
              role: "tool",
              content: `Error: ${err.message}`,
              toolCallId: toolId,
            } as any);
          } else {
            messages.push({ role: "user", content: `ERROR: ${err.message}` });
          }
          eventBus.emit(SystemEvent.TOOL_CALL_OUTPUT, {
            name: action.name,
            output: `Error: ${err.message}`,
            id: toolId,
          });
        }
      }
      continue;
    }

    if (!stepContent && actions.length === 0) break;
    lastStepResult = stepContent;
    if (actions.length === 0) break;
  }

  return lastStepResult || "Mission accomplished.";
}
