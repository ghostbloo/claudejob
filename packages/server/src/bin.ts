#!/usr/bin/env node

import { createInterface } from "readline";
import { startServer } from "./server.js";
import { setupHooks, removeHooks, areHooksConfigured } from "./setup.js";
import { DEFAULT_PORT } from "@claude-blocker/shared";

const args = process.argv.slice(2);

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function printHelp(): void {
  console.log(`
Claude Blocker - Block distracting sites when Claude Code isn't working

Usage:
  npx claude-blocker [options]

Options:
  --setup          Configure Claude Code hooks
  --remove         Remove Claude Code hooks
  --port           Server port (default: ${DEFAULT_PORT})
  --intiface-url   URL for Intiface Central websocket for haptics integration
  --help           Show this help message

Examples:
  npx claude-blocker            # Start the server (prompts for setup on first run)
  npx claude-blocker --port 9000
  npx claude-blocker --intiface-url ws://localhost:12345
`);
}

async function main(): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--setup")) {
    setupHooks();
    process.exit(0);
  }

  if (args.includes("--remove")) {
    removeHooks();
    process.exit(0);
  }

  // Parse port
  let port = DEFAULT_PORT;
  const portIndex = args.indexOf("--port");
  if (portIndex !== -1 && args[portIndex + 1]) {
    const parsed = parseInt(args[portIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      port = parsed;
    } else {
      console.error("Invalid port number");
      process.exit(1);
    }
  }

  // Intiface Central WebSocket URL for haptics
  let intifaceUrl: string | undefined;
  const intifaceUrlIndex = args.indexOf("--intiface-url");
  if (intifaceUrlIndex !== -1 && args[intifaceUrlIndex + 1]) {
    intifaceUrl = args[intifaceUrlIndex + 1];
  }

  // Check if hooks are configured, prompt for setup if not
  if (!areHooksConfigured()) {
    console.log("Claude Blocker hooks are not configured yet.\n");
    const answer = await prompt("Would you like to set them up now? (Y/n) ");
    const normalized = answer.trim().toLowerCase();

    if (normalized === "" || normalized === "y" || normalized === "yes") {
      setupHooks();
      console.log(""); // Add spacing before server start
    } else {
      console.log("\nSkipping setup. You can run 'npx claude-blocker --setup' later.\n");
    }
  }

  startServer({ port, intifaceUrl });
}

main();
