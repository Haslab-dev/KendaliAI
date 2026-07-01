# RFC-0024: Capability Runtime

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0023

## Problem

Currently agents directly use tools:

```
Agent
  │
  ▼
Tool: apply_patch
```

This is inflexible. Tomorrow we might want to use VSCode API, TreeSitter, or AST instead of apply_patch, but the planner would need to change.

## Solution

Capability-based runtime:

```
Agent
  │
  ▼
Capability
  │
  ▼
Runtime
  │
  ▼
Tool
```

## Capability Definition

```go
type Capability string

const (
    // File capabilities
    CapReadFiles    Capability = "read_files"
    CapWriteFiles   Capability = "write_files"
    CapDeleteFiles  Capability = "delete_files"
    CapListFiles    Capability = "list_files"
    CapSearchFiles  Capability = "search_files"

    // Code capabilities
    CapModifyCode   Capability = "modify_code"
    CapReviewCode   Capability = "review_code"
    CapBuildCode    Capability = "build_code"

    // Git capabilities
    CapGitStatus    Capability = "git_status"
    CapGitDiff      Capability = "git_diff"
    CapGitCommit    Capability = "git_commit"
    CapGitBranch    Capability = "git_branch"

    // Execution capabilities
    CapShell        Capability = "shell"
    CapDocker       Capability = "docker"
    CapBuild        Capability = "build"
    CapTest         Capability = "test"

    // Network capabilities
    CapFetchURL     Capability = "fetch_url"
    CapMCP          Capability = "mcp"

    // Memory capabilities
    CapStoreMemory  Capability = "store_memory"
    CapSearchMemory Capability = "search_memory"

    // Analysis capabilities
    CapAnalyze      Capability = "analyze"
    CapPlan         Capability = "plan"
    CapReview       Capability = "review"
)
```

## Capability Mapping

```go
type CapabilityMapping struct {
    Capability   Capability
    Tools        []string
    Runtimes     []RuntimeType
    Description  string
}

var DefaultMappings = []CapabilityMapping{
    {
        Capability: CapReadFiles,
        Tools:      []string{"read_file"},
        Runtimes:   []RuntimeType{RuntimeFileSystem},
        Description: "Read file contents",
    },
    {
        Capability: CapModifyCode,
        Tools:      []string{"apply_patch", "replace_range", "vscode_edit", "treesitter_edit"},
        Runtimes:   []RuntimeType{RuntimeFileSystem, RuntimeVSCode, RuntimeTreeSitter},
        Description: "Modify code files",
    },
    {
        Capability: CapReviewCode,
        Tools:      []string{"ast_analyze", "eslint", "golangci"},
        Runtimes:   []RuntimeType{RuntimeAST, RuntimeLinter},
        Description: "Review code for issues",
    },
    {
        Capability: CapBuildCode,
        Tools:      []string{"npm_build", "go_build", "cargo_build", "docker_build"},
        Runtimes:   []RuntimeType{RuntimeShell},
        Description: "Build code projects",
    },
    {
        Capability: CapShell,
        Tools:      []string{"exec"},
        Runtimes:   []RuntimeType{RuntimeShell},
        Description: "Execute shell commands",
    },
    {
        Capability: CapDocker,
        Tools:      []string{"docker_run", "docker_exec"},
        Runtimes:   []RuntimeType{RuntimeDocker},
        Description: "Run Docker containers",
    },
}
```

## Runtime Types

```go
type RuntimeType string

const (
    RuntimeFileSystem RuntimeType = "filesystem"
    RuntimeVSCode     RuntimeType = "vscode"
    RuntimeTreeSitter RuntimeType = "treesitter"
    RuntimeShell     RuntimeType = "shell"
    RuntimeDocker     RuntimeType = "docker"
    RuntimeAST        RuntimeType = "ast"
    RuntimeLinter     RuntimeType = "linter"
    RuntimeMCP        RuntimeType = "mcp"
    RuntimeBrowser    RuntimeType = "browser"
)
```

## Capability Runtime

```go
type CapabilityRuntime struct {
    kernel     Kernel
    registry   *ToolRegistry
    mappings   map[Capability]*CapabilityMapping
    runtimes   map[RuntimeType]Runtime
}

type Runtime interface {
    Name() RuntimeType
    CanExecute(capability Capability, params interface{}) bool
    Execute(ctx context.Context, capability Capability, params interface{}) (*RuntimeResult, error)
}

func (r *CapabilityRuntime) Execute(ctx context.Context, capability Capability, params interface{}) (*RuntimeResult, error) {
    mapping, ok := r.mappings[capability]
    if !ok {
        return nil, fmt.Errorf("capability %s not mapped", capability)
    }

    // Try each runtime in priority order
    for _, rt := range r.getRuntimePriority(mapping) {
        runtime, ok := r.runtimes[rt]
        if !ok {
            continue
        }

        if runtime.CanExecute(capability, params) {
            return runtime.Execute(ctx, capability, params)
        }
    }

    return nil, fmt.Errorf("no runtime available for capability %s", capability)
}

func (r *CapabilityRuntime) getRuntimePriority(mapping *CapabilityMapping) []RuntimeType {
    // Return runtimes in order of preference
    // Prefer safer runtimes (AST) over direct file access
    var priority []RuntimeType

    for _, rt := range mapping.Runtimes {
        switch rt {
        case RuntimeAST, RuntimeTreeSitter:
            priority = append(priority, rt)
        }
    }

    for _, rt := range mapping.Runtimes {
        if !contains(priority, rt) {
            priority = append(priority, rt)
        }
    }

    return priority
}
```

## File System Runtime

