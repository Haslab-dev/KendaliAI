# RFC-0044 — Agent Registry & Manifest

**Status:** Draft

**Author:** KendaliAI

**Target:** v1.1

**Type:** Runtime / Registry

---

# 1. Summary

This RFC defines how Agents are registered, discovered, configured, and instantiated.

Rather than hardcoding Agent implementations, KendaliAI uses a manifest-driven registry.

Every Agent is created from an Agent Manifest.

The runtime executes only one Generic Agent implementation.

---

# 2. Motivation

Instead of implementing:

- CodingAgent
- ResearchAgent
- ReviewerAgent
- WriterAgent

the runtime loads

```
coding.yaml
research.yaml
reviewer.yaml
writer.yaml
```

Every Agent shares the same runtime.

Behavior is defined entirely by configuration.

---

# 3. Design Principles

- Manifest-driven
- Runtime configurable
- Hot reloadable
- Agent-independent
- Versioned
- Extensible

---

# 4. Registry Layout

```
agents/

coding.yaml

research.yaml

reviewer.yaml

writer.yaml

personal.yaml
```

---

# 5. Agent Manifest

Example

```yaml
id: coding

displayName: Coding Agent

description: Software engineering specialist

systemPrompt: prompts/coding.md

defaultSkills:

  - coding

  - git

  - shell

preferredModels:

  - claude-sonnet

fallbackModels:

  - gpt-5

maxConcurrency: 4

approvalRequired: false
```

---

# 6. Default Skills

Agents automatically load default Skills.

Additional Skills may be attached dynamically by the Workflow Engine.

---

# 7. Agent Discovery

At startup the Registry scans

```
agents/
```

Every manifest is validated and registered.

---

# 8. Runtime Creation

```
Agent Manifest

↓

Registry

↓

Generic Agent Runtime

↓

Running Agent
```

---

# 9. Lifecycle

```
Register

↓

Validate

↓

Ready

↓

Spawn

↓

Suspend

↓

Resume

↓

Terminate
```

---

# 10. Runtime API

```go
type AgentManifest struct {
    ID string

    Prompt string

    DefaultSkills []string

    PreferredModels []string

    MaxConcurrency int
}
```

---

# 11. Relationship

| RFC | Relationship |
|------|--------------|
| RFC0041 | Loads Skills |
| RFC0042 | Defines Generic Agent Runtime |
| RFC0043 | Used by Workflow Engine |
| RFC0045 | Selects models during execution |