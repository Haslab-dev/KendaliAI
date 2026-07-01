# KendaliAI Codebase Audit Report

**Generated:** 2026-07-01
**Version:** 0.3.4

---

## 1. Project Structure

### Main Directory Structure

```
kendaliai/
├── cmd/kendaliai/          # CLI entry points (Cobra commands)
├── internal/               # Core packages
│   ├── agent/             # Cognition loop & tool registry
│   ├── channels/          # Telegram integration
│   ├── config/            # Configuration management
│   ├── db/                # SQLite database
│   ├── embedding/          # Vector embedding client & store
│   ├── gateways/          # Gateway handlers & registry
│   ├── logger/            # System logging
│   ├── providers/         # OpenAI-compatible API providers
│   ├── security/          # Encryption utilities
│   ├── server/            # HTTP REST server
│   └── tui/               # BubbleTea terminal UI
├── tests/                 # Integration tests
├── docs/                  # Documentation
├── skills/                # Custom skills
├── build/                 # Build output
├── config.example.json    # Configuration template
├── go.mod / go.sum        # Go dependencies
├── Makefile               # Build automation
└── README.md              # Project documentation
```

### Root Files
- **go.mod:** Module `github.com/kendaliai/app`, Go 1.25.5
- **Makefile:** Build targets for dev, build, install, clean
- **config.example.json:** Example configuration
- **VERSION:** Version file containing "0.2.0"
- **REFACTORING_NOTES.md:** Migration notes from TypeScript to Go

---

## 2. All Features Implemented

### 2.1 Autonomous AI Agent (Cognition Loop)

**File:** `internal/agent/cognition.go`

- Recursive LLM-powered tool execution (up to 25 iterations by default)
- Dynamic tool parsing from LLM output format: `tool: TOOL_NAME({...})`
- Context optimization with sliding window (max 20,000 runes)
- Memory auto-retrieval and storage via embeddings
- Per-persona configuration loading

### 2.2 Tool Registry (17 Native Tools)

**File:** `internal/agent/tools.go:54-742`

| Tool | Description | Category |
|------|-------------|----------|
| `read_file` | Chunked file reading with offset/limit | Explore |
| `list_files` | Directory listing | Explore |
| `search_files` | Grep-based file search | Explore |
| `apply_patch` | String-based patch replacement | Editing |
| `replace_range` | Line-range replacement | Editing |
| `exec` | Shell command execution | Execution |
| `git_status` | Git porcelain status | Git |
| `git_diff` | Git diff output | Git |
| `git_apply_patch` | Apply raw git patch | Git |
| `run_tests` | Go/NPM test execution | Validation |
| `validate_syntax` | Compile-time syntax check | Validation |
| `fetch_url` | HTTP GET requests | Network |
| `store_memory` | Vector-backed memory storage | Memory |
| `search_memory` | Semantic memory search | Memory |
| `run_skill` | Custom shell script execution | Skill |
| `mcp_call` | MCP (Model Context Protocol) server calls | MCP |

### 2.3 Telegram Gateway

**File:** `internal/channels/telegram.go`

- Polling-based Telegram bot integration
- Per-channel configuration with bot tokens
- Async message processing with "Thinking..." feedback
- Message editing for responses

### 2.4 Terminal UI (BubbleTea)

**File:** `internal/tui/app.go`

- Interactive CLI dashboard
- Real-time tool execution display
- Token usage statistics
- Thought process visualization

### 2.5 HTTP REST API Server

**File:** `internal/server/server.go`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (line 66) |
| `/status` | GET | System status (line 76) |
| `/api/gateways` | GET | List gateways (line 96) |
| `/v1/chat/completions` | POST | OpenAI-compatible chat API (line 114) |

### 2.6 Memory & Embeddings System

**Files:** `internal/embedding/client.go`, `internal/embedding/store.go`

- OpenAI-compatible embedding API
- Cosine similarity search
- SQLite-backed vector storage with cache
- Configurable embedding model (default: `text-embedding-3-small`)

### 2.7 Custom Skills System

- Instructional skills (.md files with YAML frontmatter)
- Execution skills (.sh + skills.json)
- Dynamic skill loading at runtime
- Located in `~/.kendaliai/skills/`

### 2.8 MCP (Model Context Protocol) Integration

**File:** `internal/agent/tools.go:498-615`

- Stdio-based MCP client (lines 586-613)
- Streamable HTTP client (lines 553-585)
- Dynamic server configuration via config.json

### 2.9 Security Features

**Files:** `internal/security/encryption.go`, `internal/agent/security.go`

- AES-GCM encryption for API keys
- Machine-specific key derivation
- SHA256 token hashing
- Path sandboxing (`internal/agent/security.go:11-41`)
- Command exclusion via `Persona.md`

---

## 3. Implementation Details

