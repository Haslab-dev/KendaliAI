# KendaliAI (Go Edition)

KendaliAI is a self-hosted **AI Agent Gateway & Personal AI Runtime** built natively in Go. Designed as a lightweight daemon, KendaliAI unifies multiple specialized agents across **Web UI, Telegram bots, CLI, and REST/WebSocket APIs** with shared sessions, event sourcing, multi-tiered memory, full-featured PTY terminal, and capability sandboxing.

> **One lightweight Go daemon → many agents → many channels → shared sessions/memory/tools → Web + Telegram bidirectional.**

---

## 1. Quickstart

### Prerequisites
- Go 1.20+
- Node 18+ or Bun (for Web UI)
- SQLite3
- CGO (required by `go-sqlite3`)

### One-Line Install (macOS & Linux)

From source, install the `kendaliai` binary to your system PATH:

```bash
bash scripts/install.sh
```

Or using `make`:

```bash
make install
```

### Setup

Copy the example config and fill in your API keys:

```bash
cp config.example.yaml config.yaml
```

Key fields in `config.yaml`:

| Field | Description |
| :--- | :--- |
| `chatProviders` | LLM providers (OpenAI-compatible, DeepSeek, Anthropic, Ollama, etc.) |
| `embedding` | Embedding model endpoint and key for vector search |
| `channels` | Telegram bot token and channel routing config |
| `storage` | Local (`./storage`) or Cloudflare R2 / S3 artifact storage |
| `permissions` | File access allow/deny rules and sandboxing policies |
| `reflection` | Daily reflection and consolidation cron schedule |

---

## 2. Commands & Workflows (Makefile)

| Command | Description |
| :--- | :--- |
| `make dev` | **Full-stack dev mode**: Air (Go live-reload `:8080`) + Vite HMR (`:5173`) |
| `make dev-go` | Backend only with Air live-reload |
| `make dev-ui` | Frontend only with Vite hot-reload |
| `make start` | Starts gateway in foreground (auto-clears port `8080` & previous processes) |
| `make start-daemon` | Starts gateway in background daemon mode |
| `make stop` | Gracefully stops daemon, terminates orphaned listeners, and releases port `8080` |
| `make restart` | Restarts gateway daemon cleanly |
| `make status` | Inspects daemon state, uptime, PID, and port `8080` listener status |
| `make build` | Builds both production React UI assets (`ui/dist`) and Go binary (`build/kendaliai`) |
| `make install` | Builds and installs `kendaliai` to system PATH (macOS & Linux), replacing old builds |
| `make air-install` | Installs the `air` live-reload tool |
| `make clean` | Removes build artifacts and `ui/dist` |
| `make lint` | Runs `go vet` over internal and cmd packages |
| `make tidy` | Runs `go mod tidy` |

### Development Mode

Run backend and frontend with live hot-reloading:

```bash
make dev
```

Open **`http://localhost:5173`** for instant Vite HMR. API, WebSocket events, and PTY terminal connections are proxied to `:8080`.

### Production Mode

Build and run the unified single daemon:

```bash
# Build production bundle (UI + Go binary)
make build

# Start daemon (foreground or background)
make start
# or: make start-daemon
```

Open **`http://localhost:8080`** to access the full Web UI.

---

## 3. CLI Command Index

Operate the gateway daemon using the unified command suite:

| Command | Description |
| :--- | :--- |
| **`kendaliai start`** | Start gateway process & Web UI in foreground (`:8080`). |
| **`kendaliai start -d`** | Start gateway background daemon. |
| **`kendaliai stop`** | Stop background daemon. |
| **`kendaliai restart`** | Restart daemon. |
| **`kendaliai status`** | Show uptime, active sessions, agents, and bot metrics. |
| **`kendaliai dev`** | Full-stack dev mode (Air + Vite) with live hot-reload. |
| **`kendaliai install`** | Install binary to system PATH. |
| **`kendaliai logs`** | Stream system logs (`--follow`, `--agent`, `--session`, `--level`, `--json`). |
| **`kendaliai doctor`** | Diagnose platform dependencies and configurations. |
| **`kendaliai tools`** | List all registered built-in agent capabilities. |
| **`kendaliai agent`** | CLI wizard to create, list, install, and manage agent manifests. |
| **`kendaliai skill`** | CLI manager for skills and packages. |

---

## 4. Web UI & Workspaces

The **React/TypeScript** Web UI (`ui/`) is a clean, modern interface served directly from the Go daemon in production with responsive desktop and mobile layouts:

