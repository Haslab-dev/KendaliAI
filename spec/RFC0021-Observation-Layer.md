# RFC-0021: Observation Layer

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0000

## Problem

Currently tools output raw results directly to the planner:

```
Tool
  │
  ▼
Result (raw)
  │
  ▼
Planner
```

This is problematic because:
- `git diff` outputs diff format
- `npm build` outputs log format
- `browser` outputs HTML/JSON
- `shell` outputs arbitrary text

Planners can't reliably interpret raw outputs.

## Solution

Insert an observation layer:

```
Tool
  │
  ▼
Observation
  │
  ▼
Normalizer
  │
  ▼
Memory
  │
  ▼
Planner
```

## Observation Schema

```go
type Observation struct {
    ID         string
    ToolID     string
    ToolName   string
    Type       ObservationType
    Severity   Severity
    Summary    string
    RawOutput  string
    ParsedOutput interface{}
    Metadata   map[string]interface{}
    Timestamp  time.Time
    Duration   time.Duration
}

type ObservationType string

const (
    ObsFileList    ObservationType = "file_list"
    ObsFileContent ObservationType = "file_content"
    ObsSearchResult ObservationType = "search_result"
    ObsCommandOutput ObservationType = "command_output"
    ObsBuildResult ObservationType = "build_result"
    ObsTestResult ObservationType = "test_result"
    ObsGitStatus ObservationType = "git_status"
    ObsGitDiff   ObservationType = "git_diff"
    ObsGitLog    ObservationType = "git_log"
    ObsNetwork   ObservationType = "network_response"
    ObsError     ObservationType = "error"
    ObsWebPage   ObservationType = "web_page"
    ObsImage     ObservationType = "image"
    ObsUnknown   ObservationType = "unknown"
)

type Severity string

const (
    SeverityCritical Severity = "critical"
    SeverityHigh     Severity = "high"
    SeverityMedium   Severity = "medium"
    SeverityLow      Severity = "low"
    SeverityInfo     Severity = "info"
)
```

## Normalizers

Each tool type has a normalizer:

```go
type Normalizer interface {
    Normalize(rawOutput string, metadata map[string]interface{}) (*Observation, error)
    CanNormalize(toolName string, rawOutput string) bool
}

type GitNormalizer struct{}

func (n *GitNormalizer) CanNormalize(toolName, rawOutput string) bool {
    return toolName == "git_status" || toolName == "git_diff" || toolName == "git_log"
}

func (n *GitNormalizer) Normalize(rawOutput string, metadata map[string]interface{}) (*Observation, error) {
    if strings.HasPrefix(rawOutput, "diff --git") {
        return n.normalizeDiff(rawOutput, metadata)
    }
    if strings.HasPrefix(rawOutput, "commit ") {
        return n.normalizeLog(rawOutput, metadata)
    }
    return n.normalizeStatus(rawOutput, metadata)
}

func (n *GitNormalizer) normalizeDiff(rawOutput string, metadata map[string]interface{}) (*Observation, error) {
    obs := &Observation{
        Type:      ObsGitDiff,
        Severity:  SeverityInfo,
        RawOutput: rawOutput,
        Metadata:  metadata,
    }

    // Parse diff
    diffs := parseDiff(rawOutput)
    obs.Summary = fmt.Sprintf("Git diff with %d file changes, +%d lines, -%d lines",
        len(diffs), diffs.Additions, diffs.Deletions)

    obs.ParsedOutput = diffs
    return obs, nil
}

type ShellNormalizer struct{}

func (n *ShellNormalizer) CanNormalize(toolName, rawOutput string) bool {
    return toolName == "exec"
}

func (n *ShellNormalizer) Normalize(rawOutput string, metadata map[string]interface{}) (*Observation, error) {
    obs := &Observation{
        Type:      ObsCommandOutput,
        RawOutput: rawOutput,
        Metadata:  metadata,
    }

    exitCode, _ := metadata["exit_code"].(int)

    if exitCode != 0 {
        obs.Severity = SeverityHigh
        obs.Summary = fmt.Sprintf("Command failed with exit code %d", exitCode)
    } else {
        obs.Severity = SeverityInfo
        obs.Summary = fmt.Sprintf("Command succeeded, %d bytes output", len(rawOutput))
    }

    obs.ParsedOutput = map[string]interface{}{
        "exit_code": exitCode,
        "stdout":    rawOutput,
    }

    return obs, nil
}

type BuildNormalizer struct{}

func (n *BuildNormalizer) CanNormalize(toolName, rawOutput string) bool {
    return toolName == "build" || toolName == "npm_build" || toolName == "go_build"
}

func (n *BuildNormalizer) Normalize(rawOutput string, metadata map[string]interface{}) (*Observation, error) {
    obs := &Observation{
        Type:      ObsBuildResult,
        RawOutput: rawOutput,
        Metadata:  metadata,
    }

    // Parse build output
    result := parseBuildOutput(rawOutput)

    if result.ErrorCount > 0 {
        obs.Severity = SeverityHigh
        obs.Summary = fmt.Sprintf("Build failed: %d errors, %d warnings", result.ErrorCount, result.WarningCount)
    } else if result.WarningCount > 0 {
        obs.Severity = SeverityMedium
        obs.Summary = fmt.Sprintf("Build succeeded with %d warnings", result.WarningCount)
    } else {
        obs.Severity = SeverityInfo
        obs.Summary = "Build succeeded"
    }

    obs.ParsedOutput = result
    return obs, nil
}
```

