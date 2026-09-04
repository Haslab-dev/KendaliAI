# KendaliAI (Go Edition)

KendaliAI is a self-hosted, autonomous AI coding agent and orchestration gateway rebuilt natively in Go. Influenced heavily by actor-inspired systems and microkernel architectures, KendaliAI uses dynamic tool invocation, recursive LLM cognition loops, resource locking, and process supervision to execute local filesystem actions.

---

## 1. Quickstart

### Prerequisites
- Go 1.20+
- SQLite3
- CGO (required by `go-sqlite3`)

### 1. Initialize Configuration
Generate a commented default `config.yaml` configuration file:
```bash
go run ./cmd/kendaliai config init
```

This creates `./config.yaml` at the root directory:
```yaml
version: 1

database:
  path: ./build/kendaliai.db

defaultProvider: deepseek

chatProviders:
  - name: deepseek
    type: deepseek
    apiKey: ${DEEPSEEK_API_KEY}
    model: deepseek-chat
  - name: openai
    type: openai
    apiKey: ${OPENAI_API_KEY}
    model: gpt-4o

embedding:
  apiKey: ${OPENAI_API_KEY}
  endpoint: https://api.openai.com/v1
  model: text-embedding-3-small

channels:
  - id: telegram-main
    channelName: telegram
    channelType: telegram
    token: ${TELEGRAM_TOKEN}
```

### 2. Validate Setup
Verify syntax and environment diagnostics:
```bash
# Validate configuration parameters
go run ./cmd/kendaliai config validate

# Verify local dependencies (Go, Git, SQLite, Permissions)
go run ./cmd/kendaliai doctor
```

---

## 2. CLI Command Index

Operate the microkernel daemon using the unified command suite:

| Command | Description |
| :--- | :--- |
| **`kendaliai start`** | Start gateway process in foreground. |
| **`kendaliai start -d`** | Start gateway background daemon. |
| **`kendaliai stop`** | Stop background daemon. |
| **`kendaliai restart`** | Restart daemon. |
| **`kendaliai status`** | Show detailed uptime, CPU, memory, active agents, and cost metrics. |
| **`kendaliai logs`** | Stream system logs (`--follow`, `--agent`, `--session`, `--level`, `--json`). |
| **`kendaliai doctor`** | Diagnose platform dependencies and configurations. |
| **`kendaliai dashboard`** | Launch local TUI dashboard. |
| **`kendaliai config show`** | Dump active configuration. |

---

## 3. Platform Architecture

KendaliAI is built on an **AI Operating System (AIOS)** microkernel architecture. Rather than treating agents as monoliths or hardcoded classes, KendaliAI separates **kernel coordination** (process management, mailboxes, event pub/sub) from **pluggable services** (workflow DAGs, goal trees, capabilities, policies, and cognition loops).

### 3.1 Architectural Flow

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
