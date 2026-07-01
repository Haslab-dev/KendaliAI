# KendaliAI RFC Index

**Version:** 0.3.4
**Status:** Draft

## Overview

KendaliAI is an **AI Operating System (AIOS)** — a platform that orchestrates multi-agent workflows, manages persistent sessions, and provides durable task execution.

### Design Principles

1. **Microkernel** — Kernel coordinates, doesn't implement
2. **Generic Agent** — All agents same process type with manifests
3. **Workflow owns DAG** — Workflow owns execution, Planner owns reasoning
4. **Execution Runtime** — Capability-based with Policy Engine
5. **ChangeSet semantics** — Semantic changes, not text patches
6. **Blackboard** — Temporary shared scratchpad
7. **Policy Engine** — Runtime-configurable security
8. **Checkpoint** — Crash recovery via snapshots
9. **Goal Manager** — Goals evolve as trees, not strings
10. **Context Manager** — Intelligent context assembly

## RFC List

### Foundation

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0000](./RFC0000-Agent-Kernel.md) | Agent Kernel (Microkernel) | Draft | - |
| [RFC0001](./RFC0001-Session-Service.md) | Session Service | Draft | RFC0000 |
| [RFC0002](./RFC0002-Workspace-Manager.md) | Workspace Manager | Draft | RFC0000 |
| [RFC0003](./RFC0003-Task-Graph.md) | Task Graph (Dynamic DAG) | Draft | RFC0000 |
| [RFC0004](./RFC0004-Agent-State-Machine.md) | Agent State Machine | Draft | RFC0000 |
| [RFC0005](./RFC0005-Planner.md) | Planner | Draft | RFC0000, RFC0019 |
| [RFC0006](./RFC0006-Execution-Engine.md) | Execution Engine | Draft | RFC0000 |
| [RFC0007](./RFC0007-Event-Bus.md) | Event Bus | Draft | RFC0000 |
| [RFC0008](./RFC0008-Artifact-Store.md) | Artifact Store | Draft | RFC0000 |

### Runtime

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0019](./RFC0019-Agent-Runtime.md) | Agent Runtime | Draft | RFC0000 |
| [RFC0020](./RFC0020-Workflow-Engine.md) | Workflow Engine | Draft | RFC0019 |
| [RFC0021](./RFC0021-Observation-Layer.md) | Observation Layer | Draft | RFC0000 |
| [RFC0022](./RFC0022-Dynamic-DAG.md) | Dynamic DAG | Draft | RFC0003 |
| [RFC0023](./RFC0023-Tool-Manifest.md) | Tool Manifest | Draft | - |
| [RFC0024](./RFC0024-Capability-Runtime.md) | Capability Runtime | Draft | RFC0023 |
| [RFC0025](./RFC0025-Resource-Manager.md) | Resource Manager | Draft | RFC0000 |

### Execution (Renamed from Capability Runtime)

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0024](./RFC0024-Capability-Runtime.md) | Execution Runtime | Draft | RFC0023 |

### Coordination

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0026](./RFC0026-Blackboard-System.md) | Blackboard System | Draft | RFC0000 |
| [RFC0027](./RFC0027-Policy-Engine.md) | Policy Engine | Draft | RFC0000, RFC0024 |
| [RFC0028](./RFC0028-Checkpoint-Manager.md) | Checkpoint Manager | Draft | RFC0000, RFC0001 |

### Intelligence

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0009](./RFC0009-Knowledge-Base.md) | Knowledge Base | Draft | RFC0001 |
| [RFC0011](./RFC0011-Context-Engine.md) | Context Engine | Draft | RFC0017 |
| [RFC0016](./RFC0016-Long-Term-Memory.md) | Long-Term Memory | Draft | RFC0009 |
| [RFC0017](./RFC0017-Repository-Indexer.md) | Repository Indexer | Draft | - |

