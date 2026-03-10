/**
 * KendaliAI TUI - Gateway List Component
 *
 * Displays a list of all configured gateways.
 */

import React, { useEffect, useState } from "react";
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
  const [gateways, setGateways] = useState<GatewayInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadGateways = async () => {
      setLoading(true);
      try {
        const list = await listGatewayInfo();
        if (isMounted) {
          setGateways(list);
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadGateways();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading || gateways.length === 0) return;

    let isMounted = true;

    const showGatewaySelect = async () => {
      onInteractiveChange(true);

      try {
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

        if (isMounted) {
          onInteractiveChange(false);
          if (answer === "__back__") {
            onBack();
          } else {
            onSelect(answer);
          }
        }
      } catch (error) {
        if (isMounted) {
          onInteractiveChange(false);
          onBack();
        }
      }
    };

    showGatewaySelect();

    return () => {
      isMounted = false;
    };
  }, [loading, gateways, onSelect, onBack, onInteractiveChange]);

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text bold>Loading gateways...</Text>
      </Box>
    );
  }

  if (gateways.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="yellow">
          No gateways configured
        </Text>
        <Box marginTop={1}>
          <Text dimColor>
            Create a new gateway to get started.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Your Gateways</Text>
      </Box>
      {gateways.map((g) => (
        <Box key={g.name}>
          <Text>
            {"  "}
            <Text bold>{g.name}</Text>
            {" - "}
            <Text color="cyan">{g.provider}</Text>
            {"/"}
            <Text color="green">{g.channel}</Text>
            {" - "}
            <Text
              color={g.status === "running" ? "green" : "yellow"}
            >
              {g.status}
            </Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
}
