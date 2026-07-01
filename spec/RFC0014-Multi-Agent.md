# RFC-0014: Multi-Agent

**Status:** Draft
**Version:** 0.3.4

## Problem

A single agent handles everything. This is:
- Inefficient (different tasks need different models)
- Ineffective (one model can't excel at everything)

## Solution

Implement a multi-agent system:

```
         ┌─────────────────┐
         │   User Request  │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │   Manager Agent │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │     Planner      │
         │   (GPT-4o)       │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │   Task Queue     │
         └────────┬────────┘
                  │
    ┌──────────────┼──────────────┐
    │              │              │
┌───▼───┐    ┌────▼────┐   ┌────▼────┐
│ Coder │    │Reviewer │   │  Docs   │
│ Agent │    │ Agent   │   │  Agent  │
└───┬───┘    └────┬────┘   └────┬────┘
    │              │              │
    └──────────────┴──────────────┘
                  │
         ┌────────▼────────┐
         │   Aggregator    │
         └─────────────────┘
```

## Agent Types

| Agent | Model | Specialty |
|-------|-------|-----------|
| Manager | GPT-4o | Orchestration, user communication |
| Planner | GPT-4o | Task decomposition, estimation |
| Coder | Claude Opus / GPT-5.5 | Code generation |
| Reviewer | Gemini | Security, performance analysis |
| Researcher | GPT-4o | Context gathering, documentation |
| Docs | GPT-4o | Documentation generation |
| Tester | Claude | Test generation |
| DevOps | GPT-4o | Deployment, infrastructure |

## Agent Schema

```json
{
  "id": "agent_coder_001",
  "type": "coder",
  "name": "Primary Coder",
  "model": "claude-opus-4-5",
  "system_prompt": "You are a senior software engineer specializing in...",
  "tools": ["read_file", "apply_patch", "exec", "git_*"],
  "capabilities": ["react", "typescript", "node"],
  "status": "idle",
  "current_task": null
}
```
