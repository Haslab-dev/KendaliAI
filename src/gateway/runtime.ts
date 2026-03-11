/**
 * KendaliAI Gateway Runtime
 *
 * Loads gateway configurations and runs them, connecting channels (Telegram)
 * to AI providers (DeepSeek, ZAI, etc.) with tool calling support.
 */

import { loadGateway, listGateways, updateGatewayStatus } from "./storage";
import type { GatewayConfig } from "./types";
import { createTelegramChannel } from "../channels/telegram";
import { createProvider } from "../providers";
import { executeTool } from "./tools";
import type { ChannelInstance } from "../channels/types";
import type { ProviderInstance } from "../providers/types";
import { generateText } from "ai";
import { z } from "zod";

/**
 * Running gateway instance
 */
interface RunningGateway {
  config: GatewayConfig;
  channel: ChannelInstance;
  provider: ProviderInstance;
}

// Define tools using zod schemas
const systemInfoSchema = z.object({
  info_type: z
    .string()
    .optional()
    .describe(
      "Type of info: 'all', 'os', 'cpu', 'memory', 'hostname', 'uptime'",
    ),
});

const shellSchema = z.object({
  command: z.string().describe("The shell command to execute"),
});

const readFileSchema = z.object({
  path: z.string().describe("The path to the file to read"),
});

const listDirSchema = z.object({
  path: z.string().optional().describe("The directory path to list"),
});

const datetimeSchema = z.object({
  format: z.string().optional().describe("Format: 'iso', 'locale', or 'unix'"),
});

/**
 * Gateway Runtime Manager
 */
class GatewayRuntime {
  private runningGateways: Map<string, RunningGateway> = new Map();

