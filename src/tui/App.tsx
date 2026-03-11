/**
 * KendaliAI TUI - Main Application Component
 *
 * Handles the main menu and navigation between different screens.
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useApp } from "ink";
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

  // Handle menu selection
  const handleMenuSelect = useCallback((action: Screen) => {
    if (action === "exit") {
      // Exit directly - the confirmation is handled in MainMenu
      exit();
      return;
    }

    setScreen(action);
  }, [exit]);

  // Handle wizard completion
  const handleWizardComplete = useCallback((gatewayName: string, shouldStart: boolean) => {
    if (shouldStart) {
      // If user chose to start, show the logs view
      setSelectedGateway(gatewayName);
      setScreen("view-logs");
    } else {
      // Otherwise exit the TUI
      exit();
    }
  }, [exit]);

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
            onInteractiveChange={() => {}}
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
            onInteractiveChange={() => {}}
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
          </Box>
        );

      default:
        return (
          <Box flexDirection="column" padding={1}>
            <Text dimColor>
              Screen "{screen}" coming soon...
            </Text>
          </Box>
        );
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Header />
      {renderScreen()}
    </Box>
  );
}
