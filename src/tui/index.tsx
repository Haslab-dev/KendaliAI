/**
 * KendaliAI TUI - Terminal User Interface Entry Point
 *
 * This is the main entry point for the TUI interface.
 * Uses Ink (React for CLI) and Inquirer for interactive prompts.
 */

import React from "react";
import { render } from "ink";
import { App } from "./App";

// Start the TUI application
export function startTUI() {
  // Check if running in an interactive terminal
  if (!process.stdin.isTTY) {
    console.error("Error: KendaliAI TUI requires an interactive terminal.");
    console.error("Please run this command directly in your terminal.");
    console.error("\nUsage: bun run start");
    return Promise.resolve();
  }

  const { waitUntilExit } = render(<App />);
  
  return waitUntilExit();
}

// Export for CLI usage
export { App } from "./App";
