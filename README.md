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
