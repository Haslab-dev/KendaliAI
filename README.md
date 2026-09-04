# KendaliAI (Go Edition)

KendaliAI is a self-hosted **AI Agent Gateway & Personal AI Runtime** built natively in Go. Designed as a lightweight daemon, KendaliAI unifies multiple specialized agents across **Web UI, Telegram bots, CLI, and REST/WebSocket APIs** with shared sessions, event sourcing, multi-tiered memory, and capability sandboxing.

> **One lightweight Go daemon → many agents → many channels → shared sessions/memory/tools → Web + Telegram bidirectional.**

---

## 1. Quickstart

### Prerequisites
- Go 1.20+
- Node / Bun (for Web UI)
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
| `chatProviders` | LLM providers (OpenAI-compatible, DeepSeek, etc.) |
| `embedding` | Embedding model endpoint and key |
| `channels` | Telegram bot token and channel config |
| `storage` | Local or Cloudflare R2 artifact storage |
| `permissions` | File access allow/deny rules |
| `reflection` | Daily reflection cron schedule |

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

Open **`http://localhost:5173`** for instant Vite HMR. API and WebSocket requests are proxied to `:8080`.

### Production Mode

Build and run the unified single daemon:

```bash
# Build production bundle (UI + Go binary)
make build

# Start daemon (foreground or background)
make start
# or: make start-daemon
```

Open **`http://localhost:8080`** to access the Web UI.

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

## 4. Web UI

The **React/TypeScript** Web UI (`ui/`) is a LibreChat-inspired interface served directly from the Go daemon in production. Key components:

| Component | Description |
| :--- | :--- |
| `ChatArea` | Real-time chat with streaming SSE responses and tool execution cards |
| `ManagementCenter` | Full management dashboard: agents, sessions, providers, channels, memory, tools |
| `LogsStreamingView` | Live log streaming panel with level filtering |
| `Sidebar` | Session list, conversation switcher, and new chat actions |
| `IconRail` | Collapsible navigation rail |
| `ToolExecutionCard` | Expandable card rendering tool call arguments and results |

**Dev**: `make dev` → open `http://localhost:5173`  
**Production**: `make build && make start` → open `http://localhost:8080`

---

## 5. Platform Architecture

KendaliAI is structured around an **AI Agent Gateway & Event Bus** architecture rather than a rigid workflow monolith. Channels (Web, Telegram, CLI) bind to **Agents**, conversations belong to **Sessions**, and execution is driven by an interactive **Agent Runtime** connected to a central **Event Bus**.

### 5.1 Conceptual Topology

```text
                         ┌───────────────────────┐
                         │      KendaliAI        │
                         │    Agent Gateway      │
                         └───────────┬───────────┘
                                     │
             ┌───────────────────────┼────────────────────────┐
             │                       │                        │
        Telegram                   Web UI                  API/WS
             │                       │                        │
      ┌──────┴──────┐         ┌──────┴──────┐          ┌──────┴──────┐
      │ engineer    │         │ engineer    │          │ external    │
      │ finance     │         │ finance     │          │ clients     │
      │ data-science│         │ data-science│          │             │
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
    Shell             Working           Servers
    Filesystem         Session           GitHub
    HTTP               Long-term         Postgres
    Browser            Semantic/RAG       etc.
       │                 │
       └─────────────────┼─────────────────┘
                         │
                    Model Router
                         │
             ┌───────────┼───────────┐
          OpenAI       Claude      Gemini
          DeepSeek     Qwen        Ollama
```

### 5.2 Execution Pipeline

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

   ────────────────────────────────────────────────────────────────────────────
    Event Store • Projection Engine • Telemetry & Tracing • Memory Broker Bus
