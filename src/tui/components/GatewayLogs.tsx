/**
 * KendaliAI TUI - Gateway Logs Component
 *
 * Displays logs for a specific gateway.
 */

import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

interface GatewayLogsProps {
  gatewayName: string | null;
  onBack: () => void;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

// Temporary mock function - will be replaced with actual log reading
async function getGatewayLogs(name: string): Promise<LogEntry[]> {
  // TODO: Read from logs/{name}.log
  return [
    {
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `Logs for ${name} will appear here...`,
    },
  ];
}

export function GatewayLogs({ gatewayName, onBack }: GatewayLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gatewayName) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadLogs = async () => {
      setLoading(true);
      try {
        const logEntries = await getGatewayLogs(gatewayName);
        if (isMounted) {
          setLogs(logEntries);
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadLogs();

    // Refresh logs every 5 seconds
    const interval = setInterval(loadLogs, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [gatewayName]);

  if (!gatewayName) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">No gateway selected</Text>
        <Box marginTop={1}>
          <Text dimColor>Press ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Loading logs for {gatewayName}...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Logs: {gatewayName}
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        {logs.length === 0 ? (
          <Text dimColor>No logs available</Text>
        ) : (
          logs.map((log, index) => (
            <Box key={index}>
              <Text dimColor>[{log.timestamp}] </Text>
              <Text
                color={
                  log.level === "ERROR"
                    ? "red"
                    : log.level === "WARN"
                      ? "yellow"
                      : log.level === "INFO"
                        ? "green"
                        : "white"
                }
              >
                {log.level.padEnd(5)}{" "}
              </Text>
              <Text>{log.message}</Text>
            </Box>
          ))
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Auto-refresh: ON | Press ESC to go back</Text>
      </Box>
    </Box>
  );
}
