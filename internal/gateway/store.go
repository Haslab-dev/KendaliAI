package gateway

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/config"
)

type EmbeddingConfig struct {
	Endpoint   string `json:"endpoint"`
	APIKey     string `json:"apiKey"`
	Model      string `json:"model"`
	Dimensions int    `json:"dimensions"`
	Enabled    bool   `json:"enabled"`
	UpdatedAt  int64  `json:"updatedAt"`
}

type Document struct {
	ID         string `json:"id"`
	SessionID  string `json:"sessionId"`
	Title      string `json:"title"`
	Source     string `json:"source"`
	Content    string `json:"content"`
	CharCount  int    `json:"charCount"`
	ChunkCount int    `json:"chunkCount"`
	CreatedAt  int64  `json:"createdAt"`
}

type DocumentChunk struct {
	ID         string `json:"id"`
	DocumentID string `json:"documentId"`
	SessionID  string `json:"sessionId"`
	ChunkIndex int    `json:"chunkIndex"`
	Content    string `json:"content"`
	Embedding  string `json:"embedding"`
	CreatedAt  int64  `json:"createdAt"`
}

type ChunkSearchResult struct {
	ID         string  `json:"id"`
	DocumentID string  `json:"documentId"`
	DocTitle   string  `json:"docTitle"`
	Content    string  `json:"content"`
	Score      float64 `json:"score"`
}

type ModelItem struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type ProviderConfig struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Type      string      `json:"type"` // deepseek, openai, anthropic, ollama, gemini, custom
	APIKey    string      `json:"apiKey"`
	Endpoint  string      `json:"endpoint"`
	Models    []ModelItem `json:"models"`
	IsDefault bool        `json:"isDefault"`
	Enabled   bool        `json:"enabled"`
	CreatedAt int64       `json:"createdAt"`
	UpdatedAt int64       `json:"updatedAt"`
}

type AgentConfig struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Description  string            `json:"description"`
	ProviderID   string            `json:"providerId"`
	Model        string            `json:"model"`
	SystemPrompt string            `json:"systemPrompt"`
	Skills       []string          `json:"skills"`
	Tools        []string          `json:"tools"`
	MCP          []string          `json:"mcp"`
	MemoryScopes []string          `json:"memoryScopes"`
	Policy       map[string]string `json:"policy"`
	Avatar       string            `json:"avatar"`
	IsDefault    bool              `json:"isDefault"`
	CreatedAt    int64             `json:"createdAt"`
	UpdatedAt    int64             `json:"updatedAt"`
}

