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

- [x] **Phase 3: Channel Routing**
  - [x] Prefix-based routing (`src/server/routing`)
  - [x] Keyword-based routing
  - [x] Interactive gateway selection
  - [x] Channel-to-gateway binding (`src/cli/routing`)

- [x] **Phase 4: Agent System**
  - [x] Agent personality configuration (`src/server/agents/config.ts`)
  - [x] Agent templates (dev-assistant, support-bot, data-analyst, content-writer)
  - [x] Per-gateway agent behavior
  - [x] Custom instructions

- [x] **Phase 5: Skills & Tools**
  - [x] Skills configuration per gateway (`src/server/skills`)
  - [x] Tools configuration per gateway
  - [x] Security sandboxing
  - [x] Permission system

- [x] **Phase 6: Workflow Automation**
  - [x] Workflow engine (node engine, triggers, scheduler) (`src/workflow`)

- [x] **Phase 7: Dashboard UI**
  - [x] System monitoring (`src/dashboard/pages/Overview`)
  - [x] Workflow editor (`src/dashboard/pages/Workflows`)

- [x] **Phase 8: Plugin SDK**
  - [x] Tool extensions, workflow nodes, UI widgets SDK (`src/sdk`)

- [x] **Phase 9: Messaging Integration**
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

### Channel Routing

Route messages from the same channel to different gateways based on prefixes, keywords, or interactive selection.

```bash
# List all channel bindings
bun run src/cli.ts routing list

# Bind a channel to a gateway with prefix routing
bun run src/cli.ts routing bind <channel-id> dev-assistant --mode prefix --prefix /dev

# Bind with keyword routing
bun run src/cli.ts routing bind <channel-id> support-bot --mode keyword --keywords "help,support,issue"

# Set routing mode for a gateway
bun run src/cli.ts routing set-mode dev-assistant prefix
bun run src/cli.ts routing set-prefix dev-assistant /dev
bun run src/cli.ts routing set-keywords support-bot "help,support,ticket"
```

#### Routing Modes

| Mode | Description | Example |
|\\------|-------------|---------|
| `prefix` | Route by command prefix | `/dev review this code` → dev-assistant |
| `keyword` | Auto-route by detected keywords | "help with bug" → support-bot |
| `interactive` | Ask user to select gateway | Shows menu of available gateways |
| `broadcast` | Send to all bound gateways | Announcements |
| `round-robin` | Distribute across gateways | Load balancing |

### Agent System

Configure agents with unique personalities and behaviors for each gateway.

```bash
# List available agent templates
bun run src/cli.ts agent templates

# Configure agent for a gateway
bun run src/cli.ts agent configure dev-assistant --template dev-assistant

# Set custom instructions
bun run src/cli.ts agent instructions dev-assistant "Always include code examples"
```

#### Available Agent Templates

| Template | Description |
|----------|-------------|
| `dev-assistant` | Senior developer for code review and development |
| `support-bot` | Friendly customer support representative |
| `data-analyst` | Analytical data expert for analysis and visualization |
| `content-writer` | Creative writer for content creation |
| `general-assistant` | Versatile AI assistant for general tasks |

### Skills & Tools

Enable or disable skills and tools per gateway with security controls.

```bash
# List available skills
bun run src/cli.ts skills list

# Enable a skill for a gateway
bun run src/cli.ts skills enable dev-assistant code-analysis

# List available tools
bun run src/cli.ts tools list

# Enable a tool for a gateway
bun run src/cli.ts tools enable dev-assistant shell

# Configure security policy
bun run src/cli.ts security show dev-assistant
bun run src/cli.ts security update dev-assistant workspaceOnly false
```

### Skill Registry

Install skills from external sources similar to ZeroClaw's skill system.

```bash
# Install skill from ZeroMarket registry
bun run src/cli.ts skills install namespace/code-review

# Install skill from ClawHub
bun run src/cli.ts skills install clawhub:summarize

# Install skill from Git remote
bun run src/cli.ts skills install https://github.com/user/kendaliai-skill

# Install skill from local zip file
bun run src/cli.ts skills install ~/Downloads/my-skill.zip

# Install skill from direct zip URL
bun run src/cli.ts skills install zip:https://example.com/skills/my-skill.zip

# List installed skills
bun run src/cli.ts skills installed

# Audit a skill for security issues
bun run src/cli.ts skills audit code-review

# Uninstall a skill
bun run src/cli.ts skills uninstall code-review

# Create a new skill scaffold
bun run src/cli.ts skills new my-custom-skill
```

#### Skill Sources

| Source Format | Description | Example |
|---------------|-------------|---------|
| `namespace/name` | ZeroMarket registry | `zeroclaw/code-review` |
| `clawhub:name` | ClawHub registry | `clawhub:summarize` |
| `https://...` | Git remote repository | `https://github.com/user/skill` |
| `~/path/to/file.zip` | Local zip file | `~/Downloads/skill.zip` |
| `zip:https://...` | Direct zip URL | `zip:https://example.com/skill.zip` |

#### Skill Manifest (SKILL.toml)

Skills are defined using a TOML manifest file:

```toml
[skill]
name = "code-review"
version = "1.0.0"
description = "AI-powered code review assistant"
author = "zeroclaw"
license = "MIT"
entry = "src/index.ts"

[permissions]
fs = { access = "read", paths = ["./src", "./tests"] }
net = { hosts = ["api.github.com"] }
exec = { commands = ["git", "npm"] }

[config]
model = { type = "string", default = "gpt-4", description = "AI model to use" }
```

#### Built-in Skills

| Skill | Description |
|-------|-------------|
| `code-analysis` | Analyze and review code |
| `git-operations` | Git repository operations |
| `web-search` | Search the web for information |
| `data-processing` | Process and analyze data |
| `debugging` | Help debug code and troubleshoot |
| `faq-lookup` | Look up answers from FAQ database |

#### Built-in Tools

| Tool | Risk Level | Description |
|------|------------|-------------|
| `shell` | High | Execute shell commands |
| `git` | Medium | Git operations |
| `file` | Medium | File read/write operations |
| `http` | Low | HTTP requests |
| `memory` | Low | Memory storage and retrieval |
| `browser` | Medium | Browser automation (disabled by default) |
| `python` | High | Python code execution (disabled by default) |

### Telegram Bot Commands

- `/init` - Pair your Telegram account with KendaliAI
- `/status` - Show current gateway status
- `/gateways` - List available gateways
- `/<prefix> <message>` - Route message to specific gateway

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
- Security policies can be configured per gateway

## Testing

Unit tests run natively via `bun test`. Test files are stored under the `tests/` directory.

```bash
bun test
```

## Architecture

```
src/
├── cli/                    # CLI modules
│   ├── gateway.ts          # Gateway management commands
│   ├── daemon.ts           # Daemon process management
│   ├── routing.ts          # Channel routing commands
│   ├── skills-config.ts    # Skills & tools commands
│   └── skills.ts           # Legacy skills management
├── server/
│   ├── ai/                 # AI SDK integration
│   │   └── index.ts        # OpenAI-compatible provider
│   ├── agents/             # Agent system
│   │   └── config.ts       # Agent configuration & templates
│   ├── routing/            # Channel routing
│   │   └── index.ts        # Routing manager & types
│   ├── skills/             # Skills & Tools system
│   │   └── index.ts        # Skills manager & security
│   ├── gateway/            # AI Gateway
│   ├── database/           # Database layer
│   ├── security/           # Security & encryption
│   └── config/             # Configuration
└── dashboard/              # React dashboard
```