  /**
   * Start a gateway by name
   */
  async startGateway(name: string): Promise<void> {
    if (this.runningGateways.has(name)) {
      console.log(`Gateway "${name}" is already running`);
      return;
    }

    const config = await loadGateway(name);
    if (!config) {
      throw new Error(`Gateway "${name}" not found`);
    }

    console.log(`Starting gateway "${name}"...`);

    let channel: ChannelInstance;
    if (config.channel.type === "telegram") {
      channel = createTelegramChannel({
        type: "telegram",
        botToken: config.channel.botToken,
      });
    } else {
      throw new Error(`Unsupported channel type: ${config.channel.type}`);
    }

    const provider = createProvider(config.provider.type, {
      apiKey: config.provider.apiKey,
      baseURL: config.provider.baseURL,
    });

    channel.onMessage(async (message) => {
      try {
        console.log(
          `[${name}] Received message from ${message.username}: ${message.text}`,
        );

        const model = provider.getModel(config.provider.model);

        // Define tools with proper AI SDK format
        const tools = {
          get_system_info: {
            description:
              "Get information about the system (OS, CPU, memory, hostname, uptime)",
            inputSchema: systemInfoSchema,
            execute: async (args: z.infer<typeof systemInfoSchema>) => {
              console.log(`[${name}] Executing: get_system_info`);
              return await executeTool("get_system_info", {
                info_type: args.info_type || "all",
              });
            },
          },
          execute_shell: {
            description: "Execute a shell command on the system",
            inputSchema: shellSchema,
            execute: async (args: z.infer<typeof shellSchema>) => {
              console.log(
                `[${name}] Executing: execute_shell - ${args.command}`,
              );
              return await executeTool("execute_shell", {
                command: args.command,
              });
            },
          },
          read_file: {
            description: "Read the contents of a file",
            inputSchema: readFileSchema,
            execute: async (args: z.infer<typeof readFileSchema>) => {
              console.log(`[${name}] Executing: read_file - ${args.path}`);
              return await executeTool("read_file", { path: args.path });
            },
          },
          list_directory: {
            description: "List contents of a directory",
            inputSchema: listDirSchema,
            execute: async (args: z.infer<typeof listDirSchema>) => {
              console.log(`[${name}] Executing: list_directory`);
              return await executeTool("list_directory", {
                path: args.path || ".",
              });
            },
          },
          get_datetime: {
            description: "Get the current date and time",
            inputSchema: datetimeSchema,
            execute: async (args: z.infer<typeof datetimeSchema>) => {
              console.log(`[${name}] Executing: get_datetime`);
              return await executeTool("get_datetime", {
                format: args.format || "locale",
              });
            },
          },
        };

        // Build agent identity
        const agentName = config.agentName || "KendaliAI";
        const providerName = config.provider.type.toUpperCase();
        const modelName = config.provider.model || "default";

        // Initial messages with proper identity
        const messages: Array<{
          role: "system" | "user" | "assistant";
          content: string;
        }> = [
          {
            role: "system",
            content: `You are ${agentName}, a helpful AI assistant powered by ${providerName} (${modelName}). You have access to system tools to help users.

IMPORTANT IDENTITY RULES:
- Your name is ${agentName}. When asked "what is your name?" or "who are you?", answer: "My name is ${agentName}, your personal AI assistant."
- You are powered by ${providerName} using the ${modelName} model.
- Do NOT claim to be Claude, GPT, or any other AI. You are ${agentName}.

Available tools:
- get_system_info: Get system info (OS, CPU, memory, etc.)
- execute_shell: Run shell commands
- read_file: Read file contents
- list_directory: List directory contents
- get_datetime: Get current date/time

Use tools when the user asks for system information or to run commands. After using tools, summarize the results in a helpful way.`,
          },
          {
            role: "user",
            content: message.text || "",
          },
        ];

        console.log(`[${name}] Starting agent loop...`);

        // Agent loop - manually handle tool calling
        const maxSteps = 5;
        let finalText = "";
        let step = 0;

        while (step < maxSteps) {
          console.log(`[${name}] Step ${step + 1}/${maxSteps}`);

          const result = await generateText({
            model,
            messages,
            tools,
          });

          console.log(
            `[${name}] Finish: ${result.finishReason}, Text: ${result.text.length} chars, Tools: ${result.toolCalls?.length || 0}`,
          );

          // If we have text and no tool calls, we're done
          if (
            result.text &&
            (!result.toolCalls || result.toolCalls.length === 0)
          ) {
            finalText = result.text;
            break;
          }

          // If we have text but also tool calls, add assistant message
          if (result.text) {
            messages.push({ role: "assistant", content: result.text });
          }

          // No tool calls - done
          if (!result.toolCalls || result.toolCalls.length === 0) {
            finalText = result.text || "Done.";
            break;
          }

          // Execute tools
          for (const call of result.toolCalls) {
            const tc = call as unknown as {
              toolName: string;
              toolCallId: string;
              args: unknown;
            };
            console.log(
              `[${name}] Tool call: ${tc.toolName}(${JSON.stringify(tc.args)})`,
            );

            // Tool was already executed by SDK - get result from toolResults
            const tr = result.toolResults?.find(
              (r: unknown) =>
                (r as { toolCallId: string }).toolCallId === tc.toolCallId,
            ) as unknown as { output: unknown } | undefined;

            const output = tr?.output;
            console.log(
              `[${name}] Tool result: ${JSON.stringify(output).slice(0, 200)}...`,
            );

            // Add tool result as user message (simpler format for next iteration)
            messages.push({
              role: "user",
              content: `Tool ${tc.toolName} result: ${JSON.stringify(output)}`,
            });
          }

          step++;
        }

        if (!finalText) {
          finalText = "I completed the requested actions.";
        }

        await channel.sendMessage({
          chatId: message.chatId,
          text: finalText,
          parseMode: "Markdown",
        });

        console.log(`[${name}] Sent reply to ${message.username}`);
      } catch (error) {
        console.error(`[${name}] Error:`, error);

        try {
          await channel.sendMessage({
            chatId: message.chatId,
            text: `Error: ${(error as Error).message}`,
          });
        } catch (sendError) {
          console.error(
            `[${name}] Failed to send error message to user:`,
            sendError,
          );
        }
      }
    });

    channel.onError((error) => {
      console.error(`[${name}] Channel error:`, error);
    });

    await channel.start();
    await updateGatewayStatus(name, "running");
    this.runningGateways.set(name, { config, channel, provider });

    console.log(`✅ Gateway "${name}" started successfully`);
  }

  async stopGateway(name: string): Promise<void> {
    const running = this.runningGateways.get(name);
    if (!running) {
      console.log(`Gateway "${name}" is not running`);
      return;
    }

    console.log(`Stopping gateway "${name}"...`);
    await running.channel.stop();
    await updateGatewayStatus(name, "stopped");
    this.runningGateways.delete(name);
    console.log(`✅ Gateway "${name}" stopped`);
  }

  async startAll(): Promise<void> {
    const gateways = await listGateways();
    const runningGateways = gateways.filter((g) => g.status === "running");

    console.log(`Found ${runningGateways.length} gateways to start`);

    for (const gateway of runningGateways) {
      try {
        await this.startGateway(gateway.name);
      } catch (error) {
        console.error(`Failed to start gateway "${gateway.name}":`, error);
      }
    }
  }

  async stopAll(): Promise<void> {
    const names = Array.from(this.runningGateways.keys());
    console.log(`Stopping ${names.length} running gateways...`);

    for (const name of names) {
      try {
        await this.stopGateway(name);
      } catch (error) {
        console.error(`Failed to stop gateway "${name}":`, error);
      }
    }
  }

  getRunningGateways(): string[] {
    return Array.from(this.runningGateways.keys());
  }

  isRunning(name: string): boolean {
    return this.runningGateways.has(name);
  }
}

export const gatewayRuntime = new GatewayRuntime();
