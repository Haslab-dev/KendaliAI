/**
 * KendaliAI Hook Registry
 *
 * Factory and registry for managing hooks.
 */

import type {
  HookInstance,
  HookConfig,
  HookName,
  HookContext,
  MessageHookContext,
  ErrorHookContext,
  HookResult,
} from "./types";
import { createBootMdHook, bootMdHook } from "./boot-md";
import { createCommandLoggerHook, commandLoggerHook } from "./command-logger";
import { createSessionMemoryHook, sessionMemoryHook } from "./session-memory";

// Re-export types
export type {
  HookInstance,
  HookConfig,
  HookName,
  HookEvent,
  HookContext,
  MessageHookContext,
  ErrorHookContext,
  HookResult,
  BootMdConfig,
  CommandLoggerConfig,
  SessionMemoryConfig,
} from "./types";

// Re-export hook creators
export { createBootMdHook, bootMdHook } from "./boot-md";
export { createCommandLoggerHook, commandLoggerHook } from "./command-logger";
export {
  createSessionMemoryHook,
  sessionMemoryHook,
  getSessionHistory,
  getSessionStats,
} from "./session-memory";

/**
 * Error thrown when a hook is not found
 */
export class HookNotFoundError extends Error {
  constructor(public readonly hookName: HookName) {
    super(
      `Hook '${hookName}' not found. Available hooks: boot-md, command-logger, session-memory`,
    );
    this.name = "HookNotFoundError";
  }
}

/**
 * Error thrown when hook creation fails
 */
export class HookCreationError extends Error {
  constructor(
    public readonly hookName: string,
    public readonly cause?: Error,
  ) {
    super(
      `Failed to create hook '${hookName}': ${cause?.message || "Unknown error"}`,
    );
    this.name = "HookCreationError";
  }
}

// Hook registry
const hooks = new Map<HookName, HookInstance>();

/**
 * Initialize hooks from configuration array
 */
export async function initializeHooks(configs: HookConfig[]): Promise<void> {
  for (const hookConfig of configs) {
    if (hookConfig.enabled !== false) {
      try {
        const hook = createHook(hookConfig.name, hookConfig);
        hooks.set(hookConfig.name, hook);

        // Initialize the hook if it has an init method
        if (hook.init) {
          await hook.init(hookConfig.config);
        }

        console.log(`Hook '${hookConfig.name}' initialized`);
      } catch (error) {
        console.error(`Failed to initialize hook '${hookConfig.name}':`, error);
      }
    }
  }
}

/**
 * Create a hook instance based on name
 */
export function createHook(name: HookName, config: HookConfig): HookInstance {
  switch (name) {
    case "boot-md":
      return createBootMdHook(config);

    case "command-logger":
      return createCommandLoggerHook(config);

    case "session-memory":
      return createSessionMemoryHook(config);

    default:
      throw new HookNotFoundError(name);
  }
}

/**
 * Get a hook by name
 */
export function getHook(name: HookName): HookInstance | undefined {
  return hooks.get(name);
}

/**
 * Get all registered hooks
 */
export function getAllHooks(): HookInstance[] {
  return Array.from(hooks.values());
}

/**
 * Check if a hook is registered
 */
export function hasHook(name: HookName): boolean {
  return hooks.has(name);
}

/**
 * Execute onGatewayStart for all registered hooks
 */
export async function executeOnGatewayStart(
  context: HookContext,
): Promise<void> {
  for (const hook of hooks.values()) {
    if (hook.onGatewayStart) {
      try {
        const result = await hook.onGatewayStart(context);
        if (!result.continue) {
          console.warn(`Hook '${hook.name}' requested to stop gateway start`);
        }
      } catch (error) {
        console.error(`Hook '${hook.name}' onGatewayStart error:`, error);
      }
    }
  }
}

/**
 * Execute onGatewayStop for all registered hooks
 */
export async function executeOnGatewayStop(
  context: HookContext,
): Promise<void> {
  for (const hook of hooks.values()) {
    if (hook.onGatewayStop) {
      try {
        await hook.onGatewayStop(context);
      } catch (error) {
        console.error(`Hook '${hook.name}' onGatewayStop error:`, error);
      }
    }
  }
}

/**
 * Execute onMessageReceive for all registered hooks
 */
export async function executeOnMessageReceive(
  context: MessageHookContext,
): Promise<MessageHookContext> {
  let currentContext = context;

  for (const hook of hooks.values()) {
    if (hook.onMessageReceive) {
      try {
        const result = await hook.onMessageReceive(currentContext);
        const sessionData = result.data as { session?: unknown } | undefined;
        if (sessionData?.session) {
          // Update context with session data
          currentContext = {
            ...currentContext,
            metadata: {
              ...currentContext.metadata,
              session: sessionData.session,
            },
          };
        }
        if (!result.continue) {
          break;
        }
      } catch (error) {
        console.error(`Hook '${hook.name}' onMessageReceive error:`, error);
      }
    }
  }

  return currentContext;
}

/**
 * Execute onMessageSend for all registered hooks
 */
export async function executeOnMessageSend(
  context: MessageHookContext,
): Promise<void> {
  for (const hook of hooks.values()) {
    if (hook.onMessageSend) {
      try {
        await hook.onMessageSend(context);
      } catch (error) {
        console.error(`Hook '${hook.name}' onMessageSend error:`, error);
      }
    }
  }
}

/**
 * Execute onError for all registered hooks
 */
export async function executeOnError(context: ErrorHookContext): Promise<void> {
  for (const hook of hooks.values()) {
    if (hook.onError) {
      try {
        await hook.onError(context);
      } catch (error) {
        console.error(`Hook '${hook.name}' onError error:`, error);
      }
    }
  }
}

/**
 * Destroy all registered hooks
 */
export async function destroyAllHooks(): Promise<void> {
  for (const hook of hooks.values()) {
    if (hook.destroy) {
      try {
        await hook.destroy();
      } catch (error) {
        console.error(`Hook '${hook.name}' destroy error:`, error);
      }
    }
  }
  hooks.clear();
  console.log("All hooks destroyed");
}