| View / Pane | Description |
| :--- | :--- |
| **Chat Area** | Real-time chat with streaming SSE responses, rich Markdown formatting, auto-generated session titles (≤ 20 chars), and collapsible tool call inspection cards. |
| **PTY Terminal** | Dedicated, full-featured interactive pseudo-terminal running in its own tab. Supports `vim`, `htop`, `nano`, ANSI escape colors, and raw keyboard controls. |
| **Workspace Editor** | Integrated workspace browser and code editor with file tree navigation and code editing. |
| **Skills Pane** | Browse active built-in and generated agent skills; inspect trigger phrases, domains, and dependencies. |
| **Plugins Pane** | View installed extensions, active capabilities, and plugin statuses. |
| **MCP Manager** | Model Context Protocol servers management with individual enable/disable toggles and live tool counting. |
| **Providers & Models** | Configure LLM providers, set default models, test latencies, and manage token limits. |
| **Scheduler & Worktrees** | Automated recurring cron jobs, reflection tasks, and git worktree environments. |
| **Logs Streamer** | Live log viewer with severity level filters (`DEBUG`, `INFO`, `WARN`, `ERROR`). |

---

## 5. Full-Feature PTY Terminal

KendaliAI includes a real pseudo-terminal (PTY) engine:

- **True PTY Engine**: Backed by `github.com/creack/pty` on macOS and Linux. Spawns your actual login shell (`$SHELL -l` or `/bin/zsh -l`) with all user environment variables, aliases, and paths.
- **Interactive TUI Support**: Seamlessly executes programs requiring interactive terminal capabilities like `top`, `htop`, `vim`, `nano`, `fzf`, `less`, and `git log` with ANSI/VT100 escape sequences, 256-color, and TrueColor (`COLORTERM=truecolor`).
- **Dynamic Window Resizing (`SIGWINCH`)**: Terminal dimensions adjust automatically to browser resizing or fullscreen toggles via `@xterm/addon-fit`. Dimension changes are sent via JSON WebSocket messages (`{"type":"resize","cols":N,"rows":M}`) to trigger real `pty.Setsize` updates.
- **Built-in Controls**: Mac-style window controls, quick directory switcher (`~`, `~/workspaces`, `/tmp`), clear buffer (`⌘K`), restart session, and fullscreen mode.
- **WebSocket Endpoint**: Dedicated streaming at `/api/terminal/ws?cwd=...&cols=...&rows=...`.

---

## 6. Dynamic Skills & Plugins via Agent Chat

You can instruct KendaliAI agents to create skills and plugins directly during conversation.

### Safe Workspace Isolation
All user-created or agent-generated assets are strictly saved to user workspace directories:
- **Generated Skills**: `~/workspaces/skills/generated/<name>/skill.yaml`
- **Generated Plugins**: `~/workspaces/plugins/<id>/plugin.yaml`
- **Core Immutability**: The core `kendali-ai` source repository is never altered.

### Example Chat Interactions

#### 1. Creating a Skill via Chat
> **User:**  
> *"Create a skill named 'docker-auditor' that inspects local Docker containers, audits memory/CPU limits, and flags insecure port exposures."*

**Agent Action:**  
The agent calls `create_skill` with domain, responsibilities, and dependencies. The skill is written to `~/workspaces/skills/generated/docker-auditor/skill.yaml` and loaded into the active runtime.

**Invoking the Skill:**
> **User:**  
> *"/skill:docker-auditor audit all running containers and flag any running as root"*

#### 2. Creating a Plugin via Chat
> **User:**  
> *"Create a plugin named 'jira-bridge' version '1.0.0' that provides ticket fetching and issue transition capabilities."*

**Agent Action:**  
The agent calls `create_plugin`. It writes `~/workspaces/plugins/jira-bridge/plugin.yaml` and exposes the new capabilities to the agent tool catalog.

---

## 7. Auto-Generated Session Titles

KendaliAI automatically titles your conversation sessions:
- On the first turn of a new conversation, the runtime asynchronously generates a concise topic summary.
- The title is cleaned of quotes, punctuation, and conversational prefixes (`"Title:"`, `"Topic:"`, etc.).
- **Strict Limit**: Titles are capped at **20 characters** for clean display across mobile chips, sidebar lists, and Telegram chats.
- Updates are broadcasted immediately via `session.updated` events.

---

## 8. Platform Architecture

