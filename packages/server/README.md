# claude-blocker (Intiface Fork)

CLI tool and server for Claude Blocker — block distracting websites and get haptic feedback while Claude Code is actively running inference.

This fork adds [Intiface Central](https://intiface.com/central/) integration for ambient vibration feedback while Claude is working.

## Installation

```bash
npm install -g claude-blocker
# or
npx claude-blocker
```

## Quick Start

```bash
# First time setup (configures Claude Code hooks)
npx claude-blocker --setup

# The server will start automatically after setup
```

## Usage

```bash
# Start server (default port 8765)
npx claude-blocker

# Start with setup (configures hooks if not already done)
npx claude-blocker --setup

# Custom port
npx claude-blocker --port 9000

# With Intiface haptic feedback
npx claude-blocker --intiface-url ws://127.0.0.1:12345

# Combine options
npx claude-blocker --port 9000 --intiface-url ws://127.0.0.1:12345

# Remove hooks from Claude Code
npx claude-blocker --remove

# Show help
npx claude-blocker --help
```

## How It Works

1. **Hooks** — The `--setup` command adds hooks to `~/.claude/settings.json` that notify the server when:
   - You submit a prompt (`UserPromptSubmit`)
   - Claude uses a tool (`PreToolUse`)
   - Claude finishes (`Stop`)
   - A session starts/ends (`SessionStart`, `SessionEnd`)

2. **Server** — Runs on localhost and:
   - Tracks all active Claude Code sessions
   - Knows when sessions are "working" vs "idle"
   - Broadcasts state via WebSocket to the Chrome extension
   - Optionally controls haptic devices via Intiface Central

3. **Extension** — Connects to the server and:
   - Blocks configured sites when no sessions are working
   - Shows a modal overlay (soft block, not network block)
   - Updates in real-time without page refresh

4. **Intiface (optional)** — When enabled:
   - Connects to Intiface Central via WebSocket
   - Provides ambient vibration (15% intensity) while Claude is actively working
   - Automatically stops when Claude finishes or becomes idle

## API

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Returns current state (sessions, blocked status) |
| `/hook` | POST | Receives hook payloads from Claude Code |

### WebSocket

Connect to `ws://localhost:8765/ws` to receive real-time state updates:

```json
{
  "type": "state",
  "blocked": true,
  "sessions": 1,
  "working": 0
}
```

## Programmatic Usage

```typescript
import { startServer } from 'claude-blocker';

// Start on default port (8765)
startServer();

// Custom port
startServer({ port: 9000 });

// With Intiface haptic feedback
startServer({
  port: 8765,
  intifaceUrl: 'ws://127.0.0.1:12345'
});
```

## Requirements

- Node.js 18+
- [Claude Code](https://claude.ai/claude-code)
- [Intiface Central](https://intiface.com/central/) (optional, for haptic feedback)

## License

MIT
