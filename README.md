# KendaliAI

KendaliAI is a self-hosted AI automation platform that unified AI access, enables AI agents, provides workflow automation, controls messaging bots, and is highly extensible via plugins.

**Architecture**: Monolithic (single repository, unified config).

## Project Plan & Checklist

- [x] **Phase 1: Core Runtime**
  - [x] Core primitives (`src/core`)
  - [x] Event Bus (`src/eventbus`)
  - [x] Tool System (`src/tools`)
  - [x] Intent Router (`src/router`)
  - [x] Database Layer (`src/database`)

- [x] **Phase 2: AI Gateway & Agents**
  - [x] AI Gateway (model routing, provider adapters, caching) (`src/gateway`)
  - [x] Agent Runtime (planner, executor, memory) (`src/agents`)

- [x] **Phase 3: Workflow Automation**
  - [x] Workflow engine (node engine, triggers, scheduler) (`src/workflow`)

- [x] **Phase 4: Dashboard UI**
  - [x] System monitoring (`src/dashboard/pages/Overview`)
  - [x] Workflow editor (`src/dashboard/pages/Workflows`)

- [x] **Phase 5: Plugin SDK**
  - [x] Tool extensions, workflow nodes, UI widgets SDK (`src/sdk`)

- [x] **Phase 6: Messaging Integration**
  - [x] Messaging adapters (Telegram, Discord, WhatsApp) (`src/adapters`)

## Quickstart

### Gateway CLI (Telegram Bots)

The fastest way to get started is with the Gateway CLI, which lets you create and manage AI-powered Telegram bots.

```bash
# Start the interactive TUI to create a gateway
bun start

# Or use direct commands:
bun run gateway list              # List all gateways
bun run gateway start <name>      # Start a gateway
bun run gateway stop <name>       # Stop a gateway
bun run gateway logs <name>       # Follow gateway logs
```

The TUI wizard will guide you through:

1. Selecting an AI provider (ZAI/DeepSeek)
2. Entering your API key
3. Choosing a model
4. Connecting a Telegram bot token
5. Configuring optional skills and hooks

Gateway configurations are stored in `gateways/` directory (not tracked in git).

### Frontend Dashboard

```bash
bun install
bun run dev
```

The frontend application runs on top of Vite and React. The backend API is entirely unified under `src/server` (or run concurrently) to avoid monorepo setups.

### Backend Server

```bash
bun run src/server/index.ts
```

## Available Scripts

| Script            | Description                           |
| ----------------- | ------------------------------------- |
| `bun start`       | Start the interactive TUI             |
| `bun run gateway` | Gateway management commands           |
| `bun run dev`     | Start frontend + backend concurrently |
| `bun test`        | Run unit tests                        |

## Security Notes

- Gateway configurations contain sensitive credentials (API keys, bot tokens)
- The `gateways/` directory is excluded from git via `.gitignore`
- Shell commands executed by AI are restricted to a safe allowlist
- File system access is limited to allowed directories

## Testing

Unit tests run natively via `bun test`. Test files are stored under the `tests/` directory.

```bash
bun test
```
