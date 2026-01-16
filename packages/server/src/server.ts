import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { HookPayload, ClientMessage } from "./types.js";
import { DEFAULT_PORT } from "./types.js";
import { state } from "./state.js";
import { IntifaceState } from "./intiface.js";

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export interface ServerOptions {
  port?: number;
  intifaceUrl?: string;
}

export function startServer(options: ServerOptions = {}): void {
  const port = options.port ?? DEFAULT_PORT;

  const server = createServer(async (req, res) => {
    // CORS headers for local development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://localhost:${port}`);

    // Health check / status endpoint
    if (req.method === "GET" && url.pathname === "/status") {
      sendJson(res, state.getStatus());
      return;
    }

    // Hook endpoint - receives notifications from Claude Code
    if (req.method === "POST" && url.pathname === "/hook") {
      try {
        const body = await parseBody(req);
        const payload = JSON.parse(body) as HookPayload;

        if (!payload.session_id || !payload.hook_event_name) {
          sendJson(res, { error: "Invalid payload" }, 400);
          return;
        }

        state.handleHook(payload);
        sendJson(res, { ok: true });
      } catch {
        sendJson(res, { error: "Invalid JSON" }, 400);
      }
      return;
    }

    // 404 for unknown routes
    sendJson(res, { error: "Not found" }, 404);
  });

  // WebSocket server for Chrome extension
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("Extension connected");

    // Subscribe to state changes
    const unsubscribe = state.subscribe((message) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;

        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        // Ignore invalid messages
      }
    });

    ws.on("close", () => {
      console.log("Extension disconnected");
      unsubscribe();
    });

    ws.on("error", () => {
      unsubscribe();
    });
  });

  // Intiface state
  if (options.intifaceUrl) {
    const intifaceState = new IntifaceState(options.intifaceUrl);
    state.subscribe(async (message) => {
      intifaceState.onSessionStateMessage(message);
    });
  }

  server.listen(port, () => {
    console.log(`
┌──────────────────────────────────────────┐
│                                          |
│   Claude Blocker Server                  │
│                                          |
│   HTTP:      http://localhost:${port}    │
│   WebSocket: ws://localhost:${port}/ws   │
${options.intifaceUrl ? `│   Intiface:    ${options.intifaceUrl}        |` : ''}
│                                          |
│   Waiting for Claude Code hooks...       |
│                                          |
└──────────────────────────────────────────┘
`);
  });

  // Graceful shutdown - use once to prevent stacking handlers
  process.once("SIGINT", () => {
    console.log("\nShutting down...");
    state.destroy();
    wss.close();
    server.close();
    process.exit(0);
  });
}
