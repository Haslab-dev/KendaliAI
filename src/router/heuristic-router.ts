import { Intent } from "../types/intent";

/**
 * Heuristic Router - Fast, zero-token intent detection based on keywords
 */
export function heuristicRouter(message: string): Intent | "unknown" {
  const msg = message.toLowerCase().trim();

  // ============================================
  // 1. FILE-BASED QUERIES (ULTRA HIGH PRIORITY)
  // ============================================
  const fileRegex =
    /\b(src|tests?|lib|bin|docs?|file(?:s)?|path(?:s)?|code(?:base)?|dir(?:ectory)?|readme|package)\b/i;
  const extRegex = /\.(ts|js|md|json|txt|sh|py|go|rs|tsx|jsx)\b/i;

  if (fileRegex.test(msg) || extRegex.test(msg) || msg.includes("/")) {
    return "agent";
  }

  // ============================================
  // 2. AGENT Triggers (Action Verbs)
  // ============================================
  const agentVerbs = [
    "check ",
    "read ",
    "list ",
    "open ",
    "find ",
    "search ",
    "run ",
    "exec ",
    "execute",
    "shell",
    "terminal",
    "bash",
    "command",
    "ls ",
    "cat ",
    "grep ",
    "git ",
    "npm ",
    "bun ",
    "pip ",
    "docker ",
    "write ",
    "edit ",
    "patch ",
    "explain ",
    "summary ",
    "analyze ",
  ];

  for (const verb of agentVerbs) {
    if (msg.startsWith(verb)) {
      return "agent";
    }
  }

  // ============================================
  // 3. CHAT INTENT - Conversational
  // ============================================
  const chatTriggers = [
    "hi",
    "hello",
    "hey",
    "halo",
    "hai",
    "kabar",
    "siapa",
    "name",
    "who are you",
    "thank",
    "thanks",
    "bye",
    "goodbye",
  ];
  for (const kw of chatTriggers) {
    if (msg.startsWith(kw)) return "chat";
  }

  // ============================================
  // 4. RAG INTENT - Knowledge/Documentation Queries
  // ============================================
  const ragKeywords = [
    "how do i",
    "how to",
    "what is ",
    "why ",
    "when ",
    "documentation",
    "docs",
    "guide",
    "tutorial ",
    "describe ",
  ];

  for (const kw of ragKeywords) {
    if (msg.includes(kw)) {
      return "rag";
    }
  }

  return "unknown";
}