```

### 5.3 Core Architectural Layers

1. **Ingress & Gateway Layer (`internal/channels`, `internal/server`, `internal/gateways`)**
   - Ingests prompts and interaction events across multiple channels (Telegram bot, HTTP REST server, TUI dashboard).
   - Manages user sessions, credentials, and message routing into the kernel.

2. **Conversation & Intent Engine (`internal/conversation`, `internal/intent`)**
   - Parses user intents (e.g., plan, execute, fix, review, retry, undo) and connects them to the active session.
   - Maps user requests to high-level goals and initializes workflows.

3. **Goal Tree Engine (`internal/goals`)**
   - Evolved from static string prompts into structured, hierarchical **Goal Trees (`GoalGraph`)**.
   - Supports parent-child sub-goal relationships, prioritization, hard/soft constraints (budget, technology, time), acceptance criteria verification, and dependency management.

4. **Planner & Workflow Engine (`internal/workflow`, `internal/scheduler`)**
   - **Separation of Reasoning and Execution**: The Planner handles reasoning and sub-task decomposition, but the **Workflow Engine owns the DAG** (`ExecutionDAG`).
   - The Execution Scheduler evaluates DAG node dependencies (`DAGPending`, `DAGRunning`, `DAGCompleted`, `DAGFailed`), dispatching ready nodes concurrently or sequentially.

5. **Microkernel & Process Supervision (`internal/kernel`, `internal/runtime`)**
   - **Microkernel (`internal/kernel`)**: Lightweight coordination center providing process registration (`Spawn`, `Kill`, `Wait`), inter-process communication (Mailbox IPC), and pub/sub event bus without containing business logic.
   - **Supervisor (`internal/runtime/supervisor.go`)**: Manages process trees, health, restarts, and links workflow tasks to agent manifests.

6. **Generic Agent Runtime (GAR) (`internal/runtime/agent.go`, `internal/agent`)**
   - Agents (Coder, Planner, Reviewer, Researcher) share a **single generic agent runtime** rather than distinct implementations.
   - Agents are instantiated dynamically via **Agent Manifests (`AgentManifest`)** specifying system prompts, allowed capabilities, default skills, and model preferences.
   - Executes recursive LLM cognition loops (`internal/agent/cognition.go`): *Plan → Validate → Execute → Observe → Complete*.
   - Uses the **Model Router (`internal/providers`)** for intelligent multi-provider LLM dispatch (DeepSeek, OpenAI, Anthropic, Ollama) with automatic fallback and token context estimation.

7. **Capability Runtime & Policy Engine (`internal/capability`, `internal/policy`, `internal/runtime/executor`)**
   - **Capability Broker**: Brokering layer restricting dangerous actions (`write_files`, `exec`, shell execution) behind human approval gates when required.
   - **Policy Engine**: Fine-grained RBAC rule evaluation (ALLOW / DENY) restricting actions per agent role.
   - **Executor Registry & Sandbox**: Directs approved actions to sandboxed runtime environments (Filesystem, Shell, MCP tool servers, Unified Skill Packages).

8. **Gateway Runtime (`internal/gateway`)**
   - **Runtime & Store**: Core execution engine managing agent sessions, tool invocations, and conversation state.
   - **Chunker & Extractor**: Document ingestion pipeline for chunking and extracting structured content.
   - **Model Fetcher & SSE Client**: Streaming model inference with Server-Sent Events support.

9. **Messaging Bus (`internal/messaging`)**
   - Lightweight pub/sub event bus for decoupled communication between gateway components.
   - Typed event definitions for session lifecycle, tool execution, and model events.

10. **State, Event Sourcing & Cross-Cutting Bus (`internal/events`, `internal/memory`, `internal/checkpoint`, `internal/blackboard`)**
    - **Event Store (`internal/events/store.go`)**: Append-only event stream (`event_traces`) recording all session actions, tool outputs, and state transitions for auditability and replay.
    - **Memory Broker (`internal/memory/broker.go`)**: Multi-tiered memory scoping (Working, Session, Goal, Workspace, User preferences, Vector embeddings).
    - **Blackboard (`internal/blackboard`)**: Shared ephemeral scratchpad for asynchronous multi-agent coordination (facts, hypotheses, questions).
    - **Checkpoint Manager (`internal/checkpoint`)**: Workspace and state snapshots for disaster recovery, rollbacks, and session resumption.

### 5.4 Key Design Principles

| Principle | Description |
| :--- | :--- |
| **Microkernel Coordination** | Kernel coordinates processes, mailboxes, and events; all execution logic resides in pluggable services. |
| **Workflow Owns the DAG** | Planner reasons about subtasks; Workflow Engine owns execution lifecycle and dependency state. |
| **Generic Agent Runtime** | Agents are defined declaratively via YAML manifests rather than separate codebases. |
| **Zero-Trust Policy & Capabilities** | Every tool execution is evaluated by the Policy Engine and gated by approval brokers when needed. |
| **Event Sourcing & Auditing** | All transitions are persisted in an immutable event trace supporting session replay and recovery. |
| **Streaming-First** | Responses are streamed via SSE; logs, tool outputs, and model tokens are emitted in real-time. |

---

## 6. Channels

### Telegram

Configure a Telegram bot in `config.yaml`:

```yaml
channels:
  - id: telegram-main
    channelName: telegram
    channelType: telegram
    token: your-telegram-token-here
