# RFC-0032: Prompt Compiler

**Status:** Draft
**Version:** 0.3.4
**Depends on:** RFC-0029, RFC-0031

## Problem

Currently prompts are concatenated strings:

```go
func (p *Planner) CreatePlan(ctx context.Context, goal string) string {
    return "You are a planner.\n" +
        "Goal: " + goal + "\n" +
        "Context: " + context.Files + context.Memories + "\n" +
        "Capabilities: " + capabilities + "\n" +
        "Policy: " + policies + "\n"
}
```

This is:
- Hard to version
- Impossible to test
- Difficult to maintain
- Error-prone (missing fields)

## Solution

```
Manifest (system prompt)
    │
    ▼
Memory (from context)
    │
    ▼
Context (files, artifacts, etc.)
    │
    ▼
Policy (security rules)
    │
    ▼
Capabilities (tool definitions)
    │
    ▼
Prompt Compiler
    │
    ├── Template Engine
    ├── Variable Resolver
    ├── Validation
    └── Versioning
    │
    ▼
Final Prompt
```

## Prompt Compiler Interface

```go
type PromptCompiler interface {
    // Compile a prompt from components
    Compile(ctx context.Context, req *CompileRequest) (*CompiledPrompt, error)

    // Validate a prompt template
    Validate(template *PromptTemplate) error

    // Get version history
    GetVersionHistory(promptID string) ([]*PromptVersion, error)
}

type CompileRequest struct {
    PromptID   string
    Version    string  // Optional, latest if empty
    Variables  map[string]interface{}
    Context    *context.Context
    Capabilities []Capability
    Policies    []Policy
}

type CompiledPrompt struct {
    ID         string
    PromptID   string
    Version    string
    System     string
    User       string
    TotalTokens int
    Variables  map[string]interface{}
    CompiledAt time.Time
}
```

## Prompt Template Schema

```go
type PromptTemplate struct {
    ID          string
    Name        string
    Description string
    Version     string
    CreatedAt   time.Time
    UpdatedAt   time.Time

    // Template sections
    SystemTemplate string  // {{system}}
    UserTemplate   string  // {{user}}
    ContextTemplate string // {{context}}

    // Variable definitions
    Variables []VariableDef

    // Validation rules
    Validations []Validation
}

type VariableDef struct {
    Name     string
    Type     VariableType
    Required bool
    Default  interface{}
    Validate *Validator
}

type VariableType string

const (
    VarString  VariableType = "string"
    VarInt     VariableType = "int"
    VarFloat   VariableType = "float"
    VarBool    VariableType = "bool"
    VarArray   VariableType = "array"
    VarObject  VariableType = "object"
)
```

## Example: Planner Prompt Template

```yaml
id: planner-prompt
name: Planner Prompt
version: "1.0.0"

system: |
  You are a task planner for an autonomous coding agent.

  Your role is to decompose user goals into executable tasks.

  Rules:
  - Break down complex tasks into atomic steps
  - Each task should be verifiable
  - Respect dependencies between tasks
  - Consider error handling and retries

user: |
  Goal: {{goal}}

  {{#if parent_goal}}
  Parent Goal: {{parent_goal}}
  {{/if}}

context: |
  {{#if files}}
  Relevant Files:
  {{#each files}}
  - {{path}} ({{lines}})
    {{summary}}
  {{/each}}
  {{/if}}

  {{#if memories}}
  Relevant Memories:
  {{#each memories}}
  - [{{hierarchy}}] {{value}}
  {{/each}}
  {{/if}}

  {{#if blackboard}}
  Team Notes:
  {{#each blackboard}}
  - [{{type}}] {{content}} ({{author}})
  {{/each}}
  {{/if}}

variables:
  - name: goal
    type: string
    required: true

  - name: parent_goal
    type: string
    required: false

  - name: files
    type: array
    required: false

  - name: memories
    type: array
    required: false

  - name: blackboard
    type: array
    required: false
```

## Template Engine

