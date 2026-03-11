/**
 * KendaliAI TUI - Main Menu Component
 *
 * Displays the main menu with navigation options.
 */

import React, { useEffect, useState, useRef } from "react";
import { Box, Text } from "ink";
import { select } from "@inquirer/prompts";
import type { Screen } from "../App";

interface MainMenuProps {
  onSelect: (action: Screen) => void;
  onInteractiveChange: (isInteractive: boolean) => void;
}

export function MainMenu({ onSelect, onInteractiveChange }: MainMenuProps) {
  const [isComplete, setIsComplete] = useState(false);
  const [selectedAction, setSelectedAction] = useState<Screen | null>(null);
  const menuStarted = useRef(false);

  useEffect(() => {
    // Prevent multiple menu instances
    if (menuStarted.current) return;
    menuStarted.current = true;

    let isMounted = true;

    const showMenu = async () => {
      try {
        const answer = await select({
          message: "Select an action",
          choices: [
            { name: "🚀 Create New Gateway", value: "create-gateway" },
            { name: "📋 List Gateways", value: "list-gateways" },
            { name: "▶️  Start Gateway", value: "start-gateway" },
            { name: "⏹️  Stop Gateway", value: "stop-gateway" },
            { name: "📄 View Gateway Logs", value: "view-logs" },
            { name: "🗑️  Delete Gateway", value: "delete-gateway" },
            { name: "⚙️  Settings", value: "settings" },
            { name: "🚪 Exit", value: "exit" },
          ],
        });

        if (isMounted) {
          setSelectedAction(answer as Screen);
          setIsComplete(true);
          onSelect(answer as Screen);
        }
      } catch (error) {
        // User cancelled (Ctrl+C)
        if (isMounted) {
          setIsComplete(true);
          onSelect("exit");
        }
      }
    };

    showMenu();

    return () => {
      isMounted = false;
    };
  }, [onSelect, onInteractiveChange]);

  // Don't render anything while inquirer prompts are active
  if (!isComplete) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>
          Main Menu
        </Text>
      </Box>
      {selectedAction && (
        <Box>
          <Text dimColor>Navigating to {selectedAction}...</Text>
        </Box>
      )}
    </Box>
  );
}
