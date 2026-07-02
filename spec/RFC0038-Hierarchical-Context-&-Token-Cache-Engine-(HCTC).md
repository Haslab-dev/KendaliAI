# RFC-0038 — Hierarchical Context & Token Cache Engine (HCTC)

## Status

Proposed

## Motivation

Most token usage is wasted by repeatedly rebuilding context.

Agents repeatedly:

* search identical files
* reread unchanged code
* regenerate execution plans
* rebuild prompts
* recompile repository context

Modern coding agents instead cache multiple layers of context.

KendaliAI SHALL implement hierarchical caching to minimize repeated LLM computation.

---

# Design Principles

Never cache only model outputs.

Prefer caching

* repository knowledge
* execution plans
* working sets
* summaries
* compiled prompts

---

# Cache Hierarchy

```
Repository Cache

↓

Working Set Cache

↓

Summary Cache

↓

Plan Cache

↓

Prompt Cache

↓

Execution Trace Cache
```

---

# Repository Cache

Generated once.

Stores

```
Framework

Entrypoints

Routes

Symbols

Dependencies

Components

Package Manager
```

Invalidated only when project structure changes.

---

# Working Set Cache

Stores

```
Goal

↓

Files

↓

Hashes

↓

Last Read
```

Example

```
Goal

Create Landing Page

↓

Working Set

App.tsx

main.tsx

index.html
```

---

# File Summary Cache

Instead of sending

```
800 lines
```

store

```
Summary

Imports

Exports

Responsibilities

Symbols

Components

Public API
```

Only reopen files when hashes change.

---

# Symbol Cache

Maps

```
Button

↓

components/ui/Button.tsx
```

without search.

---

# Plan Cache

Inspired by recent research on **test-time plan caching**.

Stores

```
Goal Pattern

↓

Execution DAG

↓

Tool Sequence

↓

Expected Outputs
```

Example

```
Landing Page

↓

Analyze

↓

Read App

↓

Patch

↓

Build
```

Future requests reuse the execution strategy.

---

# Prompt Cache

Compiled prompts are hashed.

```
Goal

+

Working Set

+

Summaries

+

Memory

↓

Compiled Prompt

↓

Hash
```

Identical prompts bypass recompilation.

---

# Execution Trace Cache

Stores successful execution traces.

```
Analyze

↓

Patch

↓

Build

↓

Done
```

Future runs may reuse traces.

---

# Cache Validation

Every cache entry SHALL include

```
SHA256

mtime

workspace revision

dependency revision
```

Stale entries are discarded automatically.

---

# Cache Invalidation Rules

Invalidate Repository Cache

* package.json changes
* go.mod changes
* directory structure changes

Invalidate Working Set

* edited files
* deleted files

Invalidate Summary

* file hash changes

Invalidate Plan

* framework changes
* major dependency changes

Invalidate Prompt

* system prompt changes
* tool registry changes

---

# Context Compiler

Context SHALL be assembled in this order

```
Goal

↓

Working Set

↓

Repository Metadata

↓

File Summaries

↓

Relevant Code

↓

Conversation

↓

Memory
```

Never

```
Conversation

+

Random Files

+

Search Results
```

---

# Read Budget

Each execution SHALL have

```
Read Budget

Default

10 files
```

Exceeding the budget requires explicit planner justification.

---

# Storage

SQLite

```
repository_cache

working_sets

file_summaries

symbol_cache

plan_cache

prompt_cache

execution_cache
```

---

# Benefits

* 50–80% reduction in prompt tokens
* significantly fewer repeated file reads
* faster planning
* faster context compilation
* reusable execution strategies
* lower LLM cost
* improved responsiveness on large repositories

---
