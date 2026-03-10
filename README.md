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

- [ ] **Phase 2: AI Gateway & Agents**
  - [ ] AI Gateway (model routing, provider adapters, caching) (`src/gateway`)
  - [ ] Agent Runtime (planner, executor, memory) (`src/agents`)

- [ ] **Phase 3: Workflow Automation**
  - [ ] Workflow engine (node engine, triggers, scheduler) (`src/workflow`)

- [ ] **Phase 4: Dashboard UI**
  - [ ] System monitoring (`src/dashboard/pages/Overview`)
  - [ ] Workflow editor (`src/dashboard/pages/Workflows`)

- [ ] **Phase 5: Plugin SDK**
  - [ ] Tool extensions, workflow nodes, UI widgets SDK (`src/sdk`)

- [ ] **Phase 6: Messaging Integration**
  - [ ] Messaging adapters (Telegram, Discord, WhatsApp) (`src/adapters`)

## Quickstart

```bash
bun install
bun run dev
```

The frontend application runs on top of Vite and React. The backend API is entirely unified under `src/server` (or run concurrently) to avoid monorepo setups.
