# RFC-0023: Tool Manifest

**Status:** Draft
**Version:** 0.3.4

## Problem

Currently tools are just functions:

```go
type Tool struct {
    Name    string
    Execute func(params map[string]interface{}) (interface{}, error)
}
```

This is too primitive. We need manifests for:
- Cost estimation
- Latency prediction
- Permission requirements
- Retry behavior
- Idempotency
- Sandbox requirements
- Output schemas

## Solution

Tool Manifest with JSON Schema validation:

```go
type ToolManifest struct {
    ID            string
    Name          string
    Description   string
    Version       string
    Category      ToolCategory
    InputSchema   *jsonschema.Schema
    OutputSchema  *jsonschema.Schema
    Cost          *ToolCost
    Latency       *ToolLatency
    Permissions   []Permission
    RetryPolicy   *RetryPolicy
    Idempotent    bool
    Sandbox       *SandboxConfig
    Streaming     bool
    Capabilities  []Capability
}

type ToolCategory string

const (
    ToolCategoryExplore   ToolCategory = "explore"
    ToolCategoryEdit      ToolCategory = "edit"
    ToolCategoryExecute   ToolCategory = "execute"
    ToolCategoryGit       ToolCategory = "git"
    ToolCategoryTest      ToolCategory = "test"
    ToolCategoryNetwork   ToolCategory = "network"
    ToolCategoryMemory    ToolCategory = "memory"
    ToolCategoryMCP       ToolCategory = "mcp"
)
```

## Tool Manifest Examples

### read_file Manifest

```yaml
id: tool_read_file
name: read_file
description: Read contents of a file with optional offset and limit
version: "1.0"

category: explore

input_schema:
  type: object
  required: ["path"]
  properties:
    path:
      type: string
      description: Absolute path to the file
      pattern: "^/"
    offset:
      type: integer
      description: Byte offset to start reading
      minimum: 0
    limit:
      type: integer
      description: Maximum bytes to read
      minimum: 1
      maximum: 1000000

output_schema:
  type: object
  properties:
    content:
      type: string
      description: File contents
    bytes_read:
      type: integer
    truncated:
      type: boolean

cost:
  tokens_per_call: 0
  tokens_per_mb: 10
  estimated_api_cost: 0.0

latency:
  p50_ms: 5
  p95_ms: 50
  p99_ms: 200

permissions:
  - capability: read_files
    resource: "{path}"

idempotent: true

sandbox:
  allowed_paths:
    - "/**"
  denied_paths:
    - "/.env"
    - "/.git/objects/**"
  max_file_size_mb: 100

streaming: false
```

### exec Manifest

```yaml
id: tool_exec
name: exec
description: Execute a shell command with timeout

category: execute

input_schema:
  type: object
  required: ["command"]
  properties:
    command:
      type: string
      description: Shell command to execute
      maxLength: 10000
    timeout:
      type: string
      description: Timeout duration (e.g., "30s", "5m")
    cwd:
      type: string
      description: Working directory

output_schema:
  type: object
  properties:
    stdout:
      type: string
    stderr:
      type: string
    exit_code:
      type: integer
    timed_out:
      type: boolean

cost:
  tokens_per_call: 0
  base_cost: 0.0
  per_second_cost: 0.001

latency:
  p50_ms: 500
  p95_ms: 5000
  p99_ms: 30000
  max_ms: 600000

permissions:
  - capability: shell
    resource: "{cwd}"

retry_policy:
  max_attempts: 3
  backoff_base: 1s
  backoff_multiplier: 2.0
  retryable_errors:
    - "context deadline exceeded"
    - "signal: killed"

idempotent: false

sandbox:
  allowed_paths:
    - "/**"
  denied_paths:
    - "/etc/passwd"
    - "/etc/shadow"
    - "/.env"
  max_memory_mb: 512
  max_cpu_seconds: 300
  allowed_commands:
    - "git"
    - "npm"
    - "node"
    - "go"
    - "python"
    - "cargo"

streaming: true
```

### apply_patch Manifest

```yaml
id: tool_apply_patch
name: apply_patch
description: Apply a string-based patch to a file

category: edit

input_schema:
  type: object
  required: ["path", "old_string", "new_string"]
  properties:
    path:
      type: string
      description: File path
    old_string:
      type: string
      description: Exact string to replace
      maxLength: 10000
    new_string:
      type: string
      description: Replacement string
      maxLength: 10000
    exact_match:
      type: boolean
      description: Require exact match of old_string

output_schema:
  type: object
  properties:
    success:
      type: boolean
    lines_changed:
      type: integer
    backup_path:
      type: string

cost:
  tokens_per_call: 0
  base_cost: 0.0

latency:
  p50_ms: 10
  p95_ms: 100
  p99_ms: 500

permissions:
  - capability: write_files
    resource: "{path}"

retry_policy:
  max_attempts: 1

idempotent: false

sandbox:
  allowed_paths:
    - "/**"
  denied_paths:
    - "/.env"
    - "/.git/**"
    - "**/node_modules/**"
  create_backup: true
```

