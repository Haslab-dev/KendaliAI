# KendaliAI — Product Goal & Roadmap

> **Created:** 2026-09-05 · **Owner:** lutfi.ikbal · **Status:** approved direction
> **Baseline:** v0.4.1 (`fdda4f2` — Doc Store tab, `/doc:` autocomplete, RAG context injection)

---

## 1. Mission

KendaliAI is my **personal Agent Development & Assistant Workspace**: a self-hosted Go agent, reachable from Telegram and a mobile-friendly WebUI, that can **plan work, execute it with tools and sub-agents, store my data in user-defined collections, remember what I tell it, and report progress asynchronously** — the "Hermes experience" specialized for a TypeScript/Go developer. Chat is the interface; the workspace (boards, collections, schedules, docs, agents) is the product.

---

## 2. Who this is for

- **Developer:** primarily TypeScript and Go; works across several codebases.
- **Daily tools:** Google Calendar, Gmail + Google Workspace (Docs, Sheets, Slides), Zoom, Jira, Mattermost, Confluence, email.
- **Disposition:** AI and automation enthusiast — wants the agent to *do things*, not just talk.
- **Environment:** self-hosted single Go binary + SQLite; primary timezone **Asia/Jakarta**; mixed English/Indonesian input (e.g. `5mill` / `5juta` / `5000000` are the same number).
- **Access patterns:** at a desk (WebUI, full panes) and remote from a phone (Telegram + mobile WebUI) with equal control.

---

## 3. Benchmarks — what we adopt, what we skip

