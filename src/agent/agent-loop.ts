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
  const DEFAULT_SYSTEM_PROMPT = `You are KendaliAI, an autonomous AI assistant.
To perform actions or use tools, you MUST use the following format:

[ACTION: tool_name]
\`\`\`
command or arguments here
\`\`\`

Available Tools:
- shell: Execute bash commands. (e.g., [ACTION: shell]\\n\`\`\`\\nls -la\\n\`\`\`)
- file: Read or write files.
- summarize: Summarize content.
- code-analysis: Analyze code quality.

Always explain what you are doing before using a tool. Wait for the tool result before proceeding.`;

  const messages: ChatMessage[] = [
    { role: "system", content: options.systemPrompt || DEFAULT_SYSTEM_PROMPT },
    { role: "user", content: initialMessage },
  ];

  for (let step = 0; step < maxSteps; step++) {
    console.log(`[AgentLoop] Step ${step + 1}/${maxSteps}...`);

    // 1. Get LLM response
    const response = await provider.generate({
      model: options.model,
      messages,
      tools: (provider as any).supportsTools
        ? toolRegistry.list().map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }))
        : undefined,
    });

    // 2. Add response to history
    messages.push({ role: "assistant", content: response.text });
    console.log(`\n🤖 Response:\n${response.text}\n`);

    // 3. Check for tool calls - more flexible regex
    // Primary: [ACTION: name] or [TOOL: name]
    let match =
      /(?:\[ACTION:|\[TOOL:)\s*([^\]]+)\][\s\S]*?```(?:[a-zA-Z]*)\n([\s\S]*?)```/i.exec(
        response.text,
      );

    // Fallback: <bash>...</bash> style tags
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
        // Execute the tool with security checks
        const result = await executeToolAction(
          actionName,
          command,
          gatewayId,
          db,
        );

        console.log(
          `\n📋 Output:\n${result.slice(0, 500)}${result.length > 500 ? "..." : ""}`,
        );

        // Append result to history
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

    // No more actions, return final text
    return response.text;
  }

  return "Agent loop exceeded maximum steps.";
}