```go
type TemplateEngine struct {
    funcs map[string]TemplateFunc
}

type TemplateFunc func(args ...interface{}) (string, error)

func (e *TemplateEngine) Register(name string, fn TemplateFunc) {
    e.funcs[name] = fn
}

func (e *TemplateEngine) Execute(template string, data map[string]interface{}) (string, error) {
    // Parse template
    // Replace {{variable}} with data
    // Execute {{#if}} conditionals
    // Execute {{#each}} loops
    // Execute {{#switch}} blocks
    // Apply filters: {{var | uppercase}}
}
```

## Built-in Template Functions

```go
func registerBuiltins(e *TemplateEngine) {
    // String functions
    e.Register("uppercase", func(args ...interface{}) (string, error) {
        return strings.ToUpper(args[0].(string)), nil
    })
    e.Register("lowercase", func(args ...interface{}) (string, error) {
        return strings.ToLower(args[0].(string)), nil
    })
    e.Register("truncate", func(args ...interface{}) (string, error) {
        s := args[0].(string)
        max := args[1].(int)
        if len(s) > max {
            return s[:max] + "...", nil
        }
        return s, nil
    })

    // Array functions
    e.Register("first", func(args ...interface{}) (string, error) {
        arr := args[0].([]interface{})
        if len(arr) == 0 {
            return "", nil
        }
        return fmt.Sprintf("%v", arr[0]), nil
    })
    e.Register("count", func(args ...interface{}) (string, error) {
        arr := args[0].([]interface{})
        return fmt.Sprintf("%d", len(arr)), nil
    })

    // Formatting
    e.Register("json", func(args ...interface{}) (string, error) {
        b, _ := json.Marshal(args[0])
        return string(b), nil
    })
    e.Register("join", func(args ...interface{}) (string, error) {
        arr := args[0].([]interface{})
        sep := args[1].(string)
        var parts []string
        for _, v := range arr {
            parts = append(parts, fmt.Sprintf("%v", v))
        }
        return strings.Join(parts, sep), nil
    })
}
```

## Variable Resolution

```go
type VariableResolver struct {
    providers []VariableProvider
}

type VariableProvider interface {
    Provide(name string) (interface{}, bool)
}

func (r *VariableResolver) Resolve(vars []VariableDef, data map[string]interface{}) (map[string]interface{}, error) {
    result := make(map[string]interface{})

    for _, v := range vars {
        value, ok := r.getValue(v.Name, data)
        if !ok {
            if v.Required {
                return nil, fmt.Errorf("required variable %s not provided", v.Name)
            }
            value = v.Default
        }

        if v.Validate != nil {
            if err := v.Validate.Check(value); err != nil {
                return nil, fmt.Errorf("variable %s validation failed: %w", v.Name, err)
            }
        }

        result[v.Name] = value
    }

    return result, nil
}

func (r *VariableResolver) getValue(name string, data map[string]interface{}) (interface{}, bool) {
    // Check explicit data first
    if v, ok := data[name]; ok {
        return v, true
    }

    // Check providers
    for _, p := range r.providers {
        if v, ok := p.Provide(name); ok {
            return v, true
        }
    }

    return nil, false
}
```

## Prompt Validation

```go
type Validator struct {
    checks []ValidationCheck
}

type ValidationCheck func(value interface{}) error

func (v *Validator) Check(value interface{}) error {
    for _, check := range v.checks {
        if err := check(value); err != nil {
            return err
        }
    }
    return nil
}

func (v *Validator) AddCheck(name string, check ValidationCheck) {
    v.checks = append(v.checks, check)
}

// Built-in validators
var (
    MinLength = func(min int) ValidationCheck {
        return func(value interface{}) error {
            s := value.(string)
            if len(s) < min {
                return fmt.Errorf("length %d < min %d", len(s), min)
            }
            return nil
        }
    }

    MaxLength = func(max int) ValidationCheck {
        return func(value interface{}) error {
            s := value.(string)
            if len(s) > max {
                return fmt.Errorf("length %d > max %d", len(s), max)
            }
            return nil
        }
    }

    Pattern = func(regex string) ValidationCheck {
        re := regexp.MustCompile(regex)
        return func(value interface{}) error {
            s := value.(string)
            if !re.MatchString(s) {
                return fmt.Errorf("pattern %s not matched", regex)
            }
            return nil
        }
    }

    InChoices = func(choices ...string) ValidationCheck {
        set := make(map[string]bool)
        for _, c := range choices {
            set[c] = true
        }
        return func(value interface{}) error {
            s := value.(string)
            if !set[s] {
                return fmt.Errorf("value %s not in choices", s)
            }
            return nil
        }
    }
)
```