```

The Telegram adapter (`internal/channels/telegram_adapter.go`) supports:
- Bidirectional message routing to/from agent sessions
- Multi-user session isolation
- Inline command handling

### Web UI & REST/WebSocket

The Go server (`internal/server/server.go`) exposes:
- `GET /` — Serves the embedded React SPA
- `POST /api/chat` — Chat completions with SSE streaming
- `GET /ws` — WebSocket connection for real-time agent events
- Full CRUD API for agents, sessions, providers, tools, and memory

---

## 7. Custom Skills

KendaliAI supports custom skills located in `~/.kendaliai/skills/` (global) or `.agents/skills/` (workspace).
Add specialized instruction guidelines by creating a Markdown file with YAML frontmatter:

**Example: `.agents/skills/frontend-design/SKILL.md`**
```markdown
---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces.
---
## Principles
- Use Outfit/Roboto fonts.
- Avoid generic colors.
- Use smooth gradients.
```

Skills are discovered at startup and registered as on-demand tools available to all agents.

---

## 8. Storage

KendaliAI supports two storage backends for artifacts, uploads, and session data:

| Backend | Config |
| :--- | :--- |
| **Local** (default) | `storage.provider: local`, `storage.localPath: ./storage` |
| **Cloudflare R2 / S3** | Set `storage.r2.*` fields in `config.yaml` |

Local storage is always available with no additional configuration. R2/S3 is layered on top.

---

## 9. Verification & Tests

To run the full suite of integration tests:
```bash
go run ./tests/test_mak_run.go
```

---

## 10. Project Structure

```
kendali-ai/
├── cmd/kendaliai/       # CLI entry point (start, stop, status, dev, install)
├── internal/
│   ├── agent/           # Generic Agent Runtime (GAR) & cognition loop
│   ├── capability/      # Capability broker & policy enforcement
│   ├── channels/        # Ingress adapters (Telegram)
│   ├── config/          # Config loading & validation
│   ├── db/              # SQLite schema & migrations
│   ├── embedding/       # Embedding client for vector memory
│   ├── gateway/         # Core runtime, store, SSE client, chunker, extractor
│   ├── goals/           # Goal Tree & GoalGraph engine
│   ├── kernel/          # Microkernel: process registry, mailbox IPC, pub/sub
│   ├── memory/          # Multi-tiered memory broker
│   ├── messaging/       # Lightweight pub/sub event bus & typed events
│   ├── providers/       # LLM provider adapters (OpenAI, DeepSeek, Anthropic, Ollama)
│   ├── runtime/         # Supervisor, agent runner, executor registry
│   ├── scheduler/       # DAG execution scheduler
│   ├── server/          # HTTP REST & WebSocket server
│   ├── skills/          # Skill discovery & registration
│   ├── storage/         # Local & R2/S3 artifact storage
│   ├── telemetry/       # Tracing & observability
│   ├── tools/           # Built-in tool implementations
│   └── workflow/        # Workflow engine & execution DAG
├── ui/                  # React/TypeScript frontend (Vite + Tailwind)
│   └── src/
│       ├── components/  # ChatArea, ManagementCenter, Sidebar, LogsStreamingView, etc.
│       ├── hooks/       # useAgentSocket (WebSocket hook)
│       ├── store/       # Zustand global state
│       └── types.ts     # Shared TypeScript types
├── web/                 # Static build output (embedded in Go binary)
├── scripts/             # install.sh one-line installer
├── skills/              # Built-in skill definitions
├── config.example.yaml  # Example configuration
├── Makefile             # Build, dev, and ops targets
└── .air.toml            # Air live-reload config for Go backend
```
