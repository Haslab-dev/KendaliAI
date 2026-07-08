# RFC-0043 — Multi-Agent Orchestration

**Status:** Draft

**Author:** KendaliAI

**Target:** v1.1

**Type:** Runtime / Workflow

---

# 1. Summary

This RFC defines how multiple Agents collaborate to accomplish complex goals.

Rather than relying on a single monolithic Agent, KendaliAI decomposes work into specialized Tasks executed by multiple Agents coordinated by the Workflow Engine and Supervisor.

Agents communicate through the Agent Kernel using Events, Mailboxes, and the Blackboard.

---

# 2. Motivation

Large goals often require different expertise.

Example:

```
Build an e-commerce application.
```

A single Agent must simultaneously:

- design architecture
- implement backend
- implement frontend
- write tests
- review code
- prepare documentation

This limits scalability and parallelism.

Instead, KendaliAI distributes work across specialized Agents.

---

# 3. Design Principles

Multi-Agent execution follows these principles:

- one workflow
- multiple Agents
- shared goal
- isolated execution
- coordinated communication
- deterministic orchestration

Agents never coordinate themselves.

The Workflow Engine owns orchestration.

---

# 4. Architecture

```
                 User Goal
                     │
                     ▼
              Workflow Engine
                     │
                     ▼
               Supervisor Agent
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
 Coding Agent  Research Agent  Reviewer Agent
        │            │            │
        └────────────┼────────────┘
                     ▼
                Workflow Result
```

The Supervisor manages Agent lifecycle.

The Workflow Engine manages execution order.

---

# 5. Agent Roles

Agents may specialize through manifests.

Examples:

- Planner
- Coding
- Research
- Reviewer
- Writer
- Analyst
- Personal Assistant

New Agent types may be added without changing the runtime.

---

# 6. Task Delegation

The Workflow Engine decomposes goals into Tasks.

Example

```
Goal

↓

Frontend

Backend

Database

Documentation
```

Each Task is assigned to the most appropriate Agent.

---

# 7. Parallel Execution

Independent Tasks execute concurrently.

```
Planner

↓

Backend
Frontend
Database

↓

Reviewer

↓

Complete
```

Dependent Tasks remain sequential.

---

# 8. Communication

Agents communicate only through the Agent Kernel.

Supported mechanisms:

- Mailbox
- Event Bus
- Blackboard

Direct Agent-to-Agent communication is prohibited.

---

# 9. Blackboard

The Blackboard is shared workspace for collaboration.

Agents publish:

- observations
- findings
- questions
- intermediate results

Other Agents may subscribe to relevant entries.

The Blackboard is temporary and scoped to the Workflow.

---

# 10. Workflow Ownership

The Workflow Engine owns:

- Task Graph
- execution order
- dependencies
- retries
- cancellation
- completion

Agents execute Tasks only.

Agents never modify the Workflow.

---

# 11. Failure Handling

If an Agent fails:

```
Agent Failure

↓

Retry

↓

Reassign

↓

Escalate

↓

Human Approval
```

The Workflow continues whenever possible.

---

# 12. Human Approval

Certain operations require approval.

Examples:

- deleting files
- force push
- production deployment
- database migration

The Workflow pauses until approval is received.

---

# 13. Progress Reporting

Progress is aggregated across all Agents.

Example

```
Workflow

40%

✓ Research

✓ Planning

⏳ Coding

Waiting Review
```

User-facing Channels receive Workflow progress rather than individual Agent logs.

---

# 14. Session Integration

Every Workflow belongs to a Session.

Shared resources include:

- Workspace
- Blackboard
- Memory
- Artifact Graph
- Checkpoints

Agents never own these resources.

---

# 15. Dynamic Scaling

The Supervisor may spawn additional Agents when required.

Example

```
Coding Agent

↓

Large Refactor

↓

Spawn

Coding Agent #2

Coding Agent #3
```

Additional Agents are terminated when Tasks complete.

---

# 16. Runtime Model

```go
type Workflow struct {
    Goal
    TaskGraph
    Agents
    Blackboard
    Workspace
    Session
}
```

```go
type AgentAssignment struct {
    AgentID
    TaskID
    State
}
```

---

# 17. Security

All Agent operations remain subject to:

- Capability Runtime
- Policy Engine
- Sandbox Runtime
- Approval Gate

Multi-Agent execution does not bypass security.

---

# 18. Future Extensions

Future work includes:

- Distributed Agent Clusters
- Remote Agent Execution
- Agent Affinity
- Cost-Based Scheduling
- Model-Aware Routing
- Swarm Execution
- Hierarchical Supervisors

---

# 19. Relationship to Other RFCs

| RFC | Relationship |
|------|--------------|
| RFC-0005 | Planner produces Tasks for orchestration |
| RFC-0020 | Workflow Engine owns orchestration |
| RFC-0025 | Resource Manager allocates runtime resources |
| RFC-0026 | Blackboard enables Agent collaboration |
| RFC-0027 | Policy Engine governs Agent capabilities |
| RFC-0028 | Checkpoint Manager preserves Workflow state |
| RFC-0030 | Task Graph defines execution dependencies |
| RFC-0041 | Agents load Skills during execution |
| RFC-0042 | Defines the Generic Agent Runtime used by orchestration |