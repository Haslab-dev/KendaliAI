# RFC-0042 — Generic Agent Runtime

**Status:** Draft

**Author:** KendaliAI

**Target:** v1.1

**Type:** Runtime / Architecture

---

# 1. Summary

This RFC introduces the **Generic Agent Runtime (GAR)**, a unified runtime model for executing all Agents within KendaliAI.

Every Agent is the same runtime process.

Agents differ only by their manifests, prompts, loaded Skills, capabilities, and execution policies.

The runtime does not distinguish between Coding Agents, Research Agents, Review Agents, or future Agent types.

```
Agent Manifest

        │

        ▼

Generic Agent Runtime

        │

        ▼

Reasoning

        │

        ▼

Capability Runtime

        │

        ▼

Execution
```

---

# 2. Motivation

Traditional AI systems implement different Agent types as different code.

Example

```
CodingAgent

ResearchAgent

ReviewerAgent

PlannerAgent
```

This creates duplicated runtime logic.

Instead, KendaliAI provides one runtime capable of executing every Agent.

Behavior is defined by configuration rather than implementation.

---

# 3. Design Principles

Every Agent:

- is a runtime process
- owns reasoning
- consumes Skills
- executes Tasks
- communicates through IPC
- is managed by the Supervisor

Agents never implement business logic internally.

---

# 4. Responsibilities

Agents are responsible for:

- reasoning
- planning
- decision making
- context assembly
- memory retrieval
- Skill selection
- capability invocation
- progress reporting

Agents are not responsible for:

- tool execution
- sandboxing
- policy enforcement
- workflow orchestration
- process scheduling

---

# 5. Agent Lifecycle

```
Create

↓

Initialize

↓

Load Manifest

↓

Load Skills

↓

Build Context

↓

Execute

↓

Report Progress

↓

Terminate
```

Agents may be suspended and resumed by the Supervisor.

---

# 6. Agent Manifest

Every Agent is described by a manifest.

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

allowedCapabilities:

  - filesystem

  - shell

  - git

maxConcurrency: 4
```

The manifest describes behavior.

The runtime remains identical.

---

# 7. Skill Integration

Agents dynamically load Skills.

Example

```
Coding Agent

↓

Coding Skill

↓

SwiftUI Skill

↓

Git Skill
```

Skills extend an Agent's knowledge and capabilities.

Agents never embed domain knowledge directly.

---

# 8. Memory Integration

Agents retrieve memory through the Memory Service.

Supported memory types:

- Working Memory
- Episodic Memory
- Semantic Memory
- Procedural Memory

Memory ownership belongs to the Session.

Agents are stateless outside execution.

---

# 9. Context Assembly

Before execution the Agent requests context from the Context Manager.

Context may include:

- user conversation
- repository index
- relevant Skills
- memory
- artifacts
- workspace state

The Agent never builds context manually.

---

# 10. Capability Execution

Agents never execute tools directly.

Execution flow

```
Agent

↓

Capability Runtime

↓

Policy Engine

↓

Sandbox

↓

Tool

↓

Result

↓

Agent
```

---

# 11. Communication

Agents communicate through the Agent Kernel.

Supported mechanisms:

- IPC
- Mailbox
- Event Bus
- Blackboard

Agents never communicate directly.

---

# 12. Parallel Execution

An Agent may execute multiple Tasks concurrently.

Independent Tasks may run in parallel.

Maximum concurrency is defined by the Agent Manifest.

---

# 13. Progress Reporting

Agents emit structured progress events.

Example

```
Planning

25%

Loading Skills

40%

Executing

75%

Completed

100%
```

Progress is consumed by the Workflow Engine and user-facing Channels.

---

# 14. Checkpoint

The runtime periodically creates checkpoints.

Checkpoint includes:

- execution state
- pending tasks
- loaded Skills
- context references

Checkpoint data is managed by the Checkpoint Manager.

---

# 15. Runtime Model

```go
type Agent struct {
    Manifest

    Session

    Workspace

    Context

    Skills

    Memory

    Capabilities
}
```

---

# 16. Security

All Agent operations are subject to:

- Policy Engine
- Capability Runtime
- Approval Gate
- Sandbox Runtime

Agents cannot bypass runtime security.

---

# 17. Future Extensions

Future work includes:

- Distributed Agents
- Remote Agent Execution
- Persistent Agents
- Agent Marketplace
- Agent Templates
- Agent Cloning
- Hierarchical Supervisors

---

# 18. Relationship to Other RFCs

| RFC | Relationship |
|------|--------------|
| RFC-0000 | Agents execute within the Agent Kernel |
| RFC-0001 | Agents operate inside Sessions |
| RFC-0005 | Planner creates Tasks for Agents |
| RFC-0020 | Workflow Engine manages Agent execution |
| RFC-0024 | Agents invoke tools through the Capability Runtime |
| RFC-0026 | Agents coordinate through the Blackboard |
| RFC-0027 | Agent capabilities are governed by the Policy Engine |
| RFC-0028 | Agent state is checkpointed by the Checkpoint Manager |
| RFC-0041 | Agents consume Skills to specialize themselves |