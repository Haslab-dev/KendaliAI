package intelligence

import "time"

type ProjectInfo struct {
	Framework   string   `json:"framework"`
	Language    string   `json:"language"`
	BuildTool   string   `json:"build_tool"`
	CSS         string   `json:"css"`
	Routing     string   `json:"routing"`
	Entrypoints []string `json:"entrypoints"`
	ConfigFiles []string `json:"config_files"`
}

type SymbolEntry struct {
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

type FileCacheEntry struct {
	Path       string    `json:"path"`
	SHA256     string    `json:"sha256"`
	MTime      int64     `json:"mtime"`
	Tokens     int       `json:"tokens"`
	Summary    string    `json:"summary,omitempty"`
	CachedAt   time.Time `json:"cached_at"`
}

type WorkingSet struct {
	SessionID string   `json:"session_id"`
	Files     []string `json:"files"`
	Goal      string   `json:"goal"`
	Intent    string   `json:"intent"`
	CreatedAt time.Time
}

type EditPlan struct {
	File    string `json:"file"`
	Op      string `json:"op"`
	Target  string `json:"target"`
	Content string `json:"content"`
}

type SemanticCacheEntry struct {
	ContextHash    string   `json:"context_hash"`
	Prompt         string   `json:"prompt"`
	Response       string   `json:"response"`
	ToolSequence   []string `json:"tool_sequence"`
	HitCount       int      `json:"hit_count"`
	CreatedAt      time.Time
	LastAccessedAt time.Time
}

type ExecutionCacheEntry struct {
	SessionID   string `json:"session_id"`
	Goal        string `json:"goal"`
	Phases      string `json:"phases"`
	ToolTrace   string `json:"tool_trace"`
	FilesEdited string `json:"files_edited"`
	BuildResult string `json:"build_result"`
	LintResult  string `json:"lint_result"`
	TestResult  string `json:"test_result"`
	Success     bool   `json:"success"`
}

type CtxPhase int

const (
	PhaseIDLE CtxPhase = iota
	PhaseAnalyzeProject
	PhaseBuildWorkingSet
	PhasePlan
	PhaseReadTargetFiles
	PhaseGenerateDiff
	PhaseApplyPatch
	PhaseVerifyBuild
	PhaseDone
)

func (p CtxPhase) String() string {
	switch p {
	case PhaseIDLE:
		return "IDLE"
	case PhaseAnalyzeProject:
		return "ANALYZE_PROJECT"
	case PhaseBuildWorkingSet:
		return "BUILD_WORKING_SET"
	case PhasePlan:
		return "PLAN"
	case PhaseReadTargetFiles:
		return "READ_TARGET_FILES"
	case PhaseGenerateDiff:
		return "GENERATE_DIFF"
	case PhaseApplyPatch:
		return "APPLY_PATCH"
	case PhaseVerifyBuild:
		return "VERIFY_BUILD"
	case PhaseDone:
		return "DONE"
	default:
		return "UNKNOWN"
	}
}
