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
  }
): Promise<string> {
  const maxSteps = options.maxSteps || 5;
  const messages: ChatMessage[] = [
    { role: "system", content: options.systemPrompt || "You are an autonomous agent capable of using tools to solve complex tasks." },
    { role: "user", content: initialMessage }
  ];

  for (let step = 0; step < maxSteps; step++) {
    console.log(`[AgentLoop] Step ${step + 1}/${maxSteps}...`);
    
    // 1. Get LLM response
    const response = await provider.generate({
      model: options.model,
      messages,
      tools: (provider as any).supportsTools ? toolRegistry.list().map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      })) : undefined
    });

    // 2. Add response to history
    messages.push({ role: "assistant", content: response.text });
    console.log(`\n🤖 Response:\n${response.text}\n`);

    // 3. Check for tool calls
    const actionRegex = /\[ACTION: (.*?)\][\s\S]*?```(?:[a-zA-Z]*)\n([\s\S]*?)```/g;
    const match = actionRegex.exec(response.text);

    if (match) {
      const actionName = match[1].trim();
      const command = match[2].trim();

      try {
        // Execute the tool with security checks
        const result = await executeToolAction(actionName, command, gatewayId, db);
        
        console.log(`\n📋 Output:\n${result.slice(0, 500)}${result.length > 500 ? "..." : ""}`);

        // Append result to history
        messages.push({ 
          role: "user", 
          content: `ACTION RESULT (${actionName}):\n${result}` 
        });
        
        continue;
      } catch (err: any) {
        console.error(`❌ ${err.message}`);
        messages.push({ 
          role: "user", 
          content: `ERROR executing ${actionName}: ${err.message}` 
        });
        continue;
      }
    }

    // No more actions, return final text
    return response.text;
  }

  return "Agent loop exceeded maximum steps.";
}
