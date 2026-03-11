/**
 * KendaliAI TUI - Gateway Creation Wizard
 *
 * Step-by-step wizard for creating a new AI gateway.
 */

import React, { useEffect, useState, useRef } from "react";
import { Box, Text } from "ink";
import {
  select,
  input,
  password,
  confirm,
  checkbox,
} from "@inquirer/prompts";
import { saveGateway, generateGatewayId } from "../../gateway/storage";
import { gatewayRuntime } from "../../gateway/runtime";
import type { ProviderType, ChannelType, GatewayConfig } from "../../gateway/types";
import {
  createProvider,
  ProviderNotImplementedError,
  type ProviderInstance,
  type ModelInfo,
} from "../../providers";

interface GatewayWizardProps {
  onComplete: (gatewayName: string, shouldStart: boolean) => void;
  onCancel: () => void;
}

interface WizardState {
  step: number;
  provider: string;
  apiKey: string;
  baseURL?: string;
  model: string;
  channel: string;
  botToken: string;
  skills: string[];
  hooks: string[];
  name: string;
  agentName: string;
}

export function GatewayWizard({ onComplete, onCancel }: GatewayWizardProps) {
  const [providerInstance, setProviderInstance] = useState<ProviderInstance | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const wizardStarted = useRef(false);

  // Get available models from provider instance or use defaults
  const getAvailableModels = (provider: string, providerInst: ProviderInstance | null): ModelInfo[] => {
    if (providerInst) {
      return providerInst.listModels();
    }
    // Fallback defaults
    if (provider === "zai") {
      return [
        { id: "zai-1", name: "Zai-1", type: "chat", contextLength: 128000 },
        { id: "zai-2", name: "Zai-2", type: "chat", contextLength: 128000 },
      ];
    }
    if (provider === "deepseek") {
      return [
        { id: "deepseek-chat", name: "DeepSeek Chat", type: "chat", contextLength: 64000 },
        { id: "deepseek-coder", name: "DeepSeek Coder", type: "chat", contextLength: 64000 },
      ];
    }
    return [];
  };

  useEffect(() => {
    // Prevent multiple wizard instances
    if (wizardStarted.current) return;
    wizardStarted.current = true;

    let isMounted = true;

    const runWizard = async () => {
      try {
        // Step 1: Select Provider
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

        if (!isMounted) return;

        // Step 2: Enter API Key
        const apiKey = await password({
          message: `Step 2: Enter API Key for ${provider}`,
          mask: "*",
          validate: (value) => {
            if (!value || value.length < 10) {
              return "API key must be at least 10 characters";
            }
            return true;
          },
        });

        if (!isMounted) return;

        // Ask for custom base URL (optional)
        const useCustomURL = await confirm({
          message: "Use custom API base URL?",
          default: false,
        });

        let baseURL: string | undefined;
        if (useCustomURL) {
          baseURL = await input({
            message: "Enter custom base URL",
            default: provider === "zai" 
              ? "https://api.zai.ai/v1" 
              : "https://api.deepseek.com/v1",
          });
        }

        if (!isMounted) return;

        // Create provider instance to validate API key and get models
        let providerInst: ProviderInstance | null = null;
        try {
          providerInst = createProvider(provider as ProviderType, {
            apiKey,
            baseURL,
          });
        } catch (error) {
          if (error instanceof ProviderNotImplementedError) {
            console.error(`\n❌ ${error.message}`);
            console.log("Please select a different provider.\n");
            if (isMounted) {
              onCancel();
            }
            return;
          }
          throw error;
        }

        if (!isMounted) return;

        // Update state with provider info for getAvailableModels
        setProviderInstance(providerInst);

        // Step 3: Select Model
        const models = getAvailableModels(provider, providerInst);
        const modelChoices = [
          ...models.map((m) => ({ 
            name: `${m.name} (${m.contextLength?.toLocaleString() || 'unknown'} tokens)`, 
            value: m.id 
          })),
          { name: "[Type custom model name...]", value: "__custom__" },
        ];

        let model = await select({
          message: "Step 3: Select Model",
          choices: modelChoices,
        });

        if (!isMounted) return;

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

        if (!isMounted) return;

        // Step 4: Select Channel
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

        if (!isMounted) return;

        // Step 5: Enter Bot Token
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

        if (!isMounted) return;

        // Step 6: Configure Skills?
        const configureSkills = await confirm({
          message: "Step 6: Configure Skills?",
          default: false,
        });

        let skills: string[] = [];
        if (configureSkills) {
          skills = await checkbox({
            message: "Select skills to enable",
            choices: [
              { name: "web-search", value: "web-search" },
              { name: "code-exec", value: "code-exec" },
              { name: "image-gen", value: "image-gen" },
            ],
          });
        }

        if (!isMounted) return;

        // Step 7: Enable Hooks?
        const enableHooks = await confirm({
          message: "Step 7: Enable Hooks?",
          default: false,
        });

        let hooks: string[] = [];
        if (enableHooks) {
          hooks = await checkbox({
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
        }

        if (!isMounted) return;

        // Step 8: Gateway Name
        const defaultName = `my-${channel}-bot`;
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

        if (!isMounted) return;

        // Step 9: Agent Name (the AI's identity)
        const agentName = await input({
          message: "Step 9: Agent Name (what the AI calls itself)",
          default: "KendaliAI",
          validate: (value) => {
            if (!value || value.length < 1) {
              return "Agent name is required";
            }
            if (value.length > 50) {
              return "Agent name must be 50 characters or less";
            }
            return true;
          },
        });

        if (!isMounted) return;

        // Show summary and confirm save
        console.log("\n📋 Summary:");
        console.log(`   Provider:   ${provider}`);
        console.log(`   Model:      ${model}`);
        console.log(`   Channel:    ${channel}`);
        console.log(`   Agent Name: ${agentName}`);
        console.log(
          `   Skills:     ${skills.length > 0 ? skills.join(", ") : "None"}`
        );
        console.log(
          `   Hooks:      ${hooks.length > 0 ? hooks.join(", ") : "None"}`
        );
        console.log(`   Name:       ${name}\n`);

        const shouldSave = await confirm({
          message: "Save gateway?",
          default: true,
        });

        if (!isMounted) return;

        if (shouldSave) {
          // Create gateway config
          const config: GatewayConfig = {
            id: generateGatewayId(),
            name: name,
            agentName: agentName,
            provider: {
              type: provider as ProviderType,
              apiKey: apiKey, // TODO: Encrypt this
              baseURL: baseURL,
              model: model,
            },
            channel: {
              type: channel as ChannelType,
              botToken: botToken, // TODO: Encrypt this
            },
            skills: skills,
            hooks: hooks.map((h) => ({ name: h, enabled: true, config: {} })),
            createdAt: new Date().toISOString(),
            status: "stopped",
          };

          // Save gateway to file
          await saveGateway(config);
          console.log(`\n✅ Gateway "${name}" saved to gateways/${name}.json\n`);

          // Ask if user wants to start the gateway
          const shouldStart = await confirm({
            message: "Start the gateway now?",
            default: true,
          });

          if (!isMounted) return;

          if (shouldStart) {
            // Start the gateway runtime
            try {
              await gatewayRuntime.startGateway(name);
              console.log(`\n🚀 Gateway "${name}" started!\n`);
            } catch (error) {
              console.error(`\n❌ Failed to start gateway: ${error}\n`);
            }
          }

          if (isMounted) {
            setIsComplete(true);
            onComplete(name, shouldStart);
          }
        } else {
          if (isMounted) {
            setIsComplete(true);
            onCancel();
          }
        }
      } catch (error) {
        // User cancelled (Ctrl+C)
        if (isMounted) {
          setIsComplete(true);
          onCancel();
        }
      }
    };

    runWizard();

    return () => {
      isMounted = false;
    };
  }, [onComplete, onCancel]);

  // Don't render anything while inquirer prompts are active
  // This prevents Ink from interfering with inquirer's terminal control
  if (!isComplete) {
    return null;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🚀 Create New Gateway
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text dimColor>
          Wizard complete. Returning to menu...
        </Text>
      </Box>
    </Box>
  );
}
