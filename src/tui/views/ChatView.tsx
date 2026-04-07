import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Database } from "bun:sqlite";
import { runAgentDirect } from "../../server/agent-runner.ts";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatViewProps {
  db: Database;
  gatewayName: string;
  onExit: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ db, gatewayName, onExit }) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: `Hey! I'm ${gatewayName}. What are we building today?` }
  ]);
  const [loading, setLoading] = useState(false);

  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
  });

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setInput("");
    try {
      const response = await runAgentDirect(db, gatewayName, input);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "system", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">💬 Chatting with {gatewayName}</Text>
        <Box flexGrow={1} />
        <Text color="gray">Press ESC to return to Dashboard</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {messages.slice(-10).map((msg, i) => (
          <Box key={i} marginBottom={1}>
            <Text bold color={msg.role === "user" ? "blue" : msg.role === "system" ? "red" : "green"}>
              {msg.role === "user" ? "You: " : msg.role === "system" ? "System: " : `${gatewayName}: `}
            </Text>
            <Text>{msg.content}</Text>
          </Box>
        ))}
        {loading && <Text color="yellow">Thinking...</Text>}
      </Box>

      <Box borderStyle="round" borderColor="white" paddingX={1} marginTop={1}>
        <Text color="gray">Message {gatewayName}: </Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
};