## Observation Engine

```go
type ObservationEngine struct {
    normalizers []Normalizer
    defaultNormalizer *DefaultNormalizer
    mu          sync.RWMutex
}

func (e *ObservationEngine) Observe(toolID, toolName string, rawOutput string, metadata map[string]interface{}) (*Observation, error) {
    obs := &Observation{
        ID:        uuid.New().String(),
        ToolID:    toolID,
        ToolName:  toolName,
        Timestamp: time.Now(),
    }

    e.mu.RLock()
    defer e.mu.RUnlock()

    // Find appropriate normalizer
    for _, normalizer := range e.normalizers {
        if normalizer.CanNormalize(toolName, rawOutput) {
            return normalizer.Normalize(rawOutput, metadata)
        }
    }

    // Fall back to default
    return e.defaultNormalizer.Normalize(rawOutput, metadata)
}

type DefaultNormalizer struct{}

func (n *DefaultNormalizer) Normalize(rawOutput string, metadata map[string]interface{}) (*Observation, error) {
    obs := &Observation{
        Type:      ObsUnknown,
        Severity:  SeverityInfo,
        RawOutput: truncate(rawOutput, 10000),
        Metadata:  metadata,
        Summary:   summarize(rawOutput),
    }

    // Try to detect type
    if isJSON(rawOutput) {
        obs.Type = ObsNetwork
    } else if isHTML(rawOutput) {
        obs.Type = ObsWebPage
    }

    return obs, nil
}
```

## Observation Memory

Observations are stored for context:

```go
type ObservationStore struct {
    db *sql.DB
    embedding embedding.Store
}

func (s *ObservationStore) Store(ctx context.Context, obs *Observation) error {
    query := `
        INSERT INTO observations (id, tool_id, tool_name, type, severity, summary, raw_output, parsed_output, metadata, timestamp, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    parsedJSON, _ := json.Marshal(obs.ParsedOutput)
    metadataJSON, _ := json.Marshal(obs.Metadata)

    _, err := s.db.ExecContext(ctx, query,
        obs.ID, obs.ToolID, obs.ToolName, obs.Type, obs.Severity,
        obs.Summary, obs.RawOutput, parsedJSON, metadataJSON,
        obs.Timestamp, obs.Duration,
    )

    return err
}

func (s *ObservationStore) Search(ctx context.Context, query string, limit int) ([]*Observation, error) {
    // Embed query and search
    emb, _ := s.embedding.Embed(ctx, query)

    sqlQuery := `
        SELECT * FROM observations
        ORDER BY embedding <=> ?
        LIMIT ?
    `

    rows, err := s.db.QueryContext(ctx, sqlQuery, emb, limit)
    if err != nil {
        return nil, err
    }

    var observations []*Observation
    for rows.Next() {
        obs := &Observation{}
        rows.Scan(/* ... */)
        observations = append(observations, obs)
    }

    return observations, nil
}
```

## Observation Aggregation

For continuous replanning:

```go
type ObservationAggregator struct {
    recent []*Observation
    mu     sync.RWMutex
    size   int
}

func (a *ObservationAggregator) Add(obs *Observation) {
    a.mu.Lock()
    defer a.mu.Unlock()

    a.recent = append(a.recent, obs)
    if len(a.recent) > a.size {
        a.recent = a.recent[1:]
    }
}

func (a *ObservationAggregator) GetContext(maxObservations int) string {
    a.mu.RLock()
    defer a.mu.RUnlock()

    var sb strings.Builder
    for i := len(a.recent) - min(len(a.recent), maxObservations); i < len(a.recent); i++ {
        obs := a.recent[i]
        sb.WriteString(fmt.Sprintf("[%s] %s: %s\n", obs.ToolName, obs.Severity, obs.Summary))
    }

    return sb.String()
}
```

## Directory Structure

```
internal/observation/
    engine.go          # Main observation engine
    normalizer.go      # Normalizer interface
    normalizers/
        git.go         # Git normalizer
        shell.go       # Shell normalizer
        build.go       # Build normalizer
        search.go      # Search normalizer
        network.go     # Network normalizer
        file.go        # File normalizer
    store.go           # Observation storage
    aggregator.go      # Context aggregation
```
