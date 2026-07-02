package data

import (
	"context"
	"time"
)

type Session struct {
	ID        string    `json:"id"`
	GatewayID string    `json:"gateway_id"`
	ChannelID string    `json:"channel_id"`
	Goal      string    `json:"goal"`
	Intent    string    `json:"intent"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type SessionRepository interface {
	Create(ctx context.Context, session *Session) error
	Get(ctx context.Context, id string) (*Session, error)
	List(ctx context.Context, gatewayID string, limit, offset int) ([]Session, error)
	Update(ctx context.Context, session *Session) error
	Delete(ctx context.Context, id string) error
}

type GoalRecord struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"session_id"`
	Summary     string    `json:"summary"`
	Status      string    `json:"status"`
	ParentID    string    `json:"parent_id,omitempty"`
	DAG         string    `json:"dag,omitempty"`
	ToolTrace   string    `json:"tool_trace,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

type GoalRepository interface {
	Create(ctx context.Context, goal *GoalRecord) error
	Get(ctx context.Context, id string) (*GoalRecord, error)
	ListBySession(ctx context.Context, sessionID string) ([]GoalRecord, error)
	Update(ctx context.Context, goal *GoalRecord) error
}

type Memory struct {
	ID            string    `json:"id"`
	Content       string    `json:"content"`
	ContentHash   string    `json:"content_hash"`
	Source        string    `json:"source"`
	EmbeddingJSON string    `json:"embedding_json"`
	Importance    float64   `json:"importance"`
	CreatedAt     time.Time `json:"created_at"`
}

type MemoryRepository interface {
	Store(ctx context.Context, mem *Memory) error
	Search(ctx context.Context, query string, topK int) ([]Memory, error)
	Delete(ctx context.Context, id string) error
}

type WorkspaceMeta struct {
	ID           string    `json:"id"`
	RootPath     string    `json:"root_path"`
	Framework    string    `json:"framework"`
	Language     string    `json:"language"`
	BuildTool    string    `json:"build_tool"`
	CSS          string    `json:"css"`
	Routing      string    `json:"routing"`
	Entrypoints  string    `json:"entrypoints"`
	ConfigFiles  string    `json:"config_files"`
	IndexedAt    time.Time `json:"indexed_at"`
}

type WorkspaceRepository interface {
	Save(ctx context.Context, ws *WorkspaceMeta) error
	Get(ctx context.Context, rootPath string) (*WorkspaceMeta, error)
	Delete(ctx context.Context, rootPath string) error
}

type ConversationTurn struct {
	ID        int       `json:"id"`
	SessionID string    `json:"session_id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Tokens    int       `json:"tokens"`
	Model     string    `json:"model"`
	CreatedAt time.Time `json:"created_at"`
}

type ConversationRepository interface {
	Append(ctx context.Context, turn *ConversationTurn) error
	ListBySession(ctx context.Context, sessionID string, limit int) ([]ConversationTurn, error)
}

type ContextCacheEntry struct {
	ContextHash    string    `json:"context_hash"`
	Prompt         string    `json:"prompt"`
	Response       string    `json:"response"`
	ToolSequence   string    `json:"tool_sequence"`
	Provider       string    `json:"provider"`
	Model          string    `json:"model"`
	TokenSavings   int       `json:"token_savings"`
	HitCount       int       `json:"hit_count"`
	CreatedAt      time.Time `json:"created_at"`
	LastAccessedAt time.Time `json:"last_accessed_at"`
}

type ContextCacheRepository interface {
	Get(ctx context.Context, hash string) (*ContextCacheEntry, error)
	Set(ctx context.Context, entry *ContextCacheEntry) error
	Invalidate(ctx context.Context) error
}

type Artifact struct {
	ID            string    `json:"id"`
	SessionID     string    `json:"session_id"`
	GoalID        string    `json:"goal_id"`
	Key           string    `json:"key"`
	Bucket        string    `json:"bucket"`
	URL           string    `json:"url"`
	Checksum      string    `json:"checksum"`
	Size          int64     `json:"size"`
	Mime          string    `json:"mime"`
	ParentID      string    `json:"parent_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type ArtifactRepository interface {
	Create(ctx context.Context, artifact *Artifact) error
	Get(ctx context.Context, id string) (*Artifact, error)
	ListBySession(ctx context.Context, sessionID string) ([]Artifact, error)
	ListByGoal(ctx context.Context, goalID string) ([]Artifact, error)
	Delete(ctx context.Context, id string) error
}

type SymbolEntry struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	File     string `json:"file"`
	Line     int    `json:"line"`
	Parent   string `json:"parent,omitempty"`
	Exported bool   `json:"exported"`
}

type ImportEdge struct {
	FromFile string `json:"from_file"`
	ToFile   string `json:"to_file"`
	Symbol   string `json:"symbol,omitempty"`
	IsNamed  bool   `json:"is_named"`
}

type FileNode struct {
	Path       string   `json:"path"`
	Exports    []string `json:"exports"`
	Imports    []string `json:"imports"`
	Components []string `json:"components,omitempty"`
	IsRoute    bool     `json:"is_route,omitempty"`
}

type SymbolLocation struct {
	Name string `json:"name"`
	File string `json:"file"`
	Line int    `json:"line"`
}

type RouteInfo struct {
	Path      string `json:"path"`
	Component string `json:"component"`
	File      string `json:"file"`
}