```go
type FileSystemRuntime struct {
    toolRegistry *ToolRegistry
}

func (r *FileSystemRuntime) Name() RuntimeType {
    return RuntimeFileSystem
}

func (r *FileSystemRuntime) CanExecute(capability Capability, params interface{}) bool {
    switch capability {
    case CapReadFiles, CapWriteFiles, CapDeleteFiles, CapListFiles, CapSearchFiles:
        return true
    }
    return false
}

func (r *FileSystemRuntime) Execute(ctx context.Context, capability Capability, params interface{}) (*RuntimeResult, error) {
    paramsMap := params.(map[string]interface{})

    var toolName string
    switch capability {
    case CapReadFiles:
        toolName = "read_file"
    case CapWriteFiles:
        toolName = "write_file"
    case CapDeleteFiles:
        toolName = "delete_file"
    case CapListFiles:
        toolName = "list_files"
    case CapSearchFiles:
        toolName = "search_files"
    }

    result, err := r.toolRegistry.Execute(ctx, toolName, paramsMap)
    if err != nil {
        return nil, err
    }

    return &RuntimeResult{
        Capability: capability,
        Runtime:    RuntimeFileSystem,
        Output:     result.Output,
        Cost:       result.Cost,
        Duration:   result.Duration,
    }, nil
}
```

## AST Runtime

```go
type ASTRuntime struct {
    parsers map[string]ASTParser
}

type ASTParser interface {
    ParseFile(path string) (*AST, error)
    FindSymbol(ast *AST, name string) (*Symbol, error)
    FindReferences(ast *AST, symbol *Symbol) ([]*Location, error)
    Edit(oldLoc, newLoc Location, newContent string) error
}

func (r *ASTRuntime) Name() RuntimeType {
    return RuntimeAST
}

func (r *ASTRuntime) CanExecute(capability Capability, params interface{}) bool {
    switch capability {
    case CapReviewCode, CapAnalyze:
        return true
    }
    return false
}

func (r *ASTRuntime) Execute(ctx context.Context, capability Capability, params interface{}) (*RuntimeResult, error) {
    paramsMap := params.(map[string]interface{})

    switch capability {
    case CapReviewCode:
        return r.reviewCode(ctx, paramsMap)
    case CapAnalyze:
        return r.analyze(ctx, paramsMap)
    }

    return nil, fmt.Errorf("unsupported capability %s", capability)
}

func (r *ASTRuntime) reviewCode(ctx context.Context, params map[string]interface{}) (*RuntimeResult, error) {
    path := params["path"].(string)

    parser, ok := r.parsers[getLanguage(path)]
    if !ok {
        return nil, fmt.Errorf("no parser for %s", path)
    }

    ast, err := parser.ParseFile(path)
    if err != nil {
        return nil, err
    }

    issues := r.findIssues(ast)

    return &RuntimeResult{
        Capability: CapReviewCode,
        Runtime:    RuntimeAST,
        Output: map[string]interface{}{
            "path":   path,
            "issues": issues,
        },
    }, nil
}
```

## Capability Agent

Agents use capabilities, not tools:

```go
type CapabilityAgent struct {
    kernel   Kernel
    runtime  *CapabilityRuntime
    manifest *AgentManifest
}

func (a *CapabilityAgent) Execute(ctx context.Context, task *Task) (*Result, error) {
    // Agent receives task with capability requirement
    requiredCapability := task.Capability

    // Runtime selects best tool
    result, err := a.runtime.Execute(ctx, requiredCapability, task.Params)
    if err != nil {
        return nil, err
    }

    return &Result{
        Capability: requiredCapability,
        Runtime:    result.Runtime,
        Output:     result.Output,
    }, nil
}
```

## Security: Capability Policies

```go
type CapabilityPolicy struct {
    Role           ProcessRole
    AllowedCaps    []Capability
    DeniedCaps     []Capability
    MaxFileSizeMB  int64
    AllowedPaths   []string
    DeniedPaths    []string
}

func (p *CapabilityPolicy) CanUse(cap Capability) bool {
    if contains(p.DeniedCaps, cap) {
        return false
    }
    if len(p.AllowedCaps) == 0 {
        return true
    }
    return contains(p.AllowedCaps, cap)
}

// Example policies
var RolePolicies = map[ProcessRole]*CapabilityPolicy{
    RoleCoder: {
        AllowedCaps: []Capability{
            CapReadFiles, CapWriteFiles, CapListFiles, CapSearchFiles,
            CapModifyCode, CapShell, CapGitStatus, CapGitDiff,
            CapBuild, CapTest, CapStoreMemory, CapSearchMemory,
        },
        DeniedCaps: []Capability{
            CapDeleteFiles, CapDocker,
        },
        MaxFileSizeMB: 10,
        AllowedPaths: []string{"src/**", "tests/**"},
    },
    RoleReviewer: {
        AllowedCaps: []Capability{
            CapReadFiles, CapSearchFiles, CapGitStatus, CapGitDiff,
            CapAnalyze, CapReview,
        },
        MaxFileSizeMB: 50,
        AllowedPaths: []string{"**/*.go", "**/*.ts", "**/*.tsx"},
    },
    RoleDevOps: {
        AllowedCaps: []Capability{
            CapReadFiles, CapWriteFiles, CapShell, CapDocker,
            CapGitStatus, CapGitDiff, CapGitCommit,
        },
        MaxFileSizeMB: 100,
        AllowedPaths: []string{"**"},
    },
}
```

## Directory Structure

```
internal/runtime/
    capability.go      # Capability runtime
    runtime.go         # Runtime interface
    runtimes/
        filesystem.go  # File system runtime
        shell.go       # Shell runtime
        ast.go         # AST runtime
        docker.go      # Docker runtime
        mcp.go         # MCP runtime
        vscode.go      # VSCode runtime
    mapping.go         # Capability to tool mapping
    policy.go          # Security policies
```
