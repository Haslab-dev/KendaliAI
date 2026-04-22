# KendaliAI (Go Edition)

KendaliAI is a self-hosted, autonomous AI coding agent and orchestration gateway rebuilt natively in Go. Influenced heavily by the "Claude Code in 200 Lines" architecture, KendaliAI uses dynamic tool invocation and recursive LLM cognition loops to navigate, evaluate, and edit your local filesystem.

## Features

- **Autonomous Cognition Loop**: Recursive OS-level operations (`read_file`, `list_files`, `edit_file`, `bash`) executed dynamically by models like DeepSeek.
- **Dynamic Configured Persona**: Your AI's identity and restricted commands are defined dynamically in `~/.kendaliai/Persona.md`.
- **Local TUI Dashboard**: An interactive, mouse-scrollable Terminal User Interface using BubbleTea for typing commands directly to the core autonomous agent.
- **Telegram Gateway Polling**: Bind your Telegram bot to execute local terminal commands securely from your phone.
- **Centralized Telemetry Logging**: Stream OS Agent logs from all channels seamlessly.

## Quickstart

### 1. Build and Run

Ensure you have Go 1.24+ installed.

```bash
go mod tidy
```

### 2. Export API Keys

KendaliAI uses DeepSeek by default, with an optional fallback to ZAI.

```bash
export DEEPSEEK_API_KEY="your-api-key"
export ZAI_API_KEY="your-zai-key"
```

### 3. Initialize Gateway Database (Optional)

```bash
go run ./cmd/kendaliai onboard
```

### 4. Bind a Telegram Channel (Optional)

```bash
go run ./cmd/kendaliai channel bind-telegram --bot-token "YOUR_TOKEN"
```

## Running the Architecture

KendaliAI operates in natively decoupled environments. You can run one or multiple components completely asynchronously.

### Standalone Interactive TUI (Offline Agent)

Access the autonomous agent locally through a beautiful BubbleTea interface. Fully actionable terminal environment with live streaming output.

![KendaliAI Terminal Dashboard](./tui.png)

```bash
go run ./cmd/kendaliai tui
```

### MCP (Master Control Program)

The primary server that handles all incoming requests from channels and executes the autonomous agent.

![KendaliAI MCP Execution](./mcp.png)

### Headless Gateway (Telegram Bot)

Starts the primary server and polls attached Telegram bots.

![KendaliAI Telegram Gateway](./telegram.png)

```bash
go run ./cmd/kendaliai gateway
```

### Centralized Logistics Stream

Watch the autonomous agent think, execute tools, and respond in real-time across the entire platform.

```bash
go run ./cmd/kendaliai logs
```

## System Structure

```text
cmd/kendaliai/       # Primary CLI entrypoints (root, tui, gateway, logs)
internal/
├── agent/           # The Core Cognition Loop & Native Tool Registry
├── channels/        # external polling wrappers (Telegram)
├── config/          # Viper environment mapping
├── db/              # SQLite workspace storage
├── gateways/        # State handlers
├── logger/          # Central syslog mapping
├── providers/       # LLM abstraction (DeepSeek, ZAI)
├── security/        # Identity security
├── server/          # REST Gateway wrappers
└── tui/             # Charmbracelet Bubbletea reactive loop
```

## Security & Restricting Commands

Your agent is strictly bounded to the rules specified inside `~/.kendaliai/Persona.md`. If this file doesn't exist, KendaliAI will generate it upon execution.

To restrict commands from being blindly executed natively by the agent, define them under `exclude_cmd:` in the file:

```markdown
# Agent Identity

**Name:** KendaliAI

tools: read_file, list_files, edit_file, bash
exclude_cmd: rm, ls ., modify root file
```
