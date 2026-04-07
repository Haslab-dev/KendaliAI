import type { AIProvider, ChatMessage } from "../server/providers/types";
import { toolRegistry } from "../server/tools/registry";
import { executeToolAction } from "./tool-executor";
import { Database } from "bun:sqlite";

/**
 * Agent Loop - Multi-step reasoning with tools
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
  const maxSteps = options.maxSteps || 5;
  const skillsManager = await import("../server/skills").then((m) =>
    m.getSkillsManager(db),
  );
  const enabledTools = skillsManager.getEnabledTools(gatewayId);

  const toolsList =
    enabledTools.length > 0 ? enabledTools : toolRegistry.list();

  const DEFAULT_SYSTEM_PROMPT = `You are an autonomous AI assistant with tool access.

When asked about system information, files, or commands:
1. Call the appropriate tool ONCE (e.g., get_system_info for system info)
2. Wait for the tool result
3. IMMEDIATELY provide a helpful response to the user based on the result

Do NOT call multiple tools in sequence unless absolutely necessary. After receiving tool results, respond directly to the user in a friendly, helpful way.`;

  const messages: ChatMessage[] = [
    { role: "system", content: options.systemPrompt || DEFAULT_SYSTEM_PROMPT },
    { role: "user", content: initialMessage },
  ];

  let allToolResults: string[] = [];

  for (let step = 0; step < maxSteps; step++) {
    console.log(`[AgentLoop] Step ${step + 1}/${maxSteps}...`);

    const toolDefinitions = toolsList.map((t: any) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await provider.generate({
      model: options.model,
      messages,
      tools: toolDefinitions,
      toolChoice: "auto",
    });

    if (response.toolCalls && response.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: response.text || "",
        toolCalls: response.toolCalls,
      });

      console.log(
        `\n🤖 Tool calls detected: ${response.toolCalls.map((tc) => tc.function.name).join(", ")}`,
      );

      for (const toolCall of response.toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs: any = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          toolArgs = { command: toolCall.function.arguments };
        }

        console.log(
          `⚙️  Executing tool: ${toolName}(${JSON.stringify(toolArgs)})`,
        );

        try {
          const result = await toolRegistry.execute(toolName, toolArgs);
          const resultStr =
            typeof result === "object"
              ? JSON.stringify(result, null, 2)
              : String(result);
          allToolResults.push(`[${toolName}] ${resultStr}`);
          console.log(
            `\n📋 Output:\n${resultStr.slice(0, 500)}${resultStr.length > 500 ? "..." : ""}`,
          );

          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            name: toolName,
            content: resultStr,
          });
        } catch (err: any) {
          console.error(`❌ Tool error: ${err.message}`);
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            name: toolName,
            content: `Error: ${err.message}`,
          });
        }
      }

      continue;
    }

    messages.push({ role: "assistant", content: response.text });

    console.log(`\n🤖 Response:\n${response.text}\n`);

    let match =
      /(?:\[ACTION:|\[TOOL:)\s*([^\]]+)\][\s\S]*?```(?:[a-zA-Z]*)\n([\s\S]*?)```/i.exec(
        response.text,
      );

    if (!match) {
      const fallbackMatch =
        /<(bash|shell|terminal|command)>\n?([\s\S]*?)\n?<\/\1>/i.exec(
          response.text,
        );
      if (fallbackMatch) {
        match = [fallbackMatch[0], "shell", fallbackMatch[2]] as any;
      }
    }

    if (match) {
      const actionName = match[1].trim().toLowerCase();
      const command = match[2].trim();

      console.log(`⚙️  Processing action: ${actionName}...`);

      try {
        const result = await executeToolAction(
          actionName,
          command,
          gatewayId,
          db,
        );

        console.log(
          `\n📋 Output:\n${result.slice(0, 500)}${result.length > 500 ? "..." : ""}`,
        );

        messages.push({
          role: "user",
          content: `ACTION RESULT (${actionName}):\n${result}`,
        });

        continue;
      } catch (err: any) {
        console.error(`❌ ${err.message}`);
        messages.push({
          role: "user",
          content: `ERROR executing ${actionName}: ${err.message}`,
        });
        continue;
      }
    }

    return response.text;
  }

  // Max steps reached - generate summary from collected results
  if (allToolResults.length > 0) {
    const summaryPrompt = `Based on the following tool results, provide a helpful summary response to the user's question: "${initialMessage}"

Tool Results:
${allToolResults.join("\n\n")}

Provide a clear, friendly response summarizing the information above.`;

    const finalResponse = await provider.generate({
      model: options.model,
      messages: [{ role: "user", content: summaryPrompt }],
    });

    return finalResponse.text;
  }

  return "Agent loop exceeded maximum steps.";
}
