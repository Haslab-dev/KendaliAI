/**
 * KendaliAI TUI - Gateway List Component
 *
 * Displays a list of all configured gateways.
 */

import React, { useEffect, useState, useRef } from "react";
import { Box, Text } from "ink";
import { select } from "@inquirer/prompts";
import { listGatewayInfo } from "../../gateway/storage";
import type { GatewayInfo } from "../../gateway/types";

interface GatewayListProps {
  onSelect: (name: string) => void;
  onBack: () => void;
  onInteractiveChange: (isInteractive: boolean) => void;
}

export function GatewayList({
  onSelect,
  onBack,
  onInteractiveChange,
}: GatewayListProps) {
  const [isComplete, setIsComplete] = useState(false);
  const listStarted = useRef(false);

  useEffect(() => {
    // Prevent multiple instances
    if (listStarted.current) return;
    listStarted.current = true;

    let isMounted = true;

    const showGatewayList = async () => {
      try {
        // Load gateways first
        const gateways = await listGatewayInfo();

        if (!isMounted) return;

        // Handle empty gateways case
        if (gateways.length === 0) {
          // Wait a moment then go back to menu
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (isMounted) {
            setIsComplete(true);
            onBack();
          }
          return;
        }

        // Show selection prompt
        const choices = [
          ...gateways.map((g) => ({
            name: `${g.name} (${g.provider}/${g.channel}) - ${g.status}`,
            value: g.name,
          })),
          { name: "← Back to menu", value: "__back__" },
        ];

        const answer = await select({
          message: "Select a gateway to view logs",
          choices,
        });

        if (!isMounted) return;

        setIsComplete(true);
        if (answer === "__back__") {
          onBack();
        } else {
          onSelect(answer);
        }
      } catch (error) {
        // User cancelled (Ctrl+C)
        if (isMounted) {
          setIsComplete(true);
          onBack();
        }
      }
    };

    showGatewayList();

    return () => {
      isMounted = false;
    };
  }, [onSelect, onBack, onInteractiveChange]);

  // Don't render anything while inquirer prompts are active
  if (!isComplete) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Your Gateways</Text>
      </Box>
      <Text dimColor>Returning to menu...</Text>
    </Box>
  );
}
