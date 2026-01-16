# Claudejob

Activate your sex toys while [Claude Code](https://claude.ai/claude-code) is working, block distracting websites when it isn't.

Integrates with [Intiface Central](https://intiface.com/central/) (buttplug.io) to provide ambient vibration feedback while Claude is actively working, creating a physical presence indicator.

## How It Works

```
┌─────────────────┐     hooks      ┌─────────────────┐    websocket    ┌─────────────────┐
│   Claude Code   │ ─────────────► │  Blocker Server │ ◄─────────────► │ Chrome Extension│
│   (terminal)    │                │  (localhost)    │                 │   (browser)     │
└─────────────────┘                └────────┬────────┘                 └─────────────────┘
       │                                     │                                   │
       │ UserPromptSubmit                    │ tracks sessions                   │ blocks sites
       │ PreToolUse                          │ broadcasts state                  │ shows modal
       │ Stop                                │                                   │ bypass button
       └─────────────────────────────────────┴───────────────────────────────────┘
                                             │
                                     websocket (optional)
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │ Intiface Central│
                                    │  (buttplug.io)  │
                                    └────────┬────────┘
                                             │
                                        vibration
                                             │
                                             ▼
                                       [Your Device]
```

1. **Claude Code hooks** notify the server when you submit a prompt or when Claude finishes
2. **Blocker server** tracks all Claude Code sessions and their working/idle states
3. **Chrome extension** blocks configured sites when no session is actively working
4. **Intiface integration (optional)** provides ambient vibration while Claude is actively working

## Quick Start

### 0. clone the repo and install with pnpm cause this fork isn't on npm

### 1. Install the server

```bash
npx claude-blocker --setup
```

This installs the Claude Code hooks and starts the server. The hooks are configured in `~/.claude/settings.json`.

### 2. Install the Chrome extension

- Download from [Chrome Web Store](#) *(coming soon)*
- Or load unpacked from `packages/extension/dist`

### 3. Configure blocked sites

Click the extension icon → Settings to add sites you want blocked when Claude is idle.

Default blocked sites: `x.com`, `youtube.com`

### 4. (Optional) Enable Intiface haptic feedback

To get ambient vibration feedback while Claude is working:

1. Download and install [Intiface Central](https://intiface.com/central/)
2. Connect your compatible device (see [supported devices](https://iostindex.com/?filter0Availability=Available))
3. Start Intiface Central and ensure the websocket server is running (default: `ws://127.0.0.1:12345`)
4. Restart claude-blocker with the `--intiface-url` flag:
   ```bash
   npx claude-blocker --intiface-url ws://127.0.0.1:12345
   ```

Your device will vibrate with a low ambient presence (15% intensity by default) while Claude Code is actively working.

## Server CLI

```bash
# Start with auto-setup (recommended for first run)
npx claude-blocker --setup

# Start on custom port
npx claude-blocker --port 9000

# Start with Intiface haptic feedback
npx claude-blocker --intiface-url ws://127.0.0.1:12345

# Combine options
npx claude-blocker --port 9000 --intiface-url ws://127.0.0.1:12345

# Remove hooks from Claude Code settings
npx claude-blocker --remove

# Show help
npx claude-blocker --help
```

## Features

- **Soft blocking** — Sites show a modal overlay, not a hard block
- **Real-time updates** — No page refresh needed when state changes
- **Multi-session support** — Tracks multiple Claude Code instances
- **Emergency bypass** — 5-minute bypass, once per day
- **Configurable sites** — Add/remove sites from extension settings
- **Works offline** — Blocks everything when server isn't running (safety default)
- **Haptic feedback (new!)** — Optional Intiface integration provides ambient vibration while Claude is actively working

## Requirements

- Node.js 18+
- Chrome (or Chromium-based browser)
- [Claude Code](https://claude.ai/claude-code)
- [Intiface Central](https://intiface.com/central/) (optional, for haptic feedback)

## Development

```bash
# Clone and install
git clone https://github.com/t3-content/claude-blocker.git
cd claude-blocker
pnpm install

# Build everything
pnpm build

# Development mode
pnpm dev
```

### Project Structure

```
packages/
├── server/      # Node.js server + CLI (published to npm)
├── extension/   # Chrome extension (Manifest V3)
└── shared/      # Shared TypeScript types
```

## Privacy

- **No data collection** — All data stays on your machine
- **Local only** — Server runs on localhost, no external connections
- **Chrome sync** — Blocked sites list syncs via your Chrome account (if enabled)

See [PRIVACY.md](PRIVACY.md) for full privacy policy.

## License

MIT © [Theo Browne](https://github.com/t3dotgg)
