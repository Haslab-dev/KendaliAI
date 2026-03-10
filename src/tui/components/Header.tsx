/**
 * KendaliAI TUI - Header Component
 *
 * Displays the application header with branding.
 */

import React from "react";
import { Box, Text } from "ink";

export function Header() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">
          ╔═══════════════════════════════════════════════════════════════╗
        </Text>
      </Box>
      <Box>
        <Text bold color="cyan">
          ║
        </Text>
        <Text bold color="white">
          {"                        "}
          <Text bold color="green">
            KendaliAI
          </Text>
          {"                          "}
        </Text>
        <Text bold color="cyan">
          ║
        </Text>
      </Box>
      <Box>
        <Text bold color="cyan">
          ║
        </Text>
        <Text dimColor>
          {"           OpenClaw Clone - AI Gateway Manager                 "}
        </Text>
        <Text bold color="cyan">
          ║
        </Text>
      </Box>
      <Box>
        <Text bold color="cyan">
          ╚═══════════════════════════════════════════════════════════════╝
        </Text>
      </Box>
    </Box>
  );
}