### 3.1 CLI Commands Structure

All commands in `cmd/kendaliai/`:

| Command | File | Description |
|---------|------|-------------|
| `root` | `root.go:14-35` | Root cobra command with persistent pre-run |
| `gateway` | `gateway.go:21-152` | Start headless gateway server |
| `gateway run` | `gateway.go:27-68` | Start gateway in background |
| `gateway stop` | `gateway.go:71-98` | Stop background gateway |
| `tui` | `tui.go:12-28` | Launch BubbleTea dashboard |
| `onboard` | `onboard.go:12-25` | Quick setup from config.json |
| `setup` | `setup.go:14-94` | Interactive configuration wizard |
| `status` | `status.go:12-96` | Show system status |
| `logs` | `logs.go:12-33` | Stream system logs |
| `config set default` | `config_set.go:16-57` | Set default provider |
| `config add provider` | `config_add.go:16-47` | Add chat provider |
| `config add channel` | `config_add.go:49-85` | Add channel |
| `test-embed` | `test_embed.go:14-100` | Test embedding pipeline |

### 3.2 Key Functions

#### Cognition Loop (`internal/agent/cognition.go`)

| Function | Line | Description |
|----------|------|-------------|
| `NewCognitionLoop()` | 43 | Create loop without DB |
| `NewCognitionLoopWithDB()` | 51 | Create loop with DB for memory |
| `Run()` | 200 | Main execution loop |
| `loadPersonaConfig()` | 381 | Load identity and restrictions |
| `retrieveMemories()` | 412 | Semantic memory retrieval |
| `autoStore()` | 441 | Automatic memory storage |

#### Execution Engine (`internal/agent/engine.go`)

| Function | Line | Description |
|----------|------|-------------|
| `ExecuteParallel()` | 38 | Worker pool for concurrent tool execution |
| Default workers | 318 | 5 concurrent workers |

#### Tool Registry (`internal/agent/tools.go`)

| Function | Line | Description |
|----------|------|-------------|
| `GetToolRegistry()` | 55 | Builds complete tool map |
| `ValidateSandboxedPath()` | security.go:11 | Security validation |

#### Parser (`internal/agent/planner.go`)

| Function | Line | Description |
|----------|------|-------------|
| `ParseActionPlan()` | 11 | Regex parsing of `tool: name({...})` format |

#### Context Optimization (`internal/agent/context.go`)

| Function | Line | Description |
|----------|------|-------------|
| `OptimizeContext()` | 6 | Sliding window context management |

### 3.3 Design Patterns

| Pattern | Location | Usage |
|---------|----------|-------|
| Singleton | `internal/config/config.go:49` | Global config instance |
| Provider | `internal/providers/openai.go` | Pluggable AI providers |
| Registry | `internal/agent/tools.go:56` | Dynamic tool registration |
| Worker Pool | `internal/agent/engine.go:25` | Parallel tool execution |
| Template Method | Tool execution | Via `Execute()` function field |

---

## 4. Configuration

### Configuration Resolution Order

**File:** `internal/config/config.go:84-99`

1. `KENDALIAI_CONFIG` environment variable
2. `./config.json` (development)
3. `~/.kendaliai/config.json` (production)

### Config Structure

**File:** `internal/config/config.go:30-47`

```go
type Config struct {
    Database struct { Path string }
    DefaultProvider string
    ChatProviders []ProviderConfig
    Embedding EmbeddingConfig
    Channels []ChannelConfig
    MCPServers map[string]MCPServerConfig
}
```

### ProviderConfig

**File:** `internal/config/config.go:10-15`

```go
type ProviderConfig struct {
    Type     string  // "deepseek", "openai", etc.
    APIKey   string
    Endpoint string  // e.g., "https://api.deepseek.com/v1"
    Model    string  // e.g., "deepseek-v4-flash"
}
```

### ChannelConfig

**File:** `internal/config/config.go:23-28`

```go
type ChannelConfig struct {
    ID          string  // "telegram-main"
    ChannelName string  // "My Bot"
    ChannelType string  // "telegram"
    Token       string  // Bot token
}
```

### MCPServerConfig

**File:** `internal/config/config.go:41-47`

```go
type MCPServerConfig struct {
    Command   string
    Args      []string
    ServerURL string  // For SSE
    Headers   map[string]string
    Disabled  bool
}
```

---

## 5. Database Schema

**File:** `internal/db/schema.go:3-193`

### Tables

| Table | Line | Purpose |
|-------|------|---------|
| `gateways` | 4 | Gateway instances |
| `pairings` | 35 | Device/user pairings |
| `channels` | 48 | Communication channels |
| `memories` | 63 | Vector-backed memories |
| `messages` | 78 | Chat messages |
| `tools` | 92 | Tool registry |
| `skills` | 105 | Installed skills |
| `hooks` | 118 | Event hooks |
| `tunnels` | 128 | Tunnel connections |
| `heartbeats` | 138 | Scheduled tasks |
| `event_logs` | 153 | System event log |
| `system_config` | 164 | Key-value config |
| `embedding_cache` | 170 | Embedding cache |
| `identity` | 181 | Agent identity |