## JSON Schema Validation

```go
type ToolValidator struct {
    schemas map[string]*jsonschema.Schema
}

func (v *ToolValidator) Validate(toolName string, params interface{}) error {
    manifest, ok := v.schemas[toolName]
    if !ok {
        return fmt.Errorf("unknown tool: %s", toolName)
    }

    // Validate against input schema
    data, err := json.Marshal(params)
    if err != nil {
        return fmt.Errorf("invalid params: %w", err)
    }

    result := manifest.InputSchema.Validate(data)
    if !result.Valid {
        return fmt.Errorf("validation failed: %s", result.Errors)
    }

    return nil
}
```

## Tool Registry with Manifests

```go
type ToolRegistry struct {
    manifests map[string]*ToolManifest
    tools     map[string]Tool
    validator *ToolValidator
}

func (r *ToolRegistry) Register(manifest *ToolManifest, tool Tool) error {
    // Validate manifest
    if err := r.validateManifest(manifest); err != nil {
        return err
    }

    r.manifests[manifest.Name] = manifest
    r.tools[manifest.Name] = tool

    return nil
}

func (r *ToolRegistry) Execute(ctx context.Context, toolName string, params interface{}) (*ToolResult, error) {
    manifest, ok := r.manifests[toolName]
    if !ok {
        return nil, fmt.Errorf("tool not found: %s", toolName)
    }

    // Validate input
    if err := r.validator.Validate(toolName, params); err != nil {
        return nil, fmt.Errorf("validation error: %w", err)
    }

    // Check permissions
    if err := r.checkPermissions(manifest, params); err != nil {
        return nil, fmt.Errorf("permission denied: %w", err)
    }

    // Execute with cost tracking
    start := time.Now()
    result, err := r.tools[toolName].Execute(ctx, params)
    duration := time.Since(start)

    // Update cost
    cost := r.calculateCost(manifest, params, duration)

    return &ToolResult{
        Output:    result,
        Cost:      cost,
        Duration:  duration,
        Timestamp: start,
    }, err
}
```

## Cost Calculation

```go
type ToolCost struct {
    TokensPerCall    int
    TokensPerMB       int
    BaseCost          float64
    PerSecondCost     float64
    EstimatedAPICost   float64
}

func (t *ToolRegistry) calculateCost(manifest *ToolManifest, params interface{}, duration time.Duration) *CostBreakdown {
    cost := &CostBreakdown{
        ToolName: manifest.Name,
    }

    if manifest.Cost != nil {
        cost.Tokens = manifest.Cost.TokensPerCall
        cost.API = manifest.Cost.BaseCost

        // Add per-second cost
        cost.API += manifest.Cost.PerSecondCost * duration.Seconds()

        // Add token cost for file sizes
        if fileSize, ok := params.(map[string]interface{})["file_size_mb"]; ok {
            cost.Tokens += int(fileSize.(float64)) * manifest.Cost.TokensPerMB
        }
    }

    return cost
}
```

## Latency Estimation

```go
func (t *ToolLatency) Estimate(fileSizeMB int64, serverLoad float64) time.Duration {
    base := time.Duration(t.P50Ms) * time.Millisecond

    // Scale by file size
    sizeFactor := 1.0 + float64(fileSizeMB)/10.0

    // Scale by server load
    loadFactor := 1.0 + serverLoad

    // P95 estimate
    estimate := base * time.Duration(sizeFactor*loadFactor)

    return estimate
}
```

## Permission Checking

```go
type Permission struct {
    Capability Capability
    Resource   string  // Supports templating: {path}, {cwd}
}

func (r *ToolRegistry) checkPermissions(manifest *ToolManifest, params interface{}) error {
    paramsMap, ok := params.(map[string]interface{})
    if !ok {
        return nil
    }

    for _, perm := range manifest.Permissions {
        // Expand template
        resource := expandTemplate(perm.Resource, paramsMap)

        // Check against capability system
        if err := r.capabilityChecker.Check(perm.Capability, resource); err != nil {
            return err
        }
    }

    return nil
}
```

## Directory Structure

```
internal/tools/
    registry.go        # Tool registry
    manifest.go        # Manifest definitions
    validator.go       # JSON schema validation
    cost.go            # Cost calculation
    latency.go         # Latency estimation
    manifests/
        read_file.yaml
        write_file.yaml
        apply_patch.yaml
        exec.yaml
        search_files.yaml
        git_status.yaml
        git_diff.yaml
        run_tests.yaml
        fetch_url.yaml
        store_memory.yaml
        search_memory.yaml
        mcp_call.yaml
```
