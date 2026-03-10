/**
 * KendaliAI TUI - Gateway Creation Wizard
 *
 * Step-by-step wizard for creating a new AI gateway.
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import {
  select,
  input,
  password,
  confirm,
  checkbox,
} from "@inquirer/prompts";
import { saveGateway, generateGatewayId } from "../../gateway/storage";
import type { ProviderType, ChannelType, GatewayConfig } from "../../gateway/types";

interface GatewayWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

interface WizardState {
  step: number;
  provider: string;
  apiKey: string;
  model: string;
  channel: string;
  botToken: string;
  skills: string[];
  hooks: string[];
  name: string;
}

// Available models per provider
const PROVIDER_MODELS: Record<string, string[]> = {
  zai: ["zai-1", "zai-2"],
  deepseek: ["deepseek-chat", "deepseek-coder"],
};

export function GatewayWizard({ onComplete, onCancel }: GatewayWizardProps) {
  const [state, setState] = useState<WizardState>({
    step: 1,
    provider: "",
    apiKey: "",
    model: "",
    channel: "telegram",
    botToken: "",
    skills: [],
    hooks: [],
    name: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const runWizard = async () => {
      setIsProcessing(true);

      try {
        // Step 1: Select Provider
        if (state.step === 1 && !state.provider) {
          const provider = await select({
            message: "Step 1: Select AI Provider",
            choices: [
              { name: "zai", value: "zai" },
              { name: "deepseek", value: "deepseek" },
              { name: "openai (coming soon)", value: "openai", disabled: true },
              {
                name: "anthropic (coming soon)",
                value: "anthropic",
                disabled: true,
              },
            ],
          });

          if (isMounted) {
            setState((s) => ({ ...s, step: 2, provider }));
          }
          return;
        }

        // Step 2: Enter API Key
        if (state.step === 2 && state.provider && !state.apiKey) {
          const apiKey = await password({
            message: `Step 2: Enter API Key for ${state.provider}`,
            mask: "*",
            validate: (value) => {
              if (!value || value.length < 10) {
                return "API key must be at least 10 characters";
              }
              return true;
            },
          });

          if (isMounted) {
            setState((s) => ({ ...s, step: 3, apiKey }));
          }
          return;
        }

        // Step 3: Select Model
        if (state.step === 3 && state.provider && !state.model) {
          const models = PROVIDER_MODELS[state.provider] || [];
          const choices = [
            ...models.map((m) => ({ name: m, value: m })),
            { name: "[Type custom model name...]", value: "__custom__" },
          ];

          let model = await select({
            message: "Step 3: Select Model",
            choices,
          });

          if (model === "__custom__") {
            model = await input({
              message: "Enter custom model name",
              validate: (value) => {
                if (!value || value.length < 1) {
                  return "Model name is required";
                }
                return true;
              },
            });
          }

          if (isMounted) {
            setState((s) => ({ ...s, step: 4, model }));
          }
          return;
        }

        // Step 4: Select Channel
        if (state.step === 4 && !state.channel) {
          const channel = await select({
            message: "Step 4: Select Channel",
            choices: [
              { name: "Telegram (Bot API)", value: "telegram" },
              { name: "Discord (coming soon)", value: "discord", disabled: true },
              {
                name: "WhatsApp (coming soon)",
                value: "whatsapp",
                disabled: true,
              },
            ],
            default: "telegram",
          });

          if (isMounted) {
            setState((s) => ({ ...s, step: 5, channel }));
          }
          return;
        }

        // Step 5: Enter Bot Token
        if (state.step === 5 && !state.botToken) {
          const botToken = await password({
            message: "Step 5: Enter Telegram Bot Token",
            mask: "*",
            validate: (value) => {
              if (!value || !value.includes(":")) {
                return "Invalid bot token format (should be: 123456789:ABC...)";
              }
              return true;
            },
          });

          if (isMounted) {
            setState((s) => ({ ...s, step: 6, botToken }));
          }
          return;
        }

        // Step 6: Configure Skills?
        if (state.step === 6) {
          const configureSkills = await confirm({
            message: "Step 6: Configure Skills?",
            default: false,
          });

          if (configureSkills) {
            const skills = await checkbox({
              message: "Select skills to enable",
              choices: [
                { name: "web-search", value: "web-search" },
                { name: "code-exec", value: "code-exec" },
                { name: "image-gen", value: "image-gen" },
              ],
            });

            if (isMounted) {
              setState((s) => ({ ...s, step: 7, skills }));
            }
          } else {
            if (isMounted) {
              setState((s) => ({ ...s, step: 7 }));
            }
          }
          return;
        }

        // Step 7: Enable Hooks?
        if (state.step === 7) {
          const enableHooks = await confirm({
            message: "Step 7: Enable Hooks?",
            default: false,
          });

          if (enableHooks) {
            const hooks = await checkbox({
              message: "Select hooks to enable",
              choices: [
                { name: "boot-md - Markdown boot message", value: "boot-md" },
                {
                  name: "command-logger - Log all commands",
                  value: "command-logger",
                },
                {
                  name: "session-memory - Session-based memory",
                  value: "session-memory",
                },
              ],
            });

            if (isMounted) {
              setState((s) => ({ ...s, step: 8, hooks }));
            }
          } else {
            if (isMounted) {
              setState((s) => ({ ...s, step: 8 }));
            }
          }
          return;
        }

        // Step 8: Gateway Name & Save
        if (state.step === 8 && !state.name) {
          const defaultName = `my-${state.channel}-bot`;
          const name = await input({
            message: "Step 8: Gateway Name",
            default: defaultName,
            validate: (value) => {
              if (!value.match(/^[a-z0-9-]+$/)) {
                return "Name must be lowercase letters, numbers, and hyphens only";
              }
              return true;
            },
          });

          if (isMounted) {
            setState((s) => ({ ...s, name }));
          }
          return;
        }

        // Show summary and confirm save
        if (state.step === 8 && state.name) {
          console.log("\n📋 Summary:");
          console.log(`   Provider:   ${state.provider}`);
          console.log(`   Model:      ${state.model}`);
          console.log(`   Channel:    ${state.channel}`);
          console.log(
            `   Skills:     ${state.skills.length > 0 ? state.skills.join(", ") : "None"}`
          );
          console.log(
            `   Hooks:      ${state.hooks.length > 0 ? state.hooks.join(", ") : "None"}`
          );
          console.log(`   Name:       ${state.name}\n`);

          const shouldSave = await confirm({
            message: "Save gateway?",
            default: true,
          });

          if (shouldSave) {
            // Create gateway config
            const config: GatewayConfig = {
              id: generateGatewayId(),
              name: state.name,
              provider: {
                type: state.provider as ProviderType,
                apiKey: state.apiKey, // TODO: Encrypt this
                model: state.model,
              },
              channel: {
                type: state.channel as ChannelType,
                botToken: state.botToken, // TODO: Encrypt this
              },
              skills: state.skills,
              hooks: state.hooks.map((h) => ({ name: h, enabled: true, config: {} })),
              createdAt: new Date().toISOString(),
              status: "stopped",
            };

            // Save gateway to file
            await saveGateway(config);
            console.log(`\n✅ Gateway "${state.name}" saved to gateways/${state.name}.json\n`);
            
            if (isMounted) {
              onComplete();
            }
          } else {
            if (isMounted) {
              onCancel();
            }
          }
        }
      } catch (error) {
        // User cancelled
        if (isMounted) {
          onCancel();
        }
      } finally {
        if (isMounted) {
          setIsProcessing(false);
        }
      }
    };

    runWizard();

    return () => {
      isMounted = false;
    };
  }, [state, onComplete, onCancel]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🚀 Create New Gateway
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text dimColor>
          Step {state.step}/8:{" "}
          {state.step === 1 && "Select Provider"}
          {state.step === 2 && "Enter API Key"}
          {state.step === 3 && "Select Model"}
          {state.step === 4 && "Select Channel"}
          {state.step === 5 && "Enter Bot Token"}
          {state.step === 6 && "Configure Skills"}
          {state.step === 7 && "Enable Hooks"}
          {state.step === 8 && "Save Gateway"}
        </Text>
      </Box>

      {isProcessing && (
        <Box marginTop={1}>
          <Text dimColor>Processing...</Text>
        </Box>
      )}
    </Box>
  );
}
