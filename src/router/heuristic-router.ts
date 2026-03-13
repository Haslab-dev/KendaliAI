import { Intent } from "../types/intent";

/**
 * Heuristic Router - Fast, zero-token intent detection based on keywords
 */
export function heuristicRouter(message: string): Intent | "unknown" {
  const msg = message.toLowerCase();

  // Agent/Tool intent keywords
  const agentKeywords = [
    "run", "execute", "shell", "check", "terminal", "command", 
    "ls", "git", "file", "mkdir", "touch", "grep", "find",
    "calculate", "convert", "weather", "search", "browse"
  ];
  
  if (agentKeywords.some(kw => msg.includes(kw))) {
    return "agent";
  }

  // RAG intent keywords
  const ragKeywords = [
    "what is", "how do I", "policy", "documentation", "info about",
    "details on", "knowledge base", "our", "tell me about", "docs"
  ];

  if (ragKeywords.some(kw => msg.includes(kw))) {
    return "rag";
  }

  // Chat intent triggers (very short messages, greetings)
  const chatTriggers = ["hi", "hello", "hey", "how are you", "who are you"];
  if (chatTriggers.some(kw => msg === kw || msg.startsWith(kw + " "))) {
    return "chat";
  }

  return "unknown";
}
