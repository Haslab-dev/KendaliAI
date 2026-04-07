import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp, render, Spacer, Newline } from "ink";
import TextInput from "ink-text-input";
import { Database } from "bun:sqlite";
import { eventBus, SystemEvent } from "../server/eventbus";
import os from "os";

// --- Types & Constants ---

interface ChatEntry {
  id: string;
  type: "user" | "assistant" | "action" | "output" | "system";
  content: string;
  name?: string;
  status?: "running" | "pending" | "done" | "error";
  metadata?: any;
}

// --- High-Performance Components ---

const ToolAction: React.FC<{ name: string; status: string; command?: string }> = ({ name, status, command }) => (
    <Box marginY={0} paddingLeft={2}>
        <Text color={status === "running" ? "yellow" : "green"}>{status === "running" ? "⠋" : "✔"}</Text>
        <Text color="dim cyan"> {name.toUpperCase()}</Text>
        {command && <Text dimColor italic> ({command.slice(0, 50)}...)</Text>}
    </Box>
);

const App: React.FC<{ db: Database }> = ({ db }) => {
  const [activeGateway, setActiveGateway] = useState("buddy");
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streamingResponse, setStreamingResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [waitingApproval, setWaitingApproval] = useState<{ id: string; command: string } | null>(null);
  const { exit } = useApp();

  // Load initial gateway
  useEffect(() => {
    try {
        const row = db.query<any, []>("SELECT name FROM gateways LIMIT 1").get();
        if (row) setActiveGateway(row.name);
    } catch (e) {}

    const handleDelta = (d: any) => {
        if (d.status === "start") setStreamingResponse("");
        else setStreamingResponse(prev => prev + d.content);
    };

    const handleActionStart = (d: any) => {
        setEntries(prev => [...prev, { id: d.id, type: "action", name: d.name, status: "running", metadata: { command: d.input.command || JSON.stringify(d.input) }, content: "" }]);
    };

    const handleActionOut = (d: any) => {
        setEntries(prev => {
            const index = prev.findIndex(e => e.id === d.id);
            if (index === -1) return prev;
            const newEntries = [...prev];
            newEntries[index] = { ...newEntries[index], status: "done", content: d.output };
            return newEntries;
        });
    };

    const handleWait = (d: any) => setWaitingApproval({ id: d.id, command: d.command });

    eventBus.on(SystemEvent.AGENT_RESPONSE_DELTA, handleDelta);
    eventBus.on(SystemEvent.TOOL_CALL_START, handleActionStart);
    eventBus.on(SystemEvent.TOOL_CALL_OUTPUT, handleActionOut);
    eventBus.on(SystemEvent.TOOL_WAITING_APPROVAL, handleWait);

    return () => {
      eventBus.off(SystemEvent.AGENT_RESPONSE_DELTA, handleDelta);
      eventBus.off(SystemEvent.TOOL_CALL_START, handleActionStart);
      eventBus.off(SystemEvent.TOOL_CALL_OUTPUT, handleActionOut);
      eventBus.off(SystemEvent.TOOL_WAITING_APPROVAL, handleWait);
    };
  }, []);

  useInput((data, key) => {
    if (key.ctrl && data === "c") exit();
    if (waitingApproval) {
        if (data === "y") { eventBus.emit("USER_APPROVAL_RESPONSE", { approved: true, id: waitingApproval.id }); setWaitingApproval(null); }
        if (data === "n") { eventBus.emit("USER_APPROVAL_RESPONSE", { approved: false, id: waitingApproval.id }); setWaitingApproval(null); }
    }
  });

  const handleSubmit = async (val: string) => {
    if (!val.trim() || isProcessing) return;
    setEntries(prev => [...prev, { id: Math.random().toString(), type: "user", content: val }]);
    setInput("");
    setIsProcessing(true);
    setStreamingResponse("");

    try {
        const { runAgentDirect } = await import("../server/agent-runner.ts");
        const response = await runAgentDirect(db, activeGateway, val);
        setEntries(prev => [...prev, { id: Math.random().toString(), type: "assistant", content: response }]);
    } catch (err: any) {
        setEntries(prev => [...prev, { id: Math.random().toString(), type: "system", content: `Error: ${err.message}` }]);
    } finally {
        setIsProcessing(false);
        setStreamingResponse("");
    }
  };

  // Windowed Chat (Showing last 20 lines/entries to prevent overflow)
  const visibleEntries = entries.slice(-15);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} width="100%">
      {/* Header */}
      <Box justifyContent="space-between" borderStyle="single" borderBottom={true} borderTop={false} borderLeft={false} borderRight={false} borderColor="dim cyan" marginBottom={1}>
          <Text bold color="cyan">KENDALI AI <Text dimColor>v2.1.0-alpha</Text></Text>
          <Box>
            <Text color="magenta">NODE </Text><Text bold>{activeGateway.toUpperCase()}</Text>
            <Text color={isProcessing ? "yellow" : "green"}>  ● {isProcessing ? "PROCESSING" : "READY"}</Text>
          </Box>
      </Box>

      {/* Chat Area - Pure Fluid Scroll */}
      <Box flexDirection="column" minHeight={5} flexGrow={1} overflowY="hidden">
        {visibleEntries.map((e) => (
          <Box key={e.id} flexDirection="column" marginBottom={1}>
            {e.type === "user" && (
                <Box>
                    <Text color="cyan" bold>❯ </Text>
                    <Text bold>{e.content}</Text>
                </Box>
            )}
            
            {e.type === "assistant" && (
                <Box paddingLeft={2}>
                    <Text>{e.content}</Text>
                </Box>
            )}

            {e.type === "action" && <ToolAction name={e.name || "tool"} status={e.status || "done"} command={e.metadata?.command} />}
            
            {e.type === "system" && <Text color="red" italic>[System Error] {e.content}</Text>}
          </Box>
        ))}

        {/* Live Stream View */}
        {streamingResponse && (
            <Box paddingLeft={2} marginBottom={1}>
                <Text>{streamingResponse}</Text>
                <Text color="cyan">▋</Text>
            </Box>
        )}
      </Box>

      {/* Input / Safety Area */}
      {waitingApproval ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={2} marginY={1}>
            <Text bold color="yellow">⚠️ HIGH RISK DETECTED: </Text>
            <Text italic dimColor>{waitingApproval.command} </Text>
            <Text bold color="white"> [y/n]?</Text>
        </Box>
      ) : (
        <Box borderStyle="single" borderColor="dim gray" paddingX={1} marginTop={1}>
            <Text color="cyan" bold>❯ </Text>
            {isProcessing ? (
                <Text dimColor italic>Please wait, the AI is working...</Text>
            ) : (
                <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} placeholder={`Ask ${activeGateway}...`} />
            )}
        </Box>
      )}

      {/* Status Bar */}
      <Box marginTop={1}>
          <Text dimColor italic>Press Ctrl+C to Exit | Gateway: {activeGateway} | PID: {process.pid}</Text>
      </Box>
    </Box>
  );
};

export const launchTUI = (db: Database) => {
  const { waitUntilExit } = render(<App db={db} />);
  return waitUntilExit();
};