### Database Initialization

**File:** `internal/db/db.go`

| Function | Line | Description |
|----------|------|-------------|
| `Initialize()` | 12 | Opens SQLite with WAL mode |

Default path: `~/.kendaliai/kendaliai.db`

---

## 6. External Integrations

### 6.1 AI Providers (OpenAI-Compatible)

**File:** `internal/providers/openai.go`

- Library: `github.com/sashabaranov/go-openai` (v1.23.0)
- Supports any OpenAI-compatible endpoint
- Configured providers: DeepSeek, OpenAI, Groq, Ollama, LM Studio

### 6.2 Embedding Provider

**File:** `internal/embedding/client.go`

- OpenAI-compatible embedding API
- Cosine similarity calculation
- SQLite cache

### 6.3 Telegram Bot

**File:** `internal/channels/telegram.go`

- Library: `github.com/go-telegram-bot-api/telegram-bot-api/v5` (v5.5.1)
- Long polling with 60-second timeout

### 6.4 MCP (Model Context Protocol)

**File:** `internal/agent/tools.go:498-615`

- Library: `github.com/mark3labs/mcp-go` (v0.49.0)
- Stdio and Streamable HTTP transports

### 6.5 TUI Framework

**File:** `internal/tui/app.go`

- Library: `github.com/charmbracelet/bubbletea` (v1.3.10)
- Styling: `github.com/charmbracelet/lipgloss` (v1.1.0)

### 6.6 Database

- Driver: `github.com/mattn/go-sqlite3` (v1.14.22)
- WAL journal mode for concurrent access

### 6.7 Environment Variables

| Variable | Purpose |
|----------|---------|
| `KENDALIAI_CONFIG` | Config file path override |
| `KENDALIAI_KEY` | Encryption key for API key storage |

---

## 7. Security Implementation

### API Key Encryption

**File:** `internal/security/encryption.go`

- **Algorithm:** AES-256-GCM
- **Key Derivation:** SHA256 of machine-specific ID or env var
- **Format:** `base64(nonce):base64(authTag):base64(ciphertext)`

### Path Sandboxing

**File:** `internal/agent/security.go:11-41`

- Validates all file paths against workspace root
- Blocks access to `.env` and `.git/` paths
- Prevents path traversal attacks

### Command Restrictions

- Configured via `~/.kendaliai/Persona.md`
- `exclude_cmd:` field blocks dangerous commands

---

## 8. Key File Locations

| Component | File Path |
|-----------|-----------|
| CLI Root | `cmd/kendaliai/root.go` |
| Gateway Command | `cmd/kendaliai/gateway.go` |
| TUI Command | `cmd/kendaliai/tui.go` |
| Config Management | `internal/config/config.go` |
| Cognition Loop | `internal/agent/cognition.go` |
| Tool Registry | `internal/agent/tools.go` |
| Execution Engine | `internal/agent/engine.go` |
| Telegram Integration | `internal/channels/telegram.go` |
| REST Server | `internal/server/server.go` |
| Database | `internal/db/db.go`, `internal/db/schema.go` |
| Embedding | `internal/embedding/client.go`, `internal/embedding/store.go` |
| Encryption | `internal/security/encryption.go` |
| System Logging | `internal/logger/syslog.go` |
| TUI App | `internal/tui/app.go` |
| Provider | `internal/providers/openai.go` |

---

## 9. Build & Development

### Build Targets (from `Makefile`)

| Target | Description |
|--------|-------------|
| `make dev` | Run via `go run` |
| `make dev-tui` | Run TUI |
| `make dev-gateway` | Run gateway |
| `make dev-onboard` | Run onboard |
| `make dev-logs` | Run log streamer |
| `make build` | Build debug binary |
| `make build-prod` | Build optimized binary |
| `make install` | Install to `/usr/local/bin/` |

### Requirements

- Go 1.24+
- CGO (required for sqlite3)
- Git

---

## 10. Usage Examples

### Start Gateway

```bash
./kendaliai gateway start
```

### Start TUI

```bash
./kendaliai tui
```

### Quick Setup

```bash
./kendaliai onboard
```

### Interactive Setup

```bash
./kendaliai setup
```

### Check Status

```bash
./kendaliai status
```

### Stream Logs

```bash
./kendaliai logs
```

### Configure Provider

```bash
./kendaliai config add provider
./kendaliai config set default deepseek
```

### Configure Channel

```bash
./kendaliai config add channel
```

### Test Embeddings

```bash
./kendaliai test-embed
```
