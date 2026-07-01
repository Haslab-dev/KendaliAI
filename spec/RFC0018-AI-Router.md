# RFC-0018: AI Router

**Status:** Draft
**Version:** 0.3.4

## Problem

A single model handles all tasks. This is:
- Expensive (GPT-4o for simple tasks)
- Inefficient (wrong model for specialized tasks)
- Limited (no vision, audio, etc.)

## Solution

Build an AI router:

```go
type Router interface {
    SelectModel(ctx context.Context, task *Task) (ModelConfig, error)
    Route(taskType string, input *TaskInput) (ModelConfig, error)
}
```

## Routing Table

| Task Type | Recommended Model | Fallback | Cost Tier |
|-----------|------------------|----------|-----------|
| Planning | GPT-4o | GPT-4 | High |
| Code Generation | Claude Opus | GPT-5.5 | High |
| Code Review | Gemini 2.0 | GPT-4o | Medium |
| Simple Editing | GPT-4o-mini | GPT-4o | Low |
| Text Summarization | GPT-4o-mini | Claude Haiku | Low |
| OCR | Gemini 2.0 | GPT-4o | Medium |
| Vision | GPT-4o | Gemini 2.0 | High |
| Embedding | text-embedding-3-large | text-embedding-ada | Low |
| Transcription | Whisper | GPT-4o-audio | Medium |

## Model Config Schema

```json
{
  "name": "claude-opus-4-5",
  "provider": "anthropic",
  "endpoint": "https://api.anthropic.com/v1",
  "capabilities": ["code", "reasoning", "long_context"],
  "max_tokens": 200000,
  "cost_per_1k_input": 0.015,
  "cost_per_1k_output": 0.075,
  "context_window": 200000
}
```

## Router Implementation

```go
func (r *Router) SelectModel(ctx context.Context, task *Task) (ModelConfig, error) {
    switch {
    case task.Type == "planning":
        return r.selectByCapability("reasoning")
    case task.Type == "code_generation" && len(task.Files) > 10:
        return r.selectByCapability("long_context")
    case task.Type == "vision":
        return r.selectByCapability("vision")
    case task.Type == "simple_edit":
        return r.selectByCost("lowest")
    default:
        return r.selectByCapability("code")
    }
}
```
