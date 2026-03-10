/**
 * KendaliAI TUI - Main Menu Component
 *
 * Displays the main menu with navigation options.
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { select } from "@inquirer/prompts";
import type { Screen } from "../App";

interface MainMenuProps {
  onSelect: (action: Screen) => void;
  onInteractiveChange: (isInteractive: boolean) => void;
}

export function MainMenu({ onSelect, onInteractiveChange }: MainMenuProps) {
  const [selectedAction, setSelectedAction] = useState<Screen | null>(null);

  useEffect(() => {
    let isMounted = true;

    const showMenu = async () => {
      onInteractiveChange(true);

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
          onInteractiveChange(false);
          onSelect(answer as Screen);
        }
      } catch (error) {
        // User cancelled (Ctrl+C)
        if (isMounted) {
          onInteractiveChange(false);
          onSelect("exit");
        }
      }
    };

    showMenu();

    return () => {
      isMounted = false;
    };
  }, [onSelect, onInteractiveChange]);

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