type Session struct {
	ID        string `json:"id"`
	AgentID   string `json:"agentId"`
	Title     string `json:"title"`
	ChannelID string `json:"channelId"`
	UserID    string `json:"userId"`
	Status    string `json:"status"`
	Pinned    bool   `json:"pinned"`
	Metadata  string `json:"metadata,omitempty"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type ToolCallRecord struct {
	ID         string                 `json:"id"`
	Tool       string                 `json:"tool"`
	Arguments  map[string]interface{} `json:"arguments"`
	Output     string                 `json:"output,omitempty"`
	Status     string                 `json:"status,omitempty"`
	DurationMs int64                  `json:"durationMs,omitempty"`
}

type SessionMessage struct {
	ID         string           `json:"id"`
	SessionID  string           `json:"sessionId"`
	AgentID    string           `json:"agentId,omitempty"`
	Channel    string           `json:"channel"`
	Role       string           `json:"role"` // user, assistant, system, tool
	Content    string           `json:"content"`
	Thought    string           `json:"thought,omitempty"`
	ToolCalls  []ToolCallRecord `json:"toolCalls,omitempty"`
	ToolCallID string           `json:"toolCallId,omitempty"`
	Tokens     int              `json:"tokens"`
	Model      string           `json:"model,omitempty"`
	CreatedAt  int64            `json:"createdAt"`
}

type ToolCachedInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Schema      string `json:"schema,omitempty"`
}

type MCPServerConfig struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Transport   string            `json:"transport"` // stdio, sse
	Command     string            `json:"command"`
	Args        []string          `json:"args"`
	URL         string            `json:"url"`
	Env         map[string]string `json:"env"`
	Enabled     bool              `json:"enabled"`
	Status      string            `json:"status"`
	ToolsCached []ToolCachedInfo  `json:"toolsCached,omitempty"`
	CreatedAt   int64             `json:"createdAt"`
	UpdatedAt   int64             `json:"updatedAt"`
}

type PolicyRule struct {
	ID        string `json:"id"`
	AgentID   string `json:"agentId"`
	ToolName  string `json:"toolName"`
	Effect    string `json:"effect"` // ALLOW, APPROVAL, DENY
	CreatedAt int64  `json:"createdAt"`
}

type TelegramBotConfig struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Token        string `json:"token"`
	AgentID      string `json:"agentId"`
	Model        string `json:"model,omitempty"`
	ProviderID   string `json:"providerId,omitempty"`
	Enabled      bool   `json:"enabled"`
	Status       string `json:"status"` // running, stopped, error
	LastActiveAt int64  `json:"lastActiveAt"`
	CreatedAt    int64  `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) SeedInitialData(cfg *config.Config) {
	// Run table schema column migrations for backwards compatibility
	_, _ = s.db.Exec("ALTER TABLE telegram_bots ADD COLUMN model TEXT DEFAULT ''")
	_, _ = s.db.Exec("ALTER TABLE telegram_bots ADD COLUMN provider_id TEXT DEFAULT ''")
	_, _ = s.db.Exec("ALTER TABLE session_messages ADD COLUMN thought TEXT DEFAULT ''")
	_, _ = s.db.Exec("ALTER TABLE document_chunks ADD COLUMN embedding_model TEXT DEFAULT ''")
	_, _ = s.db.Exec("ALTER TABLE document_chunks ADD COLUMN dimensions INTEGER DEFAULT 0")

	_, _ = s.db.Exec(`CREATE TABLE IF NOT EXISTS documents (
		id TEXT PRIMARY KEY,
		session_id TEXT,
		title TEXT NOT NULL,
		source TEXT,
		content TEXT,
		char_count INTEGER DEFAULT 0,
		chunk_count INTEGER DEFAULT 0,
		created_at INTEGER
	)`)
	_, _ = s.db.Exec(`CREATE TABLE IF NOT EXISTS document_chunks (
		id TEXT PRIMARY KEY,
		document_id TEXT NOT NULL,
		session_id TEXT,
		chunk_index INTEGER DEFAULT 0,
		content TEXT NOT NULL,
		embedding TEXT NOT NULL,
		created_at INTEGER
	)`)
	_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_doc_chunks_session ON document_chunks(session_id)`)
	_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc ON document_chunks(document_id)`)

	// 1. Providers
	providers, err := s.ListProviders()
	if err == nil && len(providers) == 0 {
		now := time.Now().Unix()
		openaiKey := ""
		if cfg != nil {
			for _, cp := range cfg.ChatProviders {
				if (cp.Type == "openai" || cp.Type == "custom") && openaiKey == "" {
					openaiKey = cp.APIKey
				}
			}
		}

		_ = s.SaveProvider(ProviderConfig{
			ID:        "openai",
			Name:      "OpenAI Compatible",
			Type:      "custom",
			APIKey:    openaiKey,
			Endpoint:  "https://api.openai.com/v1",
			Models:    ToModelItems([]string{"gpt-4o", "gpt-4o-mini"}),
			IsDefault: true,
			Enabled:   true,
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	// 2. Agents (Bootstrap Agents: Personal Assistant, Research Agent, Knowledge Agent, Coding Agent)
	// Clean up legacy mock/dummy agents and remove hardcoded deepseek references
	_, _ = s.db.Exec("DELETE FROM agents WHERE id IN ('finance', 'data-science', 'general', 'engineer')")
	_, _ = s.db.Exec("UPDATE agents SET provider_id = '', model = '' WHERE provider_id = 'deepseek' OR model LIKE 'deepseek%'")

	now := time.Now().Unix()
	bootstrapAgents := []AgentConfig{
		{
			ID:           "personal-assistant",
			Name:         "Personal Assistant",
			Description:  "Proactive daily coordinator, task manager, scheduling, and personal executive assistance.",
			ProviderID:   "",
			Model:        "",
			SystemPrompt: "You are Personal Assistant, a proactive executive coordinator. You organize schedules, manage tasks, coordinate with other specialized agents, and keep workflows structured and on track.",
			Skills:       []string{"planning", "coordination", "task-management"},
			Tools:        []string{"*"},
			MCP:          []string{},
			MemoryScopes: []string{"user", "agent", "session", "workspace"},
			Policy:       map[string]string{},
			Avatar:       "🎩",
			IsDefault:    true,
			CreatedAt:    now,
			UpdatedAt:    now,
		},
		{
			ID:           "research-agent",
			Name:         "Research Agent",
			Description:  "In-depth research, web investigation, source synthesis, literature review, and factual verification.",
			ProviderID:   "",
			Model:        "",
			SystemPrompt: "You are Research Agent, an expert investigator and analyst. You gather facts, evaluate sources, synthesize complex multi-domain information, and provide clear, cited conclusions.",
			Skills:       []string{"deep-research", "synthesis", "fact-checking"},
			Tools:        []string{"http.*", "search", "filesystem.read"},
			MCP:          []string{},
			MemoryScopes: []string{"user", "session"},
			Policy:       map[string]string{},
			Avatar:       "🔍",
			IsDefault:    false,
			CreatedAt:    now,
			UpdatedAt:    now,
		},
		{
			ID:           "knowledge-agent",
			Name:         "Knowledge Agent",
			Description:  "Second brain, personal documentation, memory recall, concept mapping, and knowledge retrieval.",
			ProviderID:   "",
			Model:        "",
			SystemPrompt: "You are Knowledge Agent, curator of personal intelligence and second-brain memory. You store, categorize, connect concepts, retrieve documentation, and distill actionable insights.",
			Skills:       []string{"knowledge-graph", "memory-retrieval", "note-taking"},
			Tools:        []string{"filesystem.*", "search"},
			MCP:          []string{},
			MemoryScopes: []string{"user", "agent", "session"},
			Policy:       map[string]string{},
			Avatar:       "📚",
			IsDefault:    false,
			CreatedAt:    now,
			UpdatedAt:    now,
		},
		{
			ID:           "coding-agent",
			Name:         "Coding Agent",
			Description:  "Senior software engineer for architectural planning, code authoring, debugging, refactoring, and test writing.",
			ProviderID:   "",
			Model:        "",
			SystemPrompt: "You are Coding Agent, a world-class senior software engineer and architect. You write clean, idiomatic, robust code, inspect systems thoroughly, diagnose bugs, and execute commands safely.",
			Skills:       []string{"coding", "debugging", "code-review"},
			Tools:        []string{"filesystem.*", "shell.*", "git.*", "search"},
			MCP:          []string{"github"},
			MemoryScopes: []string{"user", "agent", "session", "workspace"},
			Policy: map[string]string{
				"shell.exec":       "approval",
				"filesystem.write": "allow",
			},
			Avatar:    "💻",
			IsDefault: false,
			CreatedAt: now,
			UpdatedAt: now,
		},
	}

	for _, a := range bootstrapAgents {
		existing, _ := s.GetAgent(a.ID)
		if existing == nil {
			_ = s.SaveAgent(a)
		} else if existing.ProviderID == "deepseek" || strings.HasPrefix(existing.Model, "deepseek") {
			existing.ProviderID = ""
			existing.Model = ""
			_ = s.SaveAgent(*existing)
		}
	}

	// 3. MCP Servers seed
	mcps, err := s.ListMCPServers()
	if err == nil && len(mcps) == 0 {
		now := time.Now().Unix()
		_ = s.SaveMCPServer(MCPServerConfig{
			ID:        "github",
			Name:      "github",
			Transport: "stdio",
			Command:   "npx",
			Args:      []string{"-y", "@modelcontextprotocol/server-github"},
			URL:       "",
			Env:       map[string]string{"GITHUB_PERSONAL_ACCESS_TOKEN": ""},
			Enabled:   false,
			Status:    "configured",
			CreatedAt: now,
			UpdatedAt: now,
		})

		_ = s.SaveMCPServer(MCPServerConfig{
			ID:        "postgres",
			Name:      "postgres",
			Transport: "stdio",
			Command:   "npx",
			Args:      []string{"-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/kendaliai"},
			URL:       "",
			Env:       map[string]string{},
			Enabled:   false,
			Status:    "configured",
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	// 4. Default Telegram Bot (from config if provided or pre-configured testing bot)
	existingTestingBot, _ := s.GetTelegramBot("haslabai_bots")
	if existingTestingBot == nil {
		_ = s.SaveTelegramBot(TelegramBotConfig{
			ID:        "haslabai_bots",
			Name:      "haslabai_bots",
			Token:     "YOUR_TELEGRAM_BOT_TOKEN_HERE",
			AgentID:   "personal-assistant",
			Enabled:   true,
			Status:    "running",
			CreatedAt: time.Now().Unix(),
		})
	}

	if cfg != nil {
		for _, ch := range cfg.Channels {
			if ch.ChannelType == "telegram" && ch.Token != "" {
				existing, _ := s.GetTelegramBot(ch.ID)
				if existing == nil {
					_ = s.SaveTelegramBot(TelegramBotConfig{
						ID:        ch.ID,
						Name:      ch.ChannelName,
						Token:     ch.Token,
						AgentID:   "engineer",
						Enabled:   true,
						Status:    "stopped",
						CreatedAt: time.Now().Unix(),
					})
				}
			}
		}
	}
}

// --- Providers CRUD ---

func ToModelItems(models []string) []ModelItem {
	res := make([]ModelItem, len(models))
	for i, m := range models {
		res[i] = ModelItem{ID: m, Name: m, Enabled: true}
	}
	return res
}

func parseModelsJSON(raw string) []ModelItem {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return make([]ModelItem, 0)
	}
	var items []ModelItem
	if err := json.Unmarshal([]byte(raw), &items); err == nil && len(items) > 0 && items[0].ID != "" {
		return items
	}
	var strs []string
	if err := json.Unmarshal([]byte(raw), &strs); err == nil {
		res := make([]ModelItem, len(strs))
		for i, s := range strs {
			res[i] = ModelItem{ID: s, Name: s, Enabled: true}
		}
		return res
	}
	return make([]ModelItem, 0)
}

func (s *Store) ListProviders() ([]ProviderConfig, error) {
	rows, err := s.db.Query("SELECT id, name, type, api_key, endpoint, models, is_default, enabled, created_at, updated_at FROM providers ORDER BY is_default DESC, name ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]ProviderConfig, 0)
	for rows.Next() {
		var p ProviderConfig
		var modelsJSON string
		var isDef, en int
		if err := rows.Scan(&p.ID, &p.Name, &p.Type, &p.APIKey, &p.Endpoint, &modelsJSON, &isDef, &en, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.Models = parseModelsJSON(modelsJSON)
		p.IsDefault = isDef == 1
		p.Enabled = en == 1
		res = append(res, p)
	}
	return res, nil
}

func (s *Store) GetProvider(id string) (*ProviderConfig, error) {
	var p ProviderConfig
	var modelsJSON string
	var isDef, en int
	err := s.db.QueryRow("SELECT id, name, type, api_key, endpoint, models, is_default, enabled, created_at, updated_at FROM providers WHERE id = ?", id).
		Scan(&p.ID, &p.Name, &p.Type, &p.APIKey, &p.Endpoint, &modelsJSON, &isDef, &en, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.Models = parseModelsJSON(modelsJSON)
	p.IsDefault = isDef == 1
	p.Enabled = en == 1
	return &p, nil
}

func (s *Store) SaveProvider(p ProviderConfig) error {
	modelsJSON, _ := json.Marshal(p.Models)
	isDef := 0
	if p.IsDefault {
		isDef = 1
		_, _ = s.db.Exec("UPDATE providers SET is_default = 0")
	}
	en := 0
	if p.Enabled {
		en = 1
	}

	if p.CreatedAt == 0 {
		p.CreatedAt = time.Now().Unix()
	}
	p.UpdatedAt = time.Now().Unix()

	_, err := s.db.Exec(`
		INSERT INTO providers (id, name, type, api_key, endpoint, models, is_default, enabled, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			type = excluded.type,
			api_key = excluded.api_key,
			endpoint = excluded.endpoint,
			models = excluded.models,
			is_default = excluded.is_default,
			enabled = excluded.enabled,
			updated_at = excluded.updated_at`,
		p.ID, p.Name, p.Type, p.APIKey, p.Endpoint, string(modelsJSON), isDef, en, p.CreatedAt, p.UpdatedAt)
	return err
}

func (s *Store) DeleteProvider(id string) error {
	_, err := s.db.Exec("DELETE FROM providers WHERE id = ?", id)
	return err
}

// --- Agents CRUD ---

func (s *Store) ListAgents() ([]AgentConfig, error) {
	rows, err := s.db.Query("SELECT id, name, description, provider_id, model, system_prompt, skills, tools, mcp, memory_scopes, policy, avatar, is_default, created_at, updated_at FROM agents ORDER BY is_default DESC, name ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]AgentConfig, 0)
	for rows.Next() {
		var a AgentConfig
		var skillsJSON, toolsJSON, mcpJSON, memoryJSON, policyJSON string
		var isDef int
		if err := rows.Scan(&a.ID, &a.Name, &a.Description, &a.ProviderID, &a.Model, &a.SystemPrompt, &skillsJSON, &toolsJSON, &mcpJSON, &memoryJSON, &policyJSON, &a.Avatar, &isDef, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(skillsJSON), &a.Skills)
		_ = json.Unmarshal([]byte(toolsJSON), &a.Tools)
		_ = json.Unmarshal([]byte(mcpJSON), &a.MCP)
		_ = json.Unmarshal([]byte(memoryJSON), &a.MemoryScopes)
		_ = json.Unmarshal([]byte(policyJSON), &a.Policy)
		a.IsDefault = isDef == 1
		res = append(res, a)
	}
	return res, nil
}

func (s *Store) GetAgent(id string) (*AgentConfig, error) {
	var a AgentConfig
	var skillsJSON, toolsJSON, mcpJSON, memoryJSON, policyJSON string
	var isDef int
	err := s.db.QueryRow("SELECT id, name, description, provider_id, model, system_prompt, skills, tools, mcp, memory_scopes, policy, avatar, is_default, created_at, updated_at FROM agents WHERE id = ?", id).
		Scan(&a.ID, &a.Name, &a.Description, &a.ProviderID, &a.Model, &a.SystemPrompt, &skillsJSON, &toolsJSON, &mcpJSON, &memoryJSON, &policyJSON, &a.Avatar, &isDef, &a.CreatedAt, &a.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(skillsJSON), &a.Skills)
	_ = json.Unmarshal([]byte(toolsJSON), &a.Tools)
	_ = json.Unmarshal([]byte(mcpJSON), &a.MCP)
	_ = json.Unmarshal([]byte(memoryJSON), &a.MemoryScopes)
	_ = json.Unmarshal([]byte(policyJSON), &a.Policy)
	a.IsDefault = isDef == 1
	return &a, nil
}

func (s *Store) SaveAgent(a AgentConfig) error {
	skillsJSON, _ := json.Marshal(a.Skills)
	toolsJSON, _ := json.Marshal(a.Tools)
	mcpJSON, _ := json.Marshal(a.MCP)
	memJSON, _ := json.Marshal(a.MemoryScopes)
	polJSON, _ := json.Marshal(a.Policy)

	isDef := 0
	if a.IsDefault {
		isDef = 1
		_, _ = s.db.Exec("UPDATE agents SET is_default = 0")
	}

	if a.CreatedAt == 0 {
		a.CreatedAt = time.Now().Unix()
	}
	a.UpdatedAt = time.Now().Unix()

	_, err := s.db.Exec(`
		INSERT INTO agents (id, name, description, provider_id, model, system_prompt, skills, tools, mcp, memory_scopes, policy, avatar, is_default, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			provider_id = excluded.provider_id,
			model = excluded.model,
			system_prompt = excluded.system_prompt,
			skills = excluded.skills,
			tools = excluded.tools,
			mcp = excluded.mcp,
			memory_scopes = excluded.memory_scopes,
			policy = excluded.policy,
			avatar = excluded.avatar,
			is_default = excluded.is_default,
			updated_at = excluded.updated_at`,
		a.ID, a.Name, a.Description, a.ProviderID, a.Model, a.SystemPrompt,
		string(skillsJSON), string(toolsJSON), string(mcpJSON), string(memJSON), string(polJSON),
		a.Avatar, isDef, a.CreatedAt, a.UpdatedAt)
	return err
}

func (s *Store) DeleteAgent(id string) error {
	_, err := s.db.Exec("DELETE FROM agents WHERE id = ?", id)
	return err
}

// --- Sessions CRUD ---

func (s *Store) ListSessions() ([]Session, error) {
	rows, err := s.db.Query("SELECT id, agent_id, title, channel_id, user_id, status, pinned, metadata, created_at, updated_at FROM sessions ORDER BY pinned DESC, updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]Session, 0)
	for rows.Next() {
		var sess Session
		var pinned int
		var meta sql.NullString
		if err := rows.Scan(&sess.ID, &sess.AgentID, &sess.Title, &sess.ChannelID, &sess.UserID, &sess.Status, &pinned, &meta, &sess.CreatedAt, &sess.UpdatedAt); err != nil {
			return nil, err
		}
		sess.Pinned = pinned == 1
		if meta.Valid {
			sess.Metadata = meta.String
		}
		res = append(res, sess)
	}
	return res, nil
}

func (s *Store) GetSession(id string) (*Session, error) {
	var sess Session
	var pinned int
	var meta sql.NullString
	err := s.db.QueryRow("SELECT id, agent_id, title, channel_id, user_id, status, pinned, metadata, created_at, updated_at FROM sessions WHERE id = ?", id).
		Scan(&sess.ID, &sess.AgentID, &sess.Title, &sess.ChannelID, &sess.UserID, &sess.Status, &pinned, &meta, &sess.CreatedAt, &sess.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	sess.Pinned = pinned == 1
	if meta.Valid {
		sess.Metadata = meta.String
	}
	return &sess, nil
}

func (s *Store) SaveSession(sess Session) error {
	pinned := 0
	if sess.Pinned {
		pinned = 1
	}
	if sess.CreatedAt == 0 {
		sess.CreatedAt = time.Now().Unix()
	}
	sess.UpdatedAt = time.Now().Unix()

	_, err := s.db.Exec(`
		INSERT INTO sessions (id, agent_id, title, channel_id, user_id, status, pinned, metadata, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			agent_id = excluded.agent_id,
			title = excluded.title,
			channel_id = excluded.channel_id,
			user_id = excluded.user_id,
			status = excluded.status,
			pinned = excluded.pinned,
			metadata = excluded.metadata,
			updated_at = excluded.updated_at`,
		sess.ID, sess.AgentID, sess.Title, sess.ChannelID, sess.UserID, sess.Status, pinned, sess.Metadata, sess.CreatedAt, sess.UpdatedAt)
	return err
}

func (s *Store) DeleteSession(id string) error {
	_, _ = s.db.Exec("DELETE FROM session_messages WHERE session_id = ?", id)
	_, err := s.db.Exec("DELETE FROM sessions WHERE id = ?", id)
	return err
}

// --- Session Messages CRUD ---

func (s *Store) GetSessionMessages(sessionID string) ([]SessionMessage, error) {
	rows, err := s.db.Query("SELECT id, session_id, agent_id, channel, role, content, thought, tool_calls, tool_call_id, tokens, model, created_at FROM session_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC", sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]SessionMessage, 0)
	for rows.Next() {
		var m SessionMessage
		var toolCallsJSON, toolCallID, model, thought sql.NullString
		var agentID sql.NullString
		if err := rows.Scan(&m.ID, &m.SessionID, &agentID, &m.Channel, &m.Role, &m.Content, &thought, &toolCallsJSON, &toolCallID, &m.Tokens, &model, &m.CreatedAt); err != nil {
			return nil, err
		}
		if agentID.Valid {
			m.AgentID = agentID.String
		}
		if thought.Valid {
			m.Thought = thought.String
		}
		if toolCallID.Valid {
			m.ToolCallID = toolCallID.String
		}
		if model.Valid {
			m.Model = model.String
		}
		if toolCallsJSON.Valid && toolCallsJSON.String != "" {
			_ = json.Unmarshal([]byte(toolCallsJSON.String), &m.ToolCalls)
		}
		res = append(res, m)
	}
	return res, nil
}

func (s *Store) SaveMessage(m SessionMessage) error {
	if m.ID == "" {
		m.ID = uuid.New().String()
	}
	if m.CreatedAt == 0 {
		m.CreatedAt = time.Now().UnixMilli()
	}
	toolCallsJSON, _ := json.Marshal(m.ToolCalls)

	_, err := s.db.Exec(`
		INSERT INTO session_messages (id, session_id, agent_id, channel, role, content, thought, tool_calls, tool_call_id, tokens, model, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.SessionID, m.AgentID, m.Channel, m.Role, m.Content, m.Thought, string(toolCallsJSON), m.ToolCallID, m.Tokens, m.Model, m.CreatedAt)

	// Update session updated_at
	_, _ = s.db.Exec("UPDATE sessions SET updated_at = ? WHERE id = ?", time.Now().Unix(), m.SessionID)

	return err
}

func (s *Store) ClearSessionMessages(sessionID string) error {
	_, err := s.db.Exec("DELETE FROM session_messages WHERE session_id = ?", sessionID)
	return err
}

// --- MCP Servers CRUD ---

func (s *Store) ListMCPServers() ([]MCPServerConfig, error) {
	rows, err := s.db.Query("SELECT id, name, transport, command, args, url, env, enabled, status, tools_cached, created_at, updated_at FROM mcp_servers ORDER BY name ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]MCPServerConfig, 0)
	for rows.Next() {
		var m MCPServerConfig
		var argsJSON, envJSON, toolsJSON string
		var en int
		if err := rows.Scan(&m.ID, &m.Name, &m.Transport, &m.Command, &argsJSON, &m.URL, &envJSON, &en, &m.Status, &toolsJSON, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(argsJSON), &m.Args)
		_ = json.Unmarshal([]byte(envJSON), &m.Env)
		_ = json.Unmarshal([]byte(toolsJSON), &m.ToolsCached)
		m.Enabled = en == 1
		res = append(res, m)
	}
	return res, nil
}

func (s *Store) SaveMCPServer(m MCPServerConfig) error {
	argsJSON, _ := json.Marshal(m.Args)
	envJSON, _ := json.Marshal(m.Env)
	toolsJSON, _ := json.Marshal(m.ToolsCached)
	en := 0
	if m.Enabled {
		en = 1
	}
	if m.CreatedAt == 0 {
		m.CreatedAt = time.Now().Unix()
	}
	m.UpdatedAt = time.Now().Unix()

	_, err := s.db.Exec(`
		INSERT INTO mcp_servers (id, name, transport, command, args, url, env, enabled, status, tools_cached, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			transport = excluded.transport,
			command = excluded.command,
			args = excluded.args,
			url = excluded.url,
			env = excluded.env,
			enabled = excluded.enabled,
			status = excluded.status,
			tools_cached = excluded.tools_cached,
			updated_at = excluded.updated_at`,
		m.ID, m.Name, m.Transport, m.Command, string(argsJSON), m.URL, string(envJSON), en, m.Status, string(toolsJSON), m.CreatedAt, m.UpdatedAt)
	return err
}

func (s *Store) DeleteMCPServer(id string) error {
	_, err := s.db.Exec("DELETE FROM mcp_servers WHERE id = ?", id)
	return err
}

// --- Telegram Bots CRUD ---

func (s *Store) ListTelegramBots() ([]TelegramBotConfig, error) {
	rows, err := s.db.Query("SELECT id, name, token, agent_id, COALESCE(model, ''), COALESCE(provider_id, ''), enabled, status, last_active_at, created_at FROM telegram_bots ORDER BY name ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]TelegramBotConfig, 0)
	for rows.Next() {
		var b TelegramBotConfig
		var en int
		var lastAct sql.NullInt64
		if err := rows.Scan(&b.ID, &b.Name, &b.Token, &b.AgentID, &b.Model, &b.ProviderID, &en, &b.Status, &lastAct, &b.CreatedAt); err != nil {
			return nil, err
		}
		b.Enabled = en == 1
		if lastAct.Valid {
			b.LastActiveAt = lastAct.Int64
		}
		res = append(res, b)
	}
	return res, nil
}

func (s *Store) GetTelegramBot(id string) (*TelegramBotConfig, error) {
	var b TelegramBotConfig
	var en int
	var lastAct sql.NullInt64
	err := s.db.QueryRow("SELECT id, name, token, agent_id, COALESCE(model, ''), COALESCE(provider_id, ''), enabled, status, last_active_at, created_at FROM telegram_bots WHERE id = ?", id).
		Scan(&b.ID, &b.Name, &b.Token, &b.AgentID, &b.Model, &b.ProviderID, &en, &b.Status, &lastAct, &b.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	b.Enabled = en == 1
	if lastAct.Valid {
		b.LastActiveAt = lastAct.Int64
	}
	return &b, nil
}

func (s *Store) SaveTelegramBot(b TelegramBotConfig) error {
	en := 0
	if b.Enabled {
		en = 1
	}
	if b.CreatedAt == 0 {
		b.CreatedAt = time.Now().Unix()
	}

	_, err := s.db.Exec(`
		INSERT INTO telegram_bots (id, name, token, agent_id, model, provider_id, enabled, status, last_active_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			token = excluded.token,
			agent_id = excluded.agent_id,
			model = excluded.model,
			provider_id = excluded.provider_id,
			enabled = excluded.enabled,
			status = excluded.status`,
		b.ID, b.Name, b.Token, b.AgentID, b.Model, b.ProviderID, en, b.Status, b.LastActiveAt, b.CreatedAt)
	return err
}

func (s *Store) UpdateTelegramBotStatus(id, status string) error {
	_, err := s.db.Exec("UPDATE telegram_bots SET status = ?, last_active_at = ? WHERE id = ?", status, time.Now().Unix(), id)
	return err
}

func (s *Store) DeleteTelegramBot(id string) error {
	_, err := s.db.Exec("DELETE FROM telegram_bots WHERE id = ?", id)
	return err
}

// --- Policies CRUD ---

func (s *Store) ListPolicies(agentID string) ([]PolicyRule, error) {
	query := "SELECT id, agent_id, tool_name, effect, created_at FROM policies"
	var args []interface{}
	if agentID != "" {
		query += " WHERE agent_id = ?"
		args = append(args, agentID)
	}
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]PolicyRule, 0)
	for rows.Next() {
		var p PolicyRule
		if err := rows.Scan(&p.ID, &p.AgentID, &p.ToolName, &p.Effect, &p.CreatedAt); err != nil {
			return nil, err
		}
		res = append(res, p)
	}
	return res, nil
}

func (s *Store) SetPolicy(agentID, toolName, effect string) error {
	id := fmt.Sprintf("%s:%s", agentID, toolName)
	_, err := s.db.Exec(`
		INSERT INTO policies (id, agent_id, tool_name, effect, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET effect = excluded.effect`,
		id, agentID, toolName, strings.ToUpper(effect), time.Now().Unix())
	return err
}

// --- Embedding & Vector RAG ---

func (s *Store) GetEmbeddingConfig() (*EmbeddingConfig, error) {
	var val string
	err := s.db.QueryRow("SELECT value FROM system_config WHERE key = 'embedding_config'").Scan(&val)
	if err == nil && strings.TrimSpace(val) != "" {
		var cfg EmbeddingConfig
		if jsonErr := json.Unmarshal([]byte(val), &cfg); jsonErr == nil {
			return &cfg, nil
		}
	}

	apiKey := ""
	endpoint := "https://api.openai.com/v1"
	model := "text-embedding-3-small"
	dimensions := 1536
	enabled := true

	if config.Cfg != nil {
		if config.Cfg.Embedding.APIKey != "" {
			apiKey = config.Cfg.Embedding.APIKey
		} else if p := config.Cfg.DefaultChatProvider(); p != nil && p.APIKey != "" {
			apiKey = p.APIKey
		}
		if config.Cfg.Embedding.Endpoint != "" {
			endpoint = config.Cfg.Embedding.Endpoint
		}
		if config.Cfg.Embedding.Model != "" {
			model = config.Cfg.Embedding.Model
		}
		if config.Cfg.Embedding.Dimensions > 0 {
			dimensions = config.Cfg.Embedding.Dimensions
		}
		enabled = config.Cfg.Embedding.Enabled
	}

	defaultCfg := EmbeddingConfig{
		Endpoint:   endpoint,
		APIKey:     apiKey,
		Model:      model,
		Dimensions: dimensions,
		Enabled:    enabled,
		UpdatedAt:  time.Now().Unix(),
	}
	return &defaultCfg, nil
}

func (s *Store) SaveEmbeddingConfig(cfg EmbeddingConfig) error {
	cfg.UpdatedAt = time.Now().Unix()
	if cfg.Model == "" {
		cfg.Model = "text-embedding-3-small"
	}
	if cfg.Dimensions <= 0 {
		cfg.Dimensions = 1536
	}
	data, err := json.Marshal(cfg)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(`
		INSERT INTO system_config (key, value, description, updated_at)
		VALUES ('embedding_config', ?, 'Embedding and Vector RAG Provider Configuration', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		string(data), cfg.UpdatedAt)
	if err != nil {
		return err
	}

	if config.Cfg != nil {
		config.Cfg.Embedding.APIKey = cfg.APIKey
		config.Cfg.Embedding.Endpoint = cfg.Endpoint
		config.Cfg.Embedding.Model = cfg.Model
		config.Cfg.Embedding.Dimensions = cfg.Dimensions
		config.Cfg.Embedding.Enabled = cfg.Enabled
	}
	return nil
}

func (s *Store) IngestDocument(doc Document, chunks []string, embeddings [][]float32, embedModel string) error {
	if doc.ID == "" {
		doc.ID = uuid.New().String()
	}
	if doc.CreatedAt == 0 {
		doc.CreatedAt = time.Now().UnixMilli()
	}
	doc.CharCount = len(doc.Content)
	doc.ChunkCount = len(chunks)

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO documents (id, session_id, title, source, content, char_count, chunk_count, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			source = excluded.source,
			content = excluded.content,
			char_count = excluded.char_count,
			chunk_count = excluded.chunk_count`,
		doc.ID, doc.SessionID, doc.Title, doc.Source, doc.Content, doc.CharCount, doc.ChunkCount, doc.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert document error: %w", err)
	}

	// Delete old chunks for this document if updating
	_, _ = tx.Exec("DELETE FROM document_chunks WHERE document_id = ?", doc.ID)

	stmt, err := tx.Prepare(`
		INSERT INTO document_chunks (id, document_id, session_id, chunk_index, content, embedding, embedding_model, dimensions, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare chunk insert: %w", err)
	}
	defer stmt.Close()

	for i, chunk := range chunks {
		chunkID := fmt.Sprintf("%s_chk_%d", doc.ID, i)
		var embJSON []byte
		dims := 0
		if i < len(embeddings) && len(embeddings[i]) > 0 {
			embJSON, _ = json.Marshal(embeddings[i])
			dims = len(embeddings[i])
		} else {
			embJSON = []byte("[]")
		}

		if _, err := stmt.Exec(chunkID, doc.ID, doc.SessionID, i, chunk, string(embJSON), embedModel, dims, doc.CreatedAt); err != nil {
			return fmt.Errorf("insert chunk error: %w", err)
		}
	}

	return tx.Commit()
}

func (s *Store) UpdateDocumentChunkEmbeddings(docID string, embeddings [][]float32, embedModel string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("UPDATE document_chunks SET embedding = ?, embedding_model = ?, dimensions = ? WHERE document_id = ? AND chunk_index = ?")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for i, vec := range embeddings {
		if len(vec) == 0 {
			continue
		}
		data, err := json.Marshal(vec)
		if err != nil {
			continue
		}
		_, _ = stmt.Exec(string(data), embedModel, len(vec), docID, i)
	}

	return tx.Commit()
}

// ChunkModelStat reports how many stored chunks were embedded with each
// model/dimension combination, so the UI can flag incompatibilities when the
// embedding model changes.
type ChunkModelStat struct {
	Model string `json:"model"`
	Dims  int    `json:"dims"`
	Count int    `json:"count"`
}

func (s *Store) ChunkModelStats() ([]ChunkModelStat, error) {
	rows, err := s.db.Query(`
		SELECT COALESCE(NULLIF(embedding_model, ''), '(legacy)'), COALESCE(dimensions, 0), COUNT(*)
		FROM document_chunks
		GROUP BY 1, 2
		ORDER BY 3 DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []ChunkModelStat
	for rows.Next() {
		var st ChunkModelStat
		if err := rows.Scan(&st.Model, &st.Dims, &st.Count); err != nil {
			continue
		}
		stats = append(stats, st)
	}
	return stats, rows.Err()
}

func (s *Store) ListDocuments(sessionID string) ([]Document, error) {
	query := "SELECT id, session_id, title, source, content, char_count, chunk_count, created_at FROM documents"
	var args []interface{}
	if sessionID != "" {
		query += " WHERE session_id = ? OR session_id = '' ORDER BY created_at DESC"
		args = append(args, sessionID)
	} else {
		query += " ORDER BY created_at DESC"
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []Document
	for rows.Next() {
		var d Document
		var sessID, src, content sql.NullString
		if err := rows.Scan(&d.ID, &sessID, &d.Title, &src, &content, &d.CharCount, &d.ChunkCount, &d.CreatedAt); err != nil {
			return nil, err
		}
		d.SessionID = sessID.String
		d.Source = src.String
		d.Content = content.String
		docs = append(docs, d)
	}
	return docs, nil
}

func (s *Store) DeleteDocument(id string) error {
	_, _ = s.db.Exec("DELETE FROM document_chunks WHERE document_id = ?", id)
	_, err := s.db.Exec("DELETE FROM documents WHERE id = ?", id)
	return err
}

func (s *Store) SearchDocumentChunks(sessionID string, queryEmbedding []float32, topK int, minScore float64, embedModel string) ([]ChunkSearchResult, error) {
	if len(queryEmbedding) == 0 {
		return nil, nil
	}
	if topK <= 0 {
		topK = 5
	}
	if minScore <= 0 {
		minScore = 0.30
	}

	// Only compare chunks embedded with the same model as the query vector.
	// Legacy rows (embedded before model tagging) stay searchable best-effort;
	// the per-row dimension guard below catches any residual mismatch.
	query := `SELECT c.id, c.document_id, COALESCE(d.title, ''), c.content, c.embedding 
	          FROM document_chunks c 
	          LEFT JOIN documents d ON c.document_id = d.id`
	var args []interface{}
	if sessionID != "" {
		query += " WHERE (c.session_id = ? OR c.session_id = '')"
		args = append(args, sessionID)
	} else {
		query += " WHERE 1=1"
	}
	if embedModel != "" {
		query += " AND (c.embedding_model = ? OR c.embedding_model = '')"
		args = append(args, embedModel)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []ChunkSearchResult
	for rows.Next() {
		var id, docID, title, content, embStr string
		if err := rows.Scan(&id, &docID, &title, &content, &embStr); err != nil {
			continue
		}

		var vec []float32
		if err := json.Unmarshal([]byte(embStr), &vec); err != nil || len(vec) != len(queryEmbedding) {
			continue
		}

		var dot, normA, normB float64
		for i := range queryEmbedding {
			q := float64(queryEmbedding[i])
			v := float64(vec[i])
			dot += q * v
			normA += q * q
			normB += v * v
		}
		if normA == 0 || normB == 0 {
			continue
		}
		score := dot / (math.Sqrt(normA) * math.Sqrt(normB))

		if score >= minScore {
			results = append(results, ChunkSearchResult{
				ID:         id,
				DocumentID: docID,
				DocTitle:   title,
				Content:    content,
				Score:      score,
			})
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	if len(results) > topK {
		results = results[:topK]
	}
	return results, nil
}
