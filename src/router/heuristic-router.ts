import { Intent } from "../types/intent";

/**
 * Heuristic Router - Fast, zero-token intent detection based on keywords
 */
export function heuristicRouter(message: string): Intent | "unknown" {
  const msg = message.toLowerCase().trim();

  // 1. Chat intent triggers (highest priority for identity/greetings)
  const chatTriggers = [
    "hi",
    "hello",
    "hey",
    "how are you",
    "who are you",
    "what are you",
  ];
  if (
    chatTriggers.some(
      (kw) => msg === kw || msg.startsWith(kw) || msg.includes("identity"),
    )
  ) {
    return "chat";
  }

  // 2. Agent/Tool intent keywords
  const agentKeywords = [
    "run",
    "execute",
    "shell",
    "check",
    "terminal",
    "command",
    "ls",
    "git",
    "file",
    "mkdir",
    "touch",
    "grep",
    "find",
    "calculate",
    "convert",
    "weather",
    "search",
    "browse",
  ];

  if (agentKeywords.some((kw) => msg.includes(kw))) {
    return "agent";
  }

  // 3. RAG intent keywords
  const ragKeywords = [
    "how do i",
    "policy",
    "documentation",
    "info about",
    "details on",
    "knowledge base",
    "our",
    "tell me about",
    "docs",
  ];

  // Also "what is" but only if not followed by "identity" or similar
  if (
    ragKeywords.some((kw) => msg.includes(kw)) ||
    (msg.includes("what is") && !msg.includes("your identity"))
  ) {
    return "rag";
  }

  return "unknown";
}
