# RFC-0045 — Model Router & Inference Policy

**Status:** Draft

**Author:** KendaliAI

**Target:** v1.1

**Type:** AI Runtime

---

# 1. Summary

This RFC introduces the Model Router, responsible for selecting the most appropriate AI model for every inference request.

Agents never call LLM providers directly.

All inference requests pass through the Model Router.

---

# 2. Motivation

Different models excel at different tasks.

Examples

- Coding
- Reasoning
- Vision
- Long Context
- Fast Chat
- Low Cost

Selecting a model should be automatic.

---

# 3. Architecture

```
Agent

↓

Model Router

↓

Inference Policy

↓

Provider

↓

Model

↓

Response
```

---

# 4. Responsibilities

The Model Router is responsible for:

- model selection
- provider selection
- fallback
- retries
- cost optimization
- latency optimization
- context window validation

---

# 5. Routing Inputs

The router evaluates:

- Agent Type
- Task Type
- Required Skills
- Context Length
- Budget
- User Preferences
- Provider Availability

---

# 6. Example

```
Coding Agent

↓

Task

Port React Native to SwiftUI

↓

Router

↓

Claude Sonnet
```

```
Research Agent

↓

Summarize paper

↓

Gemini
```

```
Personal Agent

↓

Quick reminder

↓

GPT-4.1 Mini
```

---

# 7. Routing Policy

Example

```yaml
routing:

  coding:

    preferred:

      - claude-sonnet

      - gpt-5

  research:

    preferred:

      - gemini

      - gpt-5

  review:

    preferred:

      - claude-sonnet

  writing:

    preferred:

      - gpt-5
```

---

# 8. Fallback

If a provider fails

```
Claude

↓

Timeout

↓

GPT-5

↓

Success
```

The Agent remains unaware.

---

# 9. Cost Policy

Policies may optimize for:

- Lowest Cost
- Highest Quality
- Fastest Response
- Balanced

---

# 10. Provider Abstraction

Supported providers include

- OpenAI
- Anthropic
- Google
- OpenRouter
- Ollama
- LM Studio
- Local Providers

Adding providers never changes Agent code.

---

# 11. Runtime API

```go
type InferenceRequest struct {
    AgentID string

    TaskType string

    Skills []string

    ContextTokens int
}

type ModelSelection struct {
    Provider string

    Model string
}
```

---

# 12. Future Extensions

Planned additions

- Automatic benchmarking
- Health-aware routing
- Prompt caching
- Response caching
- Multi-model ensemble
- Cost analytics

---

# 13. Relationship

| RFC | Relationship |
|------|--------------|
| RFC0042 | Agents submit inference requests |
| RFC0043 | Workflow Engine coordinates Agent execution |
| RFC0044 | Agent manifests define preferred models |