KendaliAI is structured around an **AI Agent Gateway & Event Bus** architecture. Channels (Web, Telegram, CLI) bind to **Agents**, conversations belong to **Sessions**, and execution is driven by an interactive **Agent Runtime** connected to a central **Event Bus**.

### 8.1 Conceptual Topology

```text
                         ┌───────────────────────┐
                         │      KendaliAI        │
                         │    Agent Gateway      │
                         └───────────┬───────────┘
                                     │
             ┌───────────────────────┼────────────────────────┐
             │                       │                        │
        Telegram                   Web UI                  API/WS/PTY
             │                       │                        │
       ┌──────┴──────┐         ┌──────┴──────┐          ┌──────┴──────┐
       │ engineer    │         │ engineer    │          │ PTY Shell   │
       │ personal    │         │ personal    │          │ external    │
       │ researcher  │         │ researcher  │          │ clients     │
       └──────┬──────┘         └──────┬──────┘          └─────────────┘
              │                       │
              └───────────┬───────────┘
                          │
                   Session / Message
                          │
                   Agent Runtime
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
      Tools             Memory             MCP
        │                 │                 │
     Shell / PTY       Working           Servers
     Filesystem        Session           (Toggleable)
     HTTP              Long-term         GitHub
     Browser           Semantic/RAG      Postgres, etc.
        │                 │
        └─────────────────┼─────────────────┘
                          │
                     Model Router
                          │
              ┌───────────┼───────────┐
           OpenAI       Claude      Gemini
           DeepSeek     Qwen        Ollama
```

### 8.2 Execution Pipeline

```text
                                 User Channel / API Gateway
                                             │
                                             ▼
                                  Conversation Engine
                                             │
                                             ▼
                                       Goal Tree Engine
                                             │
                                             ▼
                                      Planner / Reasoner
                                             │
                                             ▼
                                       Execution Graph
                                             │
                                             ▼
                                      Execution Scheduler
                                             │
                                             ▼
                                       Supervisor Tree
                                             │
                                             ▼
                                       Agent Processes
                                             │
                                             ▼
                                     Capability Runtime
                                             │
                                             ▼
                                       Executor Registry
                                             │
                                             ▼
                                      Runtime Environment
                                             │
                                             ▼
                                      Target Workspaces
                                 (~/workspaces/skills/generated)
                                 (~/workspaces/plugins)

    ────────────────────────────────────────────────────────────────────────────
     Event Store • Projection Engine • Telemetry & Tracing • Memory Broker Bus
```

### 8.3 Core Architectural Layers

1. **Ingress & Gateway Layer (`internal/channels`, `internal/server`, `internal/gateways`)**
   - Ingests prompts and interaction events across channels (Telegram bot, HTTP REST, SSE, WebSocket, PTY).
   - Manages user sessions, credentials, and message routing into the runtime kernel.

2. **Conversation & Intent Engine (`internal/conversation`, `internal/intent`)**
   - Parses user intents (e.g., plan, execute, fix, review, retry, undo, skill triggers) and links them to the active session.
   - Generates compact, clean session titles (≤ 20 chars) asynchronously.

3. **Goal Tree Engine (`internal/goals`)**
   - Hierarchical **Goal Trees (`GoalGraph`)** for complex multi-step objectives.
   - Parent-child sub-goals, prioritization, constraints, and acceptance criteria verification.

4. **Planner & Workflow Engine (`internal/workflow`, `internal/scheduler`)**
   - Planner decomposes goals into tasks; Workflow Engine executes the DAG (`ExecutionDAG`).
   - Dependency scheduling (`DAGPending`, `DAGRunning`, `DAGCompleted`, `DAGFailed`).

5. **Microkernel & Process Supervision (`internal/kernel`, `internal/runtime`)**
   - Microkernel coordinates process lifecycles (`Spawn`, `Kill`, `Wait`), inter-process communication (Mailbox IPC), and pub/sub events.
   - Supervisor tracks health, auto-restarts, and binds workflow tasks to agent manifests.

6. **Generic Agent Runtime (GAR) (`internal/runtime/agent.go`, `internal/agent`)**
   - Manifest-driven agents (`AgentManifest`) specifying prompt templates, permissions, and tool access.
   - Cognition loop (`internal/agent/cognition.go`): *Plan → Validate → Execute → Observe → Complete*.
   - Model Router (`internal/providers`) for multi-provider routing (DeepSeek, OpenAI, Anthropic, Ollama) with fallback.

