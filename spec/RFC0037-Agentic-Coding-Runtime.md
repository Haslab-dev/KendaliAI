# RFC-0037 — Agentic Coding Runtime (ACR)

## Status

Proposed

## Motivation

Current coding agents operate as generic LLM tool users:

```
User
 ↓
LLM
 ↓
Search
 ↓
Read
 ↓
Search
 ↓
Read
 ↓
Patch
```

This produces several problems:

* repeated file searches
* repeated file reads
* excessive token consumption
* poor edit targeting
* slow planning
* inconsistent edits
* inability to reason about repository structure

Real coding assistants (Cursor, Claude Code, Gemini CLI, Codex, Aider) instead build an internal understanding of the repository before reasoning.

KendaliAI SHALL adopt a deterministic coding runtime where repository intelligence precedes LLM reasoning.

---

# Goals

The runtime SHALL

* understand repositories
* minimize unnecessary file reads
* minimize LLM tokens
* edit only required files
* reuse repository knowledge
* perform deterministic planning

---

# High Level Architecture

```
                User Goal
                    │
                    ▼
            Intent Classifier
                    │
                    ▼
          Repository Analyzer
                    │
                    ▼
           Project Detector
                    │
                    ▼
          Working Set Builder
                    │
                    ▼
            Execution Planner
                    │
                    ▼
               Edit Planner
                    │
                    ▼
             Capability Runtime
                    │
                    ▼
            Verification Engine
```

---

# Repository Analyzer

Executed once per workspace.

Produces

* framework
* package manager
* language
* entrypoints
* routes
* components
* imports
* symbols
* dependency graph

Output

```
RepositoryMetadata

Framework:
React + Vite

Entrypoints:
index.html
main.tsx
App.tsx

PackageManager:
pnpm

Languages:
TypeScript
```

---

# Project Detector

Automatically identifies project types.

Supported

* React
* Next.js
* Vue
* Angular
* Go
* Bun
* Hono
* NestJS
* Python
* Django
* FastAPI
* Flutter
* SwiftUI
* Rust

Each detector defines

```
Entrypoints

Critical files

Framework conventions

Build command

Test command
```

---

# Working Set Builder

For every request the runtime SHALL compute

```
Working Set
```

instead of searching repeatedly.

Example

User

```
Create landing page
```

Working Set

```
package.json

vite.config.ts

src/main.tsx

src/App.tsx

index.html
```

No additional searching is allowed unless required.

---

# Repository Graph

The runtime SHALL maintain

```
File Graph

Import Graph

Symbol Graph

Component Graph
```

allowing direct navigation.

Example

```
Navbar

↓

Navbar.tsx

↓

Logo.tsx
```

No search required.

---

# Edit Planner

The LLM SHALL generate

```
Edit Operations
```

instead of rewritten files.

Example

```
Replace Hero

Insert Pricing

Delete Old CTA

Rename Button
```

Executor converts operations into patches.

---

# Verification Phase

Every execution SHALL finish with

```
Build

↓

Lint

↓

Tests

↓

Review

↓

Complete
```

Verification failures generate new goals instead of immediate retries.

---

# Coding State Machine

```
IDLE

↓

ANALYZE_PROJECT

↓

BUILD_WORKING_SET

↓

PLAN

↓

READ_TARGET_FILES

↓

GENERATE_PATCH

↓

APPLY_PATCH

↓

VERIFY

↓

DONE
```

Each state owns explicit responsibilities.

---

# Required New Components

```
internal/repository/
    analyzer.go

internal/runtime/
    working_set.go

internal/runtime/
    edit_planner.go

internal/runtime/
    repository_graph.go

internal/runtime/
    verification.go
```

---

# Benefits

* 70–90% fewer file reads
* deterministic repository navigation
* accurate edits
* smaller prompts
* lower latency
* reduced token cost
* IDE-quality coding behavior