### Planning & Goals

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0029](./RFC0029-Goal-Manager.md) | Goal Manager | Draft | RFC0000, RFC0020 |
| [RFC0030](./RFC0030-Task-Graph.md) | Task Graph | Draft | RFC0020, RFC0022 |
| [RFC0031](./RFC0031-Context-Manager.md) | Context Manager | Draft | RFC0011, RFC0017 |
| [RFC0032](./RFC0032-Prompt-Compiler.md) | Prompt Compiler | Draft | RFC0029, RFC0031 |
| [RFC0033](./RFC0033-Tool-Scheduler.md) | Tool Scheduler | Draft | RFC0024, RFC0025 |

### Communication

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0015](./RFC0015-Telebot-Protocol.md) | Telebot Protocol | Draft | RFC0007, RFC0019 |

### Quality

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0012](./RFC0012-Git-Engine.md) | Git Engine | Draft | RFC0020 |
| [RFC0013](./RFC0013-Review-Engine.md) | Review Engine | Draft | RFC0024 |

### Scale

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0014](./RFC0014-Multi-Agent.md) | Multi-Agent | Draft | RFC0019 |
| [RFC0018](./RFC0018-AI-Router.md) | AI Router | Draft | RFC0025 |

### Files

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0010](./RFC0010-File-Intelligence.md) | File Intelligence | Draft | - |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Channels (Telegram, REST)                    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Intent Parser                                  │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Kernel (Microkernel)                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Process │  │  Event  │  │  IPC /  │  │Registry │            │
│  │ Manager │  │   Bus   │  │ Mailbox │  │         │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      │                           │                           │
      ▼                           ▼                           ▼
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│  Workflow   │           │   Model     │           │   Policy    │
│  Engine     │           │   Router    │           │   Engine    │
└──────┬──────┘           └─────────────┘           └─────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Generic Agent Process                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ Planner │  │  Coder  │  │Reviewer │  │Research │          │
│  │ Agent   │  │ Agent   │  │ Agent   │  │ Agent   │          │
│  │(manifest│  │(manifest│  │(manifest│  │(manifest│          │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Execution Runtime                               │
│                                                                  │
│   Capability ──► Policy ──► Scheduler ──► Sandbox ──► Tool           │
│                                                                  │
│   Code Capability ──► AST Runtime / File Runtime / Git Runtime       │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supporting Services                             │
│                                                                  │
│   Goal Manager ◄────── Planner ──────► Context Manager            │
│                                                                  │
│   Blackboard ◄────── Observations ◄───── Memory                    │
│                                                                  │
│   Checkpoint ◄────── Workspace ◄───── Artifact Graph             │
│                                                                  │
│   Prompt Compiler ◄────── Templates ◄────── Versions              │
└─────────────────────────────────────────────────────────────────┘
```

## Minimum Autonomous Kernel (MAK)

For early testing, implement these 10 pieces first:

1. Kernel - Process spawn/kill/wait, mailbox, event bus
2. Session + Workspace - Basic isolation
3. Generic Agent Process - One agent type, manifest-driven
4. Execution Runtime - Capability, Policy, Tool
5. Workflow Engine - Single phase, linear execution
6. Goal Manager - Goal trees, not strings
7. Context Manager - Intelligent context assembly
8. Blackboard - Shared facts/questions
9. Tool Scheduler - Parallel tool execution
10. Telegram Gateway - Send/receive messages

## RFC Priority

| Priority | RFC | Why |
|----------|-----|-----|
| ⭐⭐⭐⭐⭐ | RFC0029 Goal Manager | Goals evolve independently of sessions and workflows |
| ⭐⭐⭐⭐⭐ | RFC0031 Context Manager | Quality of coding agents depends heavily on intelligent context assembly |
| ⭐⭐⭐⭐☆ | RFC0032 Prompt Compiler | Keeps prompts modular, versioned, and easier to maintain |
| ⭐⭐⭐⭐☆ | RFC0033 Tool Scheduler | Enables parallel tool execution and improves throughput |
| ⭐⭐⭐☆☆ | RFC0030 Task Graph | Clean separation if workflows become very complex |
