# KendaliAI RFC Index

**Version:** 0.4.1
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

---

## Architecture Summary

KendaliAI follows a **microkernel** design: the kernel coordinates (process registry, mailbox, event bus, resource tracker, component registry) but does **not** implement business logic. Business logic lives in pluggable services — Workflow Engine, Supervisor, Capability Runtime, and Policy Engine.

### Layered Flow

```
Channels (Telegram, Discord, REST)
        │
        ▼
Intent Parser  (continue / fix / retry / undo / review / explain / plan)
        │
        ▼
Agent Kernel (Microkernel)  ── coordinates only
   Process Manager · Event Bus · IPC/Mailbox · Registry
        │
        ├───────────────┼───────────────┐
        ▼               ▼               ▼
   Workflow Engine   Model Router    Policy Engine
        │
        ▼
   Supervisor (Process Tree) → Generic Agent Processes
        │
        ▼
   Execution Runtime + Policy Engine
   Capability → Policy → Scheduler → Sandbox → Tool
   Code Capability → AST Runtime / File Runtime / Git Runtime
        │
        ▼
   Supporting Services
   Blackboard ← Observations ← Memory
   Checkpoint ← Workspace ← Artifact Graph
   Repository Index ← Incremental Watcher
```

### Key Architectural Changes

1. **Microkernel** — coordinates via IPC; business logic in services.
2. **Workflow Owns DAG** — Workflow owns execution, Planner owns reasoning.
3. **Generic Agent Process** — one process type, different manifests (planner / coder / reviewer / research).
4. **ChangeSet** — semantic changes (InsertComponent, ReplaceFunction, DeleteRoute, RenameSymbol) resolved by a Conflict Resolver, not text patches.
5. **Blackboard System** — temporary coordination scratchpad (facts, questions, answers, hypotheses, notes).
6. **Policy Engine** — runtime-configurable security (allow/deny per role).
7. **Checkpoint Manager** — crash recovery via workspace/memory/DAG/artifact/process snapshots.
8. **Human Approval Gate** — pauses for human input on expensive, destructive, or production operations.

### Directory Structure

```
kendaliai/
├── cmd/kendaliai/             # CLI commands
├── internal/
│   ├── kernel/                # Microkernel (coordination only)
│   ├── runtime/               # Generic Agent Process, Supervisor, manifests
│   ├── workflow/              # Workflow engine (OWNS DAG), phases, templates, approval
│   ├── planner/               # Reasoning, planning context, replanning
│   ├── executor/              # Task execution, ChangeSet handling, merge
│   ├── execution/             # Runtime, capability, sandbox, code/fs/ast/shell
│   ├── policy/                # Policy engine, evaluator, audit
│   ├── blackboard/            # Shared scratchpad, entries, subscriptions
│   ├── checkpoint/            # Snapshots, restore, rollback
│   ├── goals/                 # Goal manager, graph, tree, evaluation
│   ├── taskgraph/             # Task graph, builder, registry, state, templates
│   ├── context/               # Context manager, builder, scorer, cache, assembler
│   ├── prompts/               # Prompt compiler, templates, resolver, validator
│   ├── scheduler/             # Scheduler, dependency, priority, rate limiter
│   ├── observation/           # Observation engine, normalizers, aggregator
│   ├── dag/                   # Mutable dynamic DAG operations
│   ├── resource/              # Resource/budget/rate management
│   ├── index/                 # Repository indexer, watcher, graphs
│   ├── intent/                # Intent parser, workflow generation
│   ├── memory/                # Semantic, episodic, procedural, working memory
│   ├── artifact/              # Artifact store, dependency graph
│   ├── session/  workspace/  knowledge/  git/  review/  channels/  tools/
└── spec/                      # RFCs (see below)
```

### Minimum Autonomous Kernel (MAK)

For early testing, implement these 10 pieces first:

1. Kernel — process spawn/kill/wait, mailbox, event bus
2. Session + Workspace — basic isolation
3. Generic Agent Process — one agent type, manifest-driven
4. Capability Runtime — file, shell, git capabilities
5. Policy Engine — basic allow/deny
6. Workflow Engine — single phase, linear execution
7. Blackboard — shared facts/questions
8. Planner — simple goal → task decomposition
9. Executor — run task, report result
10. Telegram Gateway — send/receive messages

### Version Timeline

| Version | Milestone | Features |
|---------|-----------|----------|
| v0.4.0 | MAK Complete | Kernel, Generic Agent, Workflow, Telegram |
| v0.5.0 | Planning | Planner, Blackboard, Observation |
| v0.6.0 | Persistence | Session, Workspace, Checkpoint, Artifact |
| v0.7.0 | Security | Policy Engine, Approval Gate |
| v0.8.0 | Intelligence | Memory, Knowledge, Context |
| v0.9.0 | Quality | Git, Review, Dynamic DAG |
| v1.0.0 | Scale | Multi-Agent, Model Router, Distributed |
| v1.1.0 | Production | Event Sourcing, Monitoring |

---

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
| [RFC0024](./RFC0024-Capability-Runtime.md) | Capability Runtime (Execution Runtime) | Draft | RFC0023 |
| [RFC0025](./RFC0025-Resource-Manager.md) | Resource Manager | Draft | RFC0000 |

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

### Skills & Runtime Extensions

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0034](./RFC0034-Dynamic-Skills-Generation.md) | Dynamic Skills Generation | Draft | - |
| [RFC0035](./RFC0035-Autonomous-Memory-Skills.md) | Autonomous Daily Skill Generation & Reflective Memory | Draft | RFC0034 |
| [RFC0036](./RFC0036-Agent-Evaluation-Test-Suite.md) | Agent Evaluation Test Suite | Draft | - |
| [RFC0037](./RFC0037-Agentic-Coding-Runtime.md) | Agentic Coding Runtime (ACR) | Draft | RFC0024 |
| [RFC0038](./RFC0038-Hierarchical-Context-&-Token-Cache-Engine-(HCTC).md) | Hierarchical Context & Token Cache Engine (HCTC) | Draft | RFC0031 |
| [RFC0039](./RFC0039-Unified-Data-Layer.md) | Unified Data Layer | Draft | RFC0001 |
| [RFC0040](./RFC0040-Workspace-Intelligence-Engine.md) | Workspace Intelligence Engine (WIE) | Draft | RFC0002 |
| [RFC0041](./RFC0041-Unified-Skill-Package-(USP).md) | Unified Skill Package Format (KSP) | Draft | RFC0034 |

### Agent Runtime & Orchestration

| RFC | Title | Status | Depends |
|-----|-------|--------|---------|
| [RFC0042](./RFC0042-Generic-Agent-Runtime.md) | Generic Agent Runtime (GAR) | Draft | RFC0041, RFC0044 |
| [RFC0043](./RFC0043-Multi-Agent-Orchestration.md) | Multi-Agent Orchestration | Draft | RFC0042, RFC0044, RFC0045 |
| [RFC0044](./RFC0044-Agent-Registry-&-Manifest.md) | Agent Registry & Manifest | Draft | RFC0042 |
| [RFC0045](./RFC0045-Model-Router-&-Inference-Policy.md) | Model Router & Inference Policy | Draft | RFC0025 |

---

## RFC Priority

| Priority | RFC | Why |
|----------|-----|-----|
| ⭐⭐⭐⭐⭐ | RFC0029 Goal Manager | Goals evolve independently of sessions and workflows |
| ⭐⭐⭐⭐⭐ | RFC0031 Context Manager | Quality of coding agents depends heavily on intelligent context assembly |
| ⭐⭐⭐⭐☆ | RFC0032 Prompt Compiler | Keeps prompts modular, versioned, and easier to maintain |
| ⭐⭐⭐⭐☆ | RFC0033 Tool Scheduler | Enables parallel tool execution and improves throughput |
| ⭐⭐⭐☆☆ | RFC0030 Task Graph | Clean separation if workflows become very complex |
