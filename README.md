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

### Commands & Workflows (Makefile)

| Command | Description |
| :--- | :--- |
| `make dev` | **Full-stack dev mode**: Auto-clears ports, runs Go daemon (`:8080`) + Vite HMR (`:5173`) |
| `make start` | Starts gateway in foreground (auto-clears port `8080` & previous processes first) |
| `make start-daemon` | Starts gateway in background daemon mode |
| `make stop` | Gracefully stops daemon, terminates orphaned listeners, and releases port `8080` |
| `make restart` | Restarts gateway daemon cleanly |
| `make status` | Inspects daemon state, uptime, PID, and port `8080` listener status |
| `make build` | Builds both production React UI assets (`ui/dist`) and Go binary (`build/kendaliai`) |
| `make install` | Builds and installs `kendaliai` to system PATH (macOS & Linux), replacing old builds |

### 1. Development Mode
Run backend and frontend with live hot-reloading:
```bash
make dev
```
Open **`http://localhost:5173`** for instant Vite HMR, which proxies API and WebSocket requests to `:8080`.

### 2. Production Mode
Build and run the unified single daemon:
```bash
# Build production bundle (UI + Go binary)
make build

# Start daemon (foreground or background)
make start
# or: make start-daemon
```

Open **`http://localhost:8080`** to access the **LibreChat-inspired Web UI** (supporting Dark/Light themes, collapsible tool execution cards, agent personas, MCPs, and Telegram bots).

---

## 2. CLI Command Index

Operate the gateway daemon using the unified command suite:

| Command | Description |
| :--- | :--- |
| **`kendaliai start`** | Start gateway process & Web UI in foreground (`:8080`). |
| **`kendaliai start -d`** | Start gateway background daemon. |
| **`kendaliai stop`** | Stop background daemon. |
| **`kendaliai restart`** | Restart daemon. |
| **`kendaliai status`** | Show uptime, active sessions, agents, and bot metrics. |
| **`kendaliai logs`** | Stream system logs (`--follow`, `--agent`, `--session`, `--level`, `--json`). |
| **`kendaliai doctor`** | Diagnose platform dependencies and configurations. |
| **`kendaliai tools`** | List all registered built-in agent capabilities. |
| **`kendaliai agent`** | CLI wizard to create, list, install, and manage agent manifests. |
| **`kendaliai skill`** | CLI manager for skills and packages. |

---

## 3. Platform Architecture

KendaliAI is structured around an **AI Agent Gateway & Event Bus** architecture rather than a rigid workflow monolith. Channels (Web, Telegram, CLI) bind to **Agents**, conversations belong to **Sessions**, and execution is driven by an interactive **Agent Runtime** connected to a central **Event Bus**.

### 3.1 Conceptual Topology

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

### 3.2 Core Architectural Layers

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

8. **State, Event Sourcing & Cross-Cutting Bus (`internal/events`, `internal/memory`, `internal/checkpoint`, `internal/blackboard`)**
   - **Event Store (`internal/events/store.go`)**: Append-only event stream (`event_traces`) recording all session actions, tool outputs, and state transitions for auditability and replay.
   - **Memory Broker (`internal/memory/broker.go`)**: Multi-tiered memory scoping (Working, Session, Goal, Workspace, User preferences, Vector embeddings).
   - **Blackboard (`internal/blackboard`)**: Shared ephemeral scratchpad for asynchronous multi-agent coordination (facts, hypotheses, questions).
   - **Checkpoint Manager (`internal/checkpoint`)**: Workspace and state snapshots for disaster recovery, rollbacks, and session resumption.

### 3.3 Key Design Principles

| Principle | Description |
| :--- | :--- |
| **Microkernel Coordination** | Kernel coordinates processes, mailboxes, and events; all execution logic resides in pluggable services. |
| **Workflow Owns the DAG** | Planner reasons about subtasks; Workflow Engine owns execution lifecycle and dependency state. |
| **Generic Agent Runtime** | Agents are defined declaratively via YAML manifests rather than separate codebases. |
| **Zero-Trust Policy & Capabilities** | Every tool execution is evaluated by the Policy Engine and gated by approval brokers when needed. |
| **Event Sourcing & Auditing** | All transitions are persisted in an immutable event trace supporting session replay and recovery. |

---

## 4. Custom Skills

KendaliAI supports custom skills located in `~/.gemini/config/skills/` (global) or `.agents/skills/` (workspace):
Add specialized instruction guidelines by creating a Markdown file with YAML frontmatter. These are registered as tools loaded on demand:

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

---

## 5. Verification & Tests

To run the full suite of MAK OS primitives integration tests:
```bash
go run ./tests/test_mak_run.go
```
