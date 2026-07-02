# RFC-0040 — Workspace Intelligence Engine (WIE)

**Status:** Proposed
**Version:** 1.0
**Owner:** KendaliAI Core
**Updated:** July 2026

---

## Motivation

Most token waste in coding agents comes from **repeated discovery**, not repeated model calls.

Agents call `search_files` and `read_file` dozens of times per request because they have no persistent understanding of the repository structure. Every request starts from zero.

Modern coding assistants (Cursor, Claude Code, Gemini CLI, Aider, Codex) instead **index once and reuse always**. They maintain a live workspace intelligence graph that eliminates exploratory tool calls entirely.

KendaliAI SHALL build a persistent Workspace Intelligence Engine that continuously maintains complete repository understanding and serves it to every agent request without re-scanning.

---

## Design Principles

1. **Index once, query always.** The workspace is scanned on open and incrementally updated thereafter. Agents never re-scan.
2. **Graph navigation replaces search.** Agents resolve symbols, imports, and components via direct graph traversal instead of `search_files`.
3. **Intent-aware context.** Different coding intents (UI creation, bug fix, refactor, analysis) receive different context recipes.
4. **Persistent across sessions.** The workspace graph persists to disk. Restarting the agent does not trigger re-indexing.
5. **Incremental updates only.** File watchers detect changes and update only modified subgraphs.

---

## Architecture

```
                    Agent Request
                         │
                  Intent Classifier
                         │
               Context Recipe Resolver
                         │
              ┌──────────┼──────────┐
              │          │          │
       ProjectGraph  ImportGraph  SymbolGraph
              │          │          │
              └──────────┼──────────┘
                         │
                ComponentGraph
                         │
                  RouteGraph
                         │
                 DependencyGraph
                         │
                Context Assembler
                         │
                      LLM
```

---

## Core Graphs

### ProjectGraph

The entry point. Knows the project type, entrypoints, and file inventory.

```
ProjectGraph
  Framework: React + Vite
  Language: TypeScript
  CSS: Tailwind v4
  Entrypoints: [index.html, src/main.tsx, src/App.tsx]
  Total files: 142
  Last indexed: 2026-07-02T11:00:00Z
```

### ImportGraph

Maps every import relationship between files.

```
App.tsx → Header.tsx
App.tsx → Dashboard.tsx
App.tsx → Router.tsx
Header.tsx → Logo.tsx
Header.tsx → Nav.tsx
Dashboard.tsx → Widget.tsx
Router.tsx → Login.tsx
Router.tsx → Landing.tsx
```

Agent asks "where is Landing?" → ImportGraph answers immediately.

### SymbolGraph

Maps every exported symbol to its file and line.

```
Landing → src/pages/Landing.tsx:5
Hero → src/components/Hero.tsx:3
Button → src/components/ui/Button.tsx:12
useAuth → src/hooks/useAuth.ts:8
```

No `resolve_symbol` tool call needed — the graph is pre-loaded into context.

### ComponentGraph

Hierarchy of React/Vue/Svelte components based on import relationships.

```
App
  ├── Header
  │     ├── Logo
  │     └── Nav
  ├── Dashboard
  │     └── Widget
  └── Router
        ├── Login
        └── Landing
              ├── Hero
              ├── Features
              ├── Pricing
              └── Footer
```

Agent asks "create landing page" → ComponentGraph shows Landing already exists at `src/pages/Landing.tsx` with Hero, Features, Pricing, Footer children.

### RouteGraph

Maps URL paths to components for frameworks with routing.

```
/ → App
  / → Dashboard
  /login → Login
  /landing → Landing
  /pricing → PricingPage
```

### DependencyGraph

Package-level dependencies. Maps what external packages each file uses.

```
Landing.tsx → [react, tailwindcss, @tanstack/react-query]
useAuth.ts → [react, @supabase/supabase-js]
```

---

## Incremental Indexing

The engine does NOT re-scan on every request. It watches the filesystem.

```
File Changed
     │
     ▼
Hash Changed?
     │
  ┌──┴──┐
  │     │
  No   Yes
  │     │
  ▼     ▼
 Stop  Parse file
       │
       ▼
  Update ImportGraph
       │
       ▼
  Update SymbolGraph
       │
       ▼
  Update ComponentGraph
       │
       ▼
  Update Bleve index
       │
       ▼
  Done
```

Only the modified subgraph is updated. A change to `Footer.tsx` does not re-index `Header.tsx`.

---

## Context Recipes

The engine selects context based on intent, not a generic dump.

| Intent | Files | Include Code | Include Imports | Include Summaries |
|---|---|---|---|---|
| ui_generation | 6 max | Yes | Yes | No |
| code_edit | 4 max | Yes | Yes | No |
| analysis | 20 max | No | No | Yes |
| deployment | 8 max | No | No | Yes |
| bug_fix | 4 max | Yes | Yes | No |
| refactor | 8 max | Yes | Yes | No |
| general | 5 max | Yes | No | No |

Example:

User: "Create landing page"
Intent: ui_generation

Recipe selects:
1. package.json
2. App.tsx (entrypoint, imports Header/Dashboard/Router)
3. Landing.tsx (if exists — edit; if not — create)
4. Header.tsx (imported by App, needed for context)
5. Footer.tsx (imported by Landing, needed for context)

Total: 5 files. No searching required.

---

## Storage

All graphs persist in SQLite via the Unified Data Layer (RFC-0039).

```
workspace_meta     — ProjectGraph metadata
symbols            — SymbolGraph
imports            — ImportGraph
file_index         — file hashes for incremental updates
```

The graphs are materialized in-memory from these tables on startup and kept in sync via event-driven updates.

---

## Integration with Data Layer (RFC-0039)

```
DataLayer
  ├── Sessions (SQLite)
  ├── Goals (SQLite)
  ├── Memory (SQLite + VectorStore)
  ├── Search (Bleve)
  ├── Context (Builder + Recipes)
  └── Index (File indexer + ProjectGraph)
```

The WIE lives within the `Index` and `Context` services. It does not introduce new storage — it materializes from the `symbols` and `imports` tables already maintained by the data layer.

---

## Expected Benefits

- **80-95% reduction in search_files calls** — agents navigate by graph, not grep
- **70-90% reduction in read_file calls** — context is pre-selected by recipe
- **Deterministic file targeting** — no wandering or redundant exploration
- **Faster cold starts** — workspace graph loads from SQLite, no re-indexing
- **Lower token usage** — context is intent-appropriate, not a file dump
- **IDE-quality coding behavior** — same patterns as Cursor, Claude Code, Gemini CLI

---

## Implementation Order

1. ProjectGraph + ImportGraph + SymbolGraph materialized from existing `symbols`/`imports` tables
2. Context recipes with intent-aware file selection
3. ComponentGraph from import hierarchy analysis
4. Incremental file watcher (hash-based change detection)
5. RouteGraph from framework-specific route parsing
6. DependencyGraph from package.json/go.mod parsing
