# KendaliAI — Autonomous AI Coding Agent (Go Edition)

## Slide 1: Overview
KendaliAI is a self-hosted, autonomous AI coding agent & orchestration gateway rebuilt natively in Go. Inspired by actor systems & microkernel architectures.

## Slide 2: Architecture
Uses 3-phase cognition loop: Planner → Executor → Validator. Recursive LLM calls with dynamic tool invocation, resource locking, and process supervision.

## Slide 3: Core Features
- Dynamic tool routing via YAML config
- Multi-provider LLM support (OpenAI, DeepSeek)
- Embedding-based long-term memory (SQLite + vector search)
- Channel adapters: Telegram, Console

## Slide 4: Tools Available
- **apply_patch** — precise file edits / create new files
- **replace_range** — replace line ranges
- **search_files** — grep-based code search
- **exec** — safe shell commands
- **fetch_url** / **ping_site** — network operations
- **store_memory** / **search_memory** — semantic memory

## Slide 5: CLI Commands
```
go run ./cmd/kendaliai config init       # generate config
  go run ./cmd/kendaliai config validate   # validate YAML
  go run ./cmd/kendaliai doctor            # system diagnostics
  go run ./cmd/kendaliai run               # start daemon
```

## Slide 6: Tech Stack
- **Language:** Go 1.20+
- **Database:** SQLite3 (go-sqlite3 via CGO)
- **Memory:** OpenAI text-embedding-3-small
- **Config:** YAML with env var injection
- **Runtime:** Microkernel + actor model