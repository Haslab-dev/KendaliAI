/**
 * KendaliAI TUI - Main Application Component
 *
 * Handles the main menu and navigation between different screens.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput, useStdin } from "ink";
import { select, confirm } from "@inquirer/prompts";
import { MainMenu } from "./components/MainMenu";
import { GatewayList } from "./components/GatewayList";
import { GatewayWizard } from "./wizard/GatewayWizard";
import { GatewayLogs } from "./components/GatewayLogs";
import { Header } from "./components/Header";

export type Screen =
  | "menu"
  | "create-gateway"
  | "list-gateways"
  | "start-gateway"
  | "stop-gateway"
  | "view-logs"
  | "delete-gateway"
  | "settings"
  | "exit";

export function App() {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("menu");
  const [selectedGateway, setSelectedGateway] = useState<string | null>(null);
  const [isInteractive, setIsInteractive] = useState(false);

  // Handle global key presses
  useInput(
    (input, key) => {
      if (key.escape && !isInteractive) {
        if (screen !== "menu") {
          setScreen("menu");
        } else {
          exit();
        }
      }
    },
    { isActive: !isInteractive }
  );

  // Handle menu selection
  const handleMenuSelect = useCallback(async (action: Screen) => {
    if (action === "exit") {
      const shouldExit = await confirm({
        message: "Are you sure you want to exit?",
        default: false,
      });
      if (shouldExit) {
        exit();
      }
      return;
    }

    setScreen(action);
  }, [exit]);

  // Handle wizard completion
  const handleWizardComplete = useCallback(() => {
    setScreen("list-gateways");
  }, []);

  // Handle back to menu
  const handleBack = useCallback(() => {
    setScreen("menu");
    setSelectedGateway(null);
  }, []);

  // Render current screen
  const renderScreen = () => {
    switch (screen) {
      case "menu":
        return (
          <MainMenu
            onSelect={handleMenuSelect}
            onInteractiveChange={setIsInteractive}
          />
        );

      case "create-gateway":
        return (
          <GatewayWizard
            onComplete={handleWizardComplete}
            onCancel={handleBack}
          />
        );

      case "list-gateways":
        return (
          <GatewayList
            onSelect={(name) => {
              setSelectedGateway(name);
              setScreen("view-logs");
            }}
            onBack={handleBack}
            onInteractiveChange={setIsInteractive}
          />
        );

      case "view-logs":
        return (
          <GatewayLogs
            gatewayName={selectedGateway}
            onBack={handleBack}
          />
        );

      case "settings":
        return (
          <Box flexDirection="column" padding={1}>
            <Text bold color="cyan">
              Settings
            </Text>
            <Text dimColor>Settings page coming soon...</Text>
            <Text dimColor>Press ESC to go back</Text>
          </Box>
        );

      default:
        return (
          <Box flexDirection="column" padding={1}>
            <Text dimColor>
              Screen "{screen}" coming soon... Press ESC to go back
            </Text>
          </Box>
        );
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header />
      {renderScreen()}
      {screen !== "menu" && !isInteractive && (
        <Box marginTop={1}>
          <Text dimColor>Press ESC to go back</Text>
        </Box>
      )}
    </Box>
  );
}
