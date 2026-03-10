/**
 * KendaliAI Boot-MD Hook
 *
 * Sends a markdown-formatted message when the gateway starts.
 */

import type {
  HookInstance,
  HookConfig,
  HookContext,
  HookResult,
  BootMdConfig,
} from "./types";

/**
 * Default boot message template
 */
const DEFAULT_BOOT_MESSAGE = `# 🚀 Gateway Started

**Gateway:** {gatewayName}
**Provider:** {provider}
**Model:** {model}
**Channel:** {channel}

Ready to assist!`;

/**
 * Error thrown when boot-md hook configuration is invalid
 */
export class BootMdConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootMdConfigError";
  }
}

/**
 * Create a boot-md hook instance
 */
export function createBootMdHook(config: HookConfig): HookInstance {
  let bootMdConfig: BootMdConfig;
  let hasSentBootMessage = false;
  // Create a local copy of config to avoid mutating the input
  let localConfig = { ...config.config };

  const validateConfig = (): void => {
    if (!localConfig.chatId) {
      throw new BootMdConfigError("chatId is required for boot-md hook");
    }
  };

  const parseConfig = (): BootMdConfig => {
    return {
      chatId: localConfig.chatId as string,
      message: (localConfig.message as string) || DEFAULT_BOOT_MESSAGE,
      sendOnRestart: (localConfig.sendOnRestart as boolean) ?? false,
    };
  };

  const formatMessage = (template: string, context: HookContext): string => {
    return template
      .replace("{gatewayName}", context.gateway.name)
      .replace("{provider}", context.gateway.provider.type)
      .replace("{model}", context.gateway.provider.model)
      .replace("{channel}", context.gateway.channel.type)
      .replace("{timestamp}", context.timestamp.toISOString());
  };

  return {
    name: "boot-md",
    description: "Sends a markdown boot message when the gateway starts",

    async init(configData: Record<string, unknown>): Promise<void> {
      localConfig = { ...localConfig, ...configData };
      validateConfig();
      bootMdConfig = parseConfig();
    },

    async onGatewayStart(context: HookContext): Promise<HookResult> {
      // Skip if already sent and sendOnRestart is false
      if (hasSentBootMessage && !bootMdConfig.sendOnRestart) {
        return { continue: true };
      }

      // Check if channel is available
      if (!context.channel) {
        console.warn("boot-md: No channel available to send boot message");
        return { continue: true };
      }

      try {
        const messageTemplate = bootMdConfig.message || DEFAULT_BOOT_MESSAGE;
        const message = formatMessage(messageTemplate, context);

        await context.channel.sendMessage({
          chatId: bootMdConfig.chatId,
          text: message,
          parseMode: "Markdown",
        });

        hasSentBootMessage = true;
        console.log(`boot-md: Boot message sent to ${bootMdConfig.chatId}`);
      } catch (error) {
        console.error("boot-md: Failed to send boot message:", error);
        // Don't block gateway startup if boot message fails
      }

      return { continue: true };
    },

    async onGatewayStop(): Promise<HookResult> {
      // Reset the sent flag when gateway stops
      hasSentBootMessage = false;
      return { continue: true };
    },
  };
}

/**
 * Default boot-md hook (unconfigured)
 */
export const bootMdHook: HookInstance = {
  name: "boot-md",
  description: "Sends a markdown boot message when the gateway starts",

  async init(): Promise<void> {
    throw new BootMdConfigError(
      "boot-md hook requires configuration. Please provide chatId.",
    );
  },

  async onGatewayStart(): Promise<HookResult> {
    throw new BootMdConfigError(
      "boot-md hook not configured. Please provide chatId.",
    );
  },
};
