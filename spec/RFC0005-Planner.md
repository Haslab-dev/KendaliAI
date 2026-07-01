# RFC-0005: Planner

**Status:** Draft
**Version:** 0.3.4

## Problem

Currently, the LLM directly executes tools. This makes it:
- Difficult to pause and resume
- Impossible to show user the plan before execution
- Prone to running wrong tools due to prompt confusion

## Solution

Introduce a Planner that:
1. Receives user goal
2. Outputs structured JSON plan (never executes)
3. Returns plan to user for confirmation
4. Submits plan to executor

## Planner Interface

```go
type Planner interface {
    CreatePlan(ctx context.Context, goal string, context []Memory) (*Plan, error)
    RefinePlan(ctx context.Context, plan *Plan, feedback string) (*Plan, error)
    EstimateCost(plan *Plan) (inputTokens, outputTokens int)
}
```

## Plan Output Format

```json
{
  "id": "plan_abc123",
  "goal": "Create landing page for product X",
  "tasks": [
    {
      "id": "1",
      "name": "Analyze existing codebase",
      "tool": "read_directory",
      "params": { "path": ".", "recursive": true },
      "estimated_duration": "30s"
    },
    {
      "id": "2",
      "name": "Read existing components",
      "tool": "grep",
      "params": { "pattern": "Component", "include": "*.tsx" },
      "depends_on": ["1"],
      "estimated_duration": "20s"
    }
  ],
  "estimated_total_duration": "5m",
  "estimated_cost": { "input": 5000, "output": 3000 }
}
```

## Planning Prompt Strategy

```
You are a task planner. Given a user goal, create a structured plan.

Output ONLY valid JSON with the following schema:
{
  "goal": "string",
  "tasks": [
    {
      "id": "string",
      "name": "string",
      "tool": "string",
      "params": object,
      "depends_on": ["task_id", ...]
    }
  ]
}

Available tools: read_file, list_files, search_files, apply_patch, replace_range, exec, git_*, run_tests, validate_syntax, fetch_url, store_memory, search_memory, run_skill, mcp_call

Rules:
- Never include actual code in the plan
- Break down complex tasks into atomic steps
- Respect tool dependencies
- Estimate duration for each task
```