## Prompt Versioning

```go
type PromptVersion struct {
    ID         string
    PromptID   string
    Version    string
    Template   *PromptTemplate
    Compiled   *CompiledPrompt
    CreatedAt  time.Time
    CreatedBy  string
    ChangeNote string
}

type PromptVersionStore interface {
    Save(ctx context.Context, version *PromptVersion) error
    Get(ctx context.Context, promptID, version string) (*PromptVersion, error)
    List(ctx context.Context, promptID string) ([]*PromptVersion, error)
    GetLatest(ctx context.Context, promptID string) (*PromptVersion, error)
}
```

## Prompt Compilation Example

```go
func (c *PromptCompiler) Compile(ctx context.Context, req *CompileRequest) (*CompiledPrompt, error) {
    // Get template
    tmpl, err := c.store.Get(ctx, req.PromptID, req.Version)
    if err != nil {
        return nil, err
    }

    // Validate template
    if err := c.Validate(tmpl); err != nil {
        return nil, err
    }

    // Gather variables
    vars, err := c.resolver.Resolve(tmpl.Variables, req.Variables)
    if err != nil {
        return nil, err
    }

    // Add context variables
    vars["goal"] = req.Goal
    if req.Context != nil {
        vars["files"] = req.Context.Files
        vars["memories"] = req.Context.Memories
        vars["blackboard"] = req.Context.Blackboard
    }

    // Compile sections
    system, err := c.engine.Execute(tmpl.SystemTemplate, vars)
    if err != nil {
        return nil, fmt.Errorf("system template: %w", err)
    }

    user, err := c.engine.Execute(tmpl.UserTemplate, vars)
    if err != nil {
        return nil, fmt.Errorf("user template: %w", err)
    }

    // Count tokens
    totalTokens := c.tokenizer.Count(system) + c.tokenizer.Count(user)

    return &CompiledPrompt{
        ID:          uuid.New().String(),
        PromptID:    req.PromptID,
        Version:     tmpl.Version,
        System:      system,
        User:        user,
        TotalTokens: totalTokens,
        Variables:   vars,
        CompiledAt:  time.Now(),
    }, nil
}
```

## Prompt Testing

```go
type PromptTest struct {
    ID          string
    PromptID    string
    Version     string
    Input       map[string]interface{}
    ExpectedOutput string
    ActualOutput   string
    Pass         bool
    RunAt        time.Time
}

func (c *PromptCompiler) Test(ctx context.Context, promptID, version string, tests []*PromptTest) error {
    tmpl, err := c.store.Get(ctx, promptID, version)
    if err != nil {
        return err
    }

    for _, test := range tests {
        compiled, err := c.Compile(ctx, &CompileRequest{
            PromptID: promptID,
            Version:  version,
            Variables: test.Input,
        })
        if err != nil {
            test.ActualOutput = err.Error()
            test.Pass = false
            continue
        }

        // Simple output validation (could be more sophisticated)
        test.ActualOutput = compiled.System + "\n" + compiled.User
        test.Pass = strings.Contains(test.ActualOutput, test.ExpectedOutput)
        test.RunAt = time.Now()
    }

    return nil
}
```

## Directory Structure

```
internal/prompts/
    compiler.go      # Main compiler
    template.go     # Template definitions
    engine.go       # Template execution
    resolver.go     # Variable resolution
    validator.go    # Validation
    versioning.go   # Version management
    tokenizer.go    # Token counting
    templates/      # Prompt templates
        planner.yaml
        coder.yaml
        reviewer.yaml
        researcher.yaml
```