7. **Capability Runtime & Policy Engine (`internal/capability`, `internal/policy`)**
   - Fine-grained RBAC rule evaluation (ALLOW / DENY) restricting actions per agent role.
   - Capability broker gates sensitive filesystem or execution operations.

8. **PTY Terminal Engine (`internal/server/terminal_pty.go`)**
   - Full bidirectional pseudo-terminal emulation over WebSocket.
   - Spawns interactive login shells, handles terminal resizing signals, and streams raw ANSI sequences.

---

## 9. Channels

### Telegram

Configure your Telegram bot in `config.yaml`:

```yaml
channels:
  - id: telegram-main
    channelName: telegram
    channelType: telegram
    token: your-telegram-bot-token
```

The Telegram adapter (`internal/channels/telegram_adapter.go`) provides:
- Bidirectional messaging to/from agent sessions
- Multi-user isolation with user-specific sessions
- Markdown message formatting adapter
- Slash-command parsing (`/skill:name`, `/clear`, `/help`)

### Web UI & REST/WebSocket APIs

The Go server (`internal/server/server.go`) exposes:
- `GET /` — Serves embedded React production build
- `POST /api/chat` — Chat completions with Server-Sent Events (SSE) streaming
- `GET /ws` — Agent event stream WebSocket
- `GET /api/terminal/ws` — Real PTY terminal WebSocket stream
- Full REST CRUD API for agents, sessions, providers, skills, plugins, and MCP servers

---

## 10. Storage

KendaliAI supports two storage backends for artifacts, uploads, and session data:

| Backend | Config |
| :--- | :--- |
| **Local** (default) | `storage.provider: local`, `storage.localPath: ./storage` |
| **Cloudflare R2 / S3** | Set `storage.r2.*` credentials in `config.yaml` |

---

## 11. Verification & Tests

Run unit and integration tests across all packages:

```bash
# Run all Go tests
go test ./...

# Run session title tests
go test -v ./internal/gateway -run TestCleanSessionTitle

# Run Telegram adapter tests
go test -v ./internal/channels -run TestTelegramFormatting
```

---

## 12. Project Structure

```
kendali-ai/
├── cmd/kendaliai/       # CLI entry point (start, stop, status, dev, install)
├── internal/
│   ├── agent/           # Generic Agent Runtime (GAR), cognition loop, agent tools
│   ├── capability/      # Capability broker & policy enforcement
│   ├── channels/        # Ingress adapters (Telegram bot & message formatting)
│   ├── config/          # Config loading & validation
│   ├── db/              # SQLite schema & migrations
│   ├── embedding/       # Embedding client for vector memory
│   ├── gateway/         # Core runtime, store, SSE client, title generator
│   ├── goals/           # Goal Tree & GoalGraph engine
│   ├── kernel/          # Microkernel: process registry, mailbox IPC, pub/sub
│   ├── memory/          # Multi-tiered memory broker
│   ├── messaging/       # Lightweight pub/sub event bus & typed events
│   ├── providers/       # LLM provider adapters (OpenAI, DeepSeek, Anthropic, Ollama)
│   ├── runtime/         # Supervisor, agent runner, executor registry
│   ├── scheduler/       # DAG execution scheduler
│   ├── server/          # HTTP REST, WebSocket, metrics, & terminal PTY
│   │   ├── server.go        # HTTP router & handlers
│   │   └── terminal_pty.go  # Pseudo-terminal WebSocket handler (creack/pty)
│   ├── skills/          # Skill discovery, generation & registration
│   ├── storage/         # Local & R2/S3 artifact storage
│   ├── telemetry/       # Tracing & observability
│   ├── tools/           # Built-in tool implementations
│   └── workflow/        # Workflow engine & execution DAG
├── ui/                  # React/TypeScript frontend (Vite + Tailwind + xterm.js)
│   └── src/
│       ├── components/  # ChatArea, MarkdownView, BottomNav, IconRail, PaneHost
│       ├── panes/       # terminal.tsx, editor.tsx, skills.tsx, plugins.tsx, mcps.tsx, etc.
│       ├── hooks/       # WebSocket and agent hooks
│       ├── store/       # Zustand global state
│       └── types.ts     # Shared TypeScript types
├── web/                 # Static build output (embedded in Go binary)
├── scripts/             # install.sh one-line installer
├── skills/              # Built-in skill definitions
├── config.example.yaml  # Example configuration
├── Makefile             # Build, dev, and ops targets
└── .air.toml            # Air live-reload config for Go backend
```