| Reference | Adopt | Skip |
|---|---|---|
| [Hermes Agent](https://hermes-agent.nousresearch.com/docs/) (Nous Research) | Cron scheduling with **delivery to connected platforms**; isolated **sub-agents** for parallel workstreams; skills as procedural memory; `SOUL.md`-style persona file; **FTS5-style hybrid recall**; durable "specialist bots" (→ our agent personas) | 20+ messaging platforms (Telegram + WebUI is enough); voice mode; RL/Atropos research tooling; serverless runtime backends |
| [omp](https://omp.sh/) (oh-my-pi) | Plan-then-execute discipline; sub-agent fan-out; native-engine performance mindset ("the engine does the heavy lifting") | IDE/LSP/DAP feature set; Rust engine |
| [langchaingo](https://github.com/tmc/langchaingo/) | — | **Evaluated and declined** (decision DEC-1). We evolve our own thin RAG instead. |

**Standing decisions** (see §9 for rationale): own thin RAG; managed collections; MCP-first integrations; PWA over native mobile apps; all tracks built in parallel with the **task planner as the unifying product**.

---

## 4. Current state — codebase audit (2026-09-05)

### 4.1 Working today

| Capability | Where |
|---|---|
| Go 1.25 single-binary gateway daemon + SQLite | `cmd/kendaliai/start.go`, `internal/db/schema.go` |
| Telegram ↔ WebUI bi-directional chat, incl. **server-initiated push** (Web messages mirror to Telegram and vice versa) | `internal/channels/telegram_adapter.go` (`listenGlobalEvents`), `internal/messaging/bus.go`, `ui/src/hooks/useAgentSocket.ts` over `/ws` |
| Telegram live progress UX (Thinking… → ⚙️ tool… → final edit), forum topics, `/new /agent /switch` | `internal/channels/telegram_adapter.go` |
| ~50 tools across two registries (filesystem, exec, git, repo intel, memory, storage, skills, HTTP, DB, notify…) | `internal/agent/tools.go`, `internal/tools/registry.go` |
| MCP **client** (stdio + Streamable HTTP), DB-backed server registry + UI tab | `internal/agent/tools.go` (`mcp_call`), `internal/server/server.go` `/api/mcps`, `MCPsTab` |
| Doc Store / RAG: upload, chunking (1500/150), OpenAI-compatible embeddings, cosine search, `/doc:` injection, auto-ingest of long pastes | `internal/gateway/chunker.go`, `internal/embedding/client.go`, `internal/gateway/store.go` (`SearchDocumentChunks`), `internal/gateway/runtime.go` |
| Skills system: `SKILL.md` (YAML frontmatter), generated skills, keyword+embedding router, UI tab | `internal/skills/`, `SkillsTab` in `ui/src/components/ManagementCenter.tsx` |
| Agent personas as DB rows + `Persona.md` identity | `gateway/store.go` (`AgentConfig`), `internal/agent/cognition.go` (`loadPersonaConfig`) |
| Goal graph data model (root/sub-goals, statuses, acceptance criteria) | `internal/goals/manager.go`, `internal/agent/goal.go` |
| Daily reflection daemon (midnight, Asia/Jakarta) — the only working time-based job | `internal/reflection/daemon.go` |
| Sandboxed path/permission rules, AES-GCM helper | `internal/agent/security.go`, `internal/security/encryption.go` |

### 4.2 Dormant — written, never wired into startup

- **Multi-agent subsystem**: `internal/kernel/` (AgentKernel, ProcessRegistry, Mailbox), `internal/runtime/supervisor.go` + `agent.go` + manifests `{coder,planner,reviewer}.yaml`, `internal/workflow/` DAG engine, `internal/blackboard/` — **none are instantiated in `cmd/kendaliai/start.go`**.
- **Scheduler persistence without an executor**: `internal/tools/scheduler.go` persists jobs to `~/.kendaliai/scheduler/` but nothing reads/fires them; `parseScheduleTime()` handles only keyword intervals and its default branch returns a fictional *"next run calculated by cron daemon"* string. No cron library in `go.mod`; no natural-language date parsing.
- **Autonomy schema with no runner**: `heartbeats` table + `gateways.autonomous_enabled/autonomous_interval` in `internal/db/schema.go`.
- **`internal/scheduler/execution_scheduler.go`** — priority-queue execution scheduler, never instantiated.
- **Pairing scaffolding**: `pairings` table exists; no code writes/reads pairing codes; no WebUI onboarding.

### 4.3 Missing

- **Native function calling** — tool dispatch is a text protocol (`tool: NAME({...})` parsed by `internal/agent/planner.go`); `sashabaranov/go-openai` is never used with a `Tools` parameter. Fragile with complex/parallel tool use.
- **Collections abstraction** — `execute_sql` could `CREATE TABLE`, but there is no user-defined-collection concept, no validation, no UI.
- **Kanban / board UI** — goal graph exists; nothing renders tasks or plans.
- **UI architecture** — all management screens are modals inside a 2,034-line `ui/src/components/ManagementCenter.tsx` (`fixed inset-0`); no router; zero responsive breakpoints or media queries anywhere in `ui/src`.
- **Integrations** — Calendar is macOS AppleScript (`internal/tools/calendar.go`), email is raw SMTP (`internal/tools/email.go`); **no Google Workspace, Jira, Zoom, Mattermost, Confluence; no OAuth anywhere**.
- **Secrets hygiene** — `providers.api_key` and Telegram tokens stored plaintext; only `gateways.api_key_encrypted` is encrypted.
- **Engineering hygiene** — 9 Go test files, no frontend tests, no test/lint job in CI (`.github/workflows/build.yml` is release-only).

---

## 5. Product pillars

Each pillar states **today → target**.

- **P1 · Core agent runtime** — Two parallel agent stacks (gateway turn loop + cognition loop) and a text-protocol tool format → **one engine** with **native function calling** (OpenAI-compatible + Anthropic tool APIs), parallel tool execution, streaming from the provider layer to every surface.
- **P2 · Autonomy & scheduler** — Jobs are persisted but nothing fires → a **real executor daemon**: cron expressions + natural-language dates ("10 September at 10am"), timezone-aware (Asia/Jakarta), persisted in SQLite, retry/missed-run policy, **delivery to Telegram and WebUI**; heartbeats as opt-in autonomy.
- **P3 · Memory & RAG (own thin RAG, upgraded)** — Brute-force cosine over JSON blobs → **SQLite FTS5 hybrid retrieval** (BM25 + vectors, score fusion — Hermes itself uses FTS5), better chunking, per-collection and per-session scoping, pluggable embedding config. No external RAG framework.
- **P4 · Dynamic data: managed collections** — Raw SQL escape hatch only → **managed collections**: the agent infers a typed schema from natural language ("track my cash flow" → amount/category/date/note), normalizes values (currency, `5mill/5juta/5000000`, dates like "this weekend"), validated CRUD via chat tools, browse/edit pane in the UI, CSV import/export, namespaced SQLite tables.
- **P5 · Planner & Kanban (the unifying product)** — In-memory goal graph → **plans and kanban boards**: goals become plan documents and task cards; tasks are created/updated from chat or Telegram; async progress digests; boards are a first-class UI pane. **Dogfooding rule: the roadmap in this file becomes the first board.**
- **P6 · Multi-agent orchestration** — Dormant kernel → **wired supervisor**: the agent spawns sub-agents (e.g. explorer A on codebase A, explorer B on codebase B, planner C on the web), jobs tracked in a registry with status/cancel, results delivered asynchronously to Telegram/WebUI through the existing event bus.
- **P7 · Workspace UI (panes, not modals — mobile-first)** — Modal management center → **routed panes** (Chat, Boards, Collections, Scheduler, Docs, MCPs, Skills, Agents, Logs) with a responsive shell: desktop sidebar/rail, mobile bottom nav + touch targets, installable PWA — so the whole workspace is operable from a phone.
- **P8 · Extensibility & integrations (MCP-first)** — AppleScript/SMTP stopgaps → **MCP-first connectors**: Google Calendar/Gmail/Workspace, Jira, Confluence, Zoom, Mattermost via curated MCP server configs + OAuth token storage on top of the existing `mcp_call`; CLI binary execution hardened with allowlists and output policies; all secrets encrypted at rest.

---

## 6. Acceptance scenarios — definition of done

The product is "done" when all of these pass. Each is measurable and maps to milestones in §7.

- **S1 · Reminder.** I say **"Make reminder meeting 10 September at 10am"** in Telegram or WebUI.
  ✅ A persisted job is created and visible via `list_schedules`; it fires at 10:00 Asia/Jakarta on Sept 10; I receive the notification on **both** Telegram and WebUI; missed runs (server down at fire time) are delivered on next start.
- **S2 · Cash flow.** I say **"I want to manage my money cash flow"**, then **"store i use 5000 for buy ice cream"**, **"I got salary 5mill"** (also accepts `5juta`, `5000000`, `Rp5.000.000`), and later **"how much my expense this weekend"**.
  ✅ A typed collection exists (amount/category/date/note); both phrases insert normalized rows without manual schema talk; the weekend query returns a correct sum; I can browse and edit rows in a Collections pane and export CSV.
- **S3 · Plan & kanban with async reporting.** I say **"Plan and build feature X"** (from Telegram, phone away).
  ✅ A plan and kanban board are created; the agent executes via tasks; each meaningful progress step is reported to Telegram asynchronously; tasks visibly move columns; I can reply from Telegram to redirect work.
- **S4 · Parallel exploration.** I ask the agent to **explore codebase A and codebase B in parallel and produce a joint plan**.
  ✅ Two sub-agents run concurrently (one per codebase) plus a planner step; I see live status per job; the merged result lands in chat and is attached to the board.
- **S5 · MCP / CLI delegation.** I ask the agent to do something via an external MCP server (e.g. Jira) or a CLI binary.
  ✅ The agent routes through `mcp_call`/exec, and returns the output in the conversation, with failures surfaced honestly.
- **S6 · Remote mobile control.** On a phone browser (PWA installed): check board status, read the latest agent report, nudge/update a task, and chat.
  ✅ No horizontal scroll, no modal traps, bottom-nav navigation, touch targets ≥ 44px; Telegram remains fully usable as fallback.

---

## 7. Roadmap — parallel tracks (kanban-style task plan)

All tracks run in parallel. Two **sync gates** serialize only what must be serialized:

- **Gate-1 · Native tool calling live** in the gateway turn loop *(Track A)* — required before Track E's sub-agents become reliable. **Status: implemented 2026-09-05** (`nativeTools` config flag, default on; SSE tool-call streaming, provider fallback chain, text-protocol fallback preserved). Registry merge (A2) still open.
- **Gate-2 · UI router + pane shell shipped** *(Track F)* — required before the Kanban pane (D3) and Collections pane (C4) land.

**Milestones**

| Milestone | Done when |
|---|---|
| **M0 · Foundations** (≈ week 1) | Native tool-calling prototype works against one OpenAI-compatible provider; router skeleton merged; cron engine chosen; secrets encryption reused for provider keys; CI runs tests on PR |
| **M1 · Flagship loop** | S1 passes end-to-end; collections usable from chat (S2 inserts/queries); sub-agent spawn works behind Gate-1; ManagementCenter split into routed panes; hybrid FTS5 retrieval live |
| **M2 · Integration & mobile** | S3, S4 pass; Collections + Boards + Scheduler panes live; ≥2 MCP connectors configured; S6 passes on a phone |
| **M3 · Hardening & dogfood** | S5 stable; all secrets encrypted at rest; CI green (tests + lint, Go + UI); this roadmap imported as the first board (D5) |

### Track A — Core agent runtime *(P1)*
- [x] A1 [M0] Extend the provider interface with native tools: add `Tools` support to `providers/openai.go` + `providers/anthropic.go` (go-openai already supports it; Anthropic provider is hand-rolled HTTP)
- [ ] A2 [M0] Generate JSON-schema tool definitions from **one** unified registry (merge the dual registries `internal/agent/tools.go` + `internal/tools/registry.go`) — *converter shipped (`internal/agent/toolcalls.go`); merging the second registry into the live loop is still open*
- [x] A3 [M1] Dispatch native `tool_calls` in `internal/gateway/runtime.go`; keep the text protocol as fallback for providers without tool support
- [ ] A4 [M1] Move streaming into the provider layer (today: manual SSE in `internal/gateway/sse_client.go`); keep SSE fallback
- [ ] A5 [M2] Unify `gateway.Runtime` and `agent.CognitionLoop` behind one engine, or formally deprecate one
- [ ] A6 [M2] Parallel tool execution with per-tool timeout + cancel propagation

### Track B — Scheduler & autonomy *(P2)*
- [ ] B1 [M0] Pick cron engine (e.g. `robfig/cron` v3); migrate persisted jobs from `~/.kendaliai/scheduler/` JSON → SQLite table
- [ ] B2 [M1] Executor daemon started in `cmd/kendaliai/start.go`: fires jobs in Asia/Jakarta tz, retry + missed-run catch-up, journal of runs
- [ ] B3 [M1] Natural-language scheduling: tool schema makes the model emit structured cron/ISO datetimes with explicit timezone ("10 September at 10am", "every weekday 18:00", "tomorrow 9am")
- [ ] B4 [M1] Delivery adapters: results/notifications pushed to Telegram chat + WebUI via `internal/messaging/bus.go`
- [ ] B5 [M2] Replace the fake `parseScheduleTime` default branch (`internal/tools/scheduler.go:238`) with real parsing; wire all 6 schedule tools to the executor
- [ ] B6 [M2] Heartbeat runner on the `heartbeats` table + `gateways.autonomous_*` — explicit opt-in only
- [ ] B7 [M2] Scheduled digests: daily summary of boards/collections to Telegram (feeds S3)

### Track C — Collections *(P4)*
- [ ] C1 [M0] Design collection registry: `collections` metadata table + namespaced typed SQLite tables (validated columns; JSON for free-form fields)
- [ ] C2 [M1] Agent tools: `create_collection`, `add_record`, `update_record`, `delete_record`, `query_collection` (typed validation; reject free SQL on managed tables)
- [ ] C3 [M1] Value normalization: currency & magnitude (`5000000` = `5mill` = `5juta` = `Rp5.000.000`), relative dates ("this weekend", "last Monday"), Asia/Jakarta default
- [ ] C4 [M2] REST API + **Collections pane** (browse, search, inline edit, delete) — needs Gate-2
- [ ] C5 [M2] CSV import/export per collection
- [ ] C6 [M3] Quick aggregates (sum/avg/group-by) as agent tool + UI quick stats (powers S2's "how much my expense this weekend")

### Track D — Planner & Kanban *(P5)*
- [ ] D1 [M1] Persist plans/boards/tasks: extend the goal graph (`internal/goals/manager.go`) with DB-backed boards, columns, cards, acceptance criteria
- [ ] D2 [M1] Agent tools: `create_plan`, `create_board`, `add_task`, `move_task`, `update_task_status`, `report_progress`
- [ ] D3 [M2] **Kanban board pane** (route `/boards/:id`): drag-and-drop on desktop, status menus on mobile — needs Gate-2
- [ ] D4 [M2] Async progress reports: on task transitions + scheduled digests (with B7) to Telegram/WebUI
- [ ] D5 [M3] Dogfood: import this GOALS.md roadmap as the first board (S3's control surface)

### Track E — Sub-agent orchestration *(P6)*
- [ ] E1 [M0] Rehabilitate `internal/kernel/` + `internal/runtime/supervisor.go`: fix compile/runtime gaps, add unit tests
- [ ] E2 [M1] Wire supervisor into `cmd/kendaliai/start.go`; expose `spawn_subagent` tool *(behind Gate-1)*
- [ ] E3 [M1] Job registry in DB: id, parent, role, status, logs, cancel/timeout
- [ ] E4 [M2] Fan-out pattern: N parallel explorers + 1 planner merge; live per-job status on the event bus; results pushed to Telegram/WebUI (S4)
- [ ] E5 [M2] Role manifests (`coder`/`planner`/`reviewer`) selectable as personas from the Agents tab

### Track F — Workspace UI *(P7)*
- [x] F1 [M0] Adopt a router (hash-based, to keep the existing SPA fallback in `internal/server/server.go` `handleWebUI`) and define the route map
- [x] F2 [M1] Split `ManagementCenter.tsx` (2,034 lines) into per-pane components; modals become routed panes
- [x] F3 [M1] Responsive shell: desktop rail/sidebar ↔ mobile bottom nav; Tailwind breakpoint system (`sm/md/lg`) across `ui/src`
- [ ] F4 [M2] PWA: manifest, installable, safe-area insets, touch targets ≥ 44px (S6)
- [ ] F5 [M2] Boards / Collections / Scheduler panes (with D3, C4, B-UI)
- [ ] F6 [M3] Polish: dark/light parity, cached static shell, skeleton loaders on mobile

### Track G — RAG, secrets & integrations *(P3, P8)*
- [ ] G1 [M1] SQLite FTS5 index over `document_chunks`; hybrid BM25 + vector retrieval with score fusion (replaces brute-force `SearchDocumentChunks`)
- [ ] G2 [M1] Scope retrieval per session **and** per collection; `/doc:` prefix keeps working
- [ ] G3 [M1] Encrypt `providers.api_key` + Telegram tokens at rest (reuse `internal/security/encryption.go` AES-GCM)
- [ ] G4 [M2] MCP connector catalog: preconfigured servers for Google Calendar/Gmail/Workspace, Jira, Confluence, Zoom, Mattermost + OAuth token storage
- [ ] G5 [M2] CLI executor hardening: command allowlist profiles, per-run timeout, output truncation policy
- [ ] G6 [M2] Background reindexing + per-collection embedding model config
- [ ] G7 [M3] CI: PR job running `go test ./...`, `go vet`, UI build + lint; add `golangci-lint`; first frontend tests

---

## 8. Non-goals (for now)

- Multi-tenant / team deployments — single-user, personal workspace.
- 20+ messaging platforms — Telegram + WebUI are the surfaces.
- Voice mode, native App Store builds (PWA instead), RL/training infrastructure, IDE/LSP integration.
- Replacing the macOS stopgap tools (Calendar/SMTP) before MCP connectors exist — they stay as fallback.

---

## 9. Decision log

| # | Decision | Rationale |
|---|---|---|
| DEC-1 | **Own thin RAG, upgraded** (FTS5 hybrid) instead of langchaingo | We already own chunker + embedding client + SQLite storage (`internal/gateway/`, `internal/embedding/`). langchaingo is community-maintained with a 200+ issue backlog and no confirmed SQLite vector store; FTS5 keeps the single-binary property (Hermes itself uses FTS5). Revisit only if we outgrow SQLite. |
| DEC-2 | **Managed collections** over free-form agent SQL | Predictable schemas, validation, UI browsing, CSV I/O; the raw `execute_sql` path stays for non-collection work. |
| DEC-3 | **MCP-first integrations** | Reuses the working `mcp_call` client; the ecosystem already ships Google Workspace/Jira/Confluence/Zoom servers; avoids building OAuth flows per vendor from scratch. |
| DEC-4 | **PWA over native mobile** | One codebase, installable, responsive; Telegram covers notification-grade mobile use. |
| DEC-5 | **All tracks in parallel, planner as the unifying product** | Owner's call: the workspace's center of gravity is plan → execute → report; everything else feeds that loop. Only two gates serialize work (native tool calling; UI router). |
| DEC-6 | **Dogfooding rule** | This roadmap becomes the first kanban board once Track D tasks D3–D5 land — the tool manages its own development. |
| DEC-7 | **Monochrome design system** | Owner's call: no gradients, no emoji icons, no multi-color accents. One neutral token scale (CSS variables flipping on `html.dark`: app/panel/rail/raised/hoverbg/inputbg/line + hi/mid/lo text hierarchy), inverted-foreground as the only accent, red reserved for destructive actions. lucide icons only. Light and dark are first-class modes driven by the same tokens. |
