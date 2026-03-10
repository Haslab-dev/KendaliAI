#!/usr/bin/env bun
/**
 * KendaliAI CLI Entry Point
 *
 * This is the main entry point for the KendaliAI CLI.
 * It starts the TUI interface.
 */

import { startTUI } from "./tui";

// Start the TUI application
console.log("\nStarting KendaliAI TUI...\n");
startTUI().then(() => {
  console.log("\nGoodbye!\n");
  process.exit(0);
}).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
