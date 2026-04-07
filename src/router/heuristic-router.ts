import { Intent } from "../types/intent";

/**
 * Heuristic Router - Fast, zero-token intent detection based on keywords
 *
 * Routing priorities:
 * 1. Chat - greetings, identity questions, thanks
 * 2. RAG - documentation, knowledge base, learning
 * 3. Agent - actions, commands, file operations
 */
export function heuristicRouter(message: string): Intent | "unknown" {
  const msg = message.toLowerCase().trim();

  // ============================================
  // 1. CHAT INTENT - Conversational (HIGHEST PRIORITY)
  // ============================================
  const chatTriggers = [
    // Greetings (English)
    "hi",
    "hello",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
    "greetings",
    "what's up",
    "whats up",
    // Greetings (Indonesian)
    "halo",
    "hai",
    "helo",
    "selamat pagi",
    "selamat siang",
    "selamat sore",
    "selamat malam",
    // Greetings (Indonesian) - more informal
    "apa kabar",
    "kabar",
    "pa kabar",
    "gimana kabar",
    "baik kabar",
    "kabarnya",
    // Identity questions (English)
    "who are you",
    "what are you",
    "your name",
    "introduce yourself",
    "tell me your name",
    "what's your name",
    "whats your name",
    "what is your name",
    // Identity questions (Indonesian) - CRITICAL
    "kamu siapa",
    "siapa kamu",
    "siapa nama",
    "nama kamu siapa",
    "nama kamu apa",
    "kamu nama apa",
    "perkenalkan diri",
    "kenalan",
    // Capabilities (English)
    "what can you do",
    "help me",
    "can you help",
    // Capabilities (Indonesian)
    "bisa apa",
    "kamu bisa apa",
    "bantu",
    "bantu aku",
    "tolong bantu",
    "bisa bantu",
    // Thanks (English)
    "thank you",
    "thanks",
    "appreciate",
    "good job",
    "well done",
    "awesome",
    "great",
    // Thanks (Indonesian)
    "terima kasih",
    "makasih",
    "bagus",
    "keren",
    // Farewell (English)
    "bye",
    "goodbye",
    "see you",
    // Farewell (Indonesian)
    "dadah",
    "sampai jumpa",
  ];

  // Check chat triggers first (exact match or starts with)
  for (const kw of chatTriggers) {
    if (
      msg === kw ||
      msg.startsWith(kw + " ") ||
      msg.startsWith(kw + "?") ||
      msg.includes(kw)
    ) {
      return "chat";
    }
  }

  // ============================================
  // 2. RAG INTENT - Knowledge/Documentation Queries
  // ============================================
  const ragKeywords = [
    "how do i",
    "how to",
    "how can i",
    "how should i",
    "why does",
    "why is",
    "why do",
    "why should",
    "when should",
    "when do i",
    "where is",
    "where can i",
    "documentation",
    "docs",
    "readme",
    "guide",
    "tutorial",
    "tell me about",
    "explain",
    "describe",
    "elaborate",
    "based on",
    "according to",
    "in the docs",
    "error",
    "problem",
    "issue",
    "not working",
    "doesn't work",
    "difference between",
    "compare",
    " vs ",
    "versus",
    "example of",
    "sample",
    "demo",
    "use case",
    "configure",
    "setup",
    "set up",
    "install",
    "deployment",
    "features",
    "capabilities",
    "best practice",
    "recommendation",
  ];

  for (const kw of ragKeywords) {
    if (msg.includes(kw)) {
      return "rag";
    }
  }

  // ============================================
  // 3. AGENT INTENT - Actions/Tools/Commands
  // ============================================
  const agentKeywords = [
    "execute",
    "shell",
    "terminal",
    "bash",
    "command line",
    "git status",
    "git commit",
    "git push",
    "git pull",
    "git clone",
    "create file",
    "delete file",
    "remove file",
    "rename file",
    "move file",
    "copy file",
    "write file",
    "edit file",
    "modify file",
    "ls -",
    "list files",
    "show files",
    "list directory",
    "system info",
    "system information",
    "check cpu",
    "check memory",
    "ping ",
    "curl ",
    "wget ",
    "fetch url",
    "download file",
    "run script",
    "execute code",
    "run python",
    "run node",
    "npm install",
    "npm run",
    "pip install",
    "yarn ",
    "bun ",
    "docker ",
    "container",
    "start server",
    "stop server",
    "restart",
    // Indonesian agent triggers
    "buka file",
    "baca file",
    "tulis file",
    "hapus file",
    "edit file",
    "jalankan",
    "eksekusi",
    "perintah",
    "command",
    "baca dokumentasi",
    "lihat dokumentasi",
  ];

  for (const kw of agentKeywords) {
    if (msg.includes(kw)) {
      return "agent";
    }
  }

  return "unknown";
}
