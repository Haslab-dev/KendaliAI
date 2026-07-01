# RFC-034 — Dynamic Skill Generation

**Status:** Draft

**Author:** AI Platform Team

**Target Version:** v0.7

---

# Abstract

This RFC introduces **Dynamic Skills**, allowing users to create reusable capabilities from natural language.

Instead of manually writing prompts or code, users can instruct the agent:

> Create a Chef skill.

or

> Create a Golang Tutor skill using Exa search.

The agent researches, synthesizes, validates, and stores the resulting skill.

Once installed, the agent automatically routes future conversations to the appropriate skill.

---

# Motivation

Current AI agents only have static prompts.

Users repeatedly explain context:

> Act like a chef...

> Be my Go mentor...

> Help with Kubernetes...

This context should become reusable.

Skills become installable packages that contain:

* system prompt
* domain knowledge
* workflows
* examples
* tools
* routing rules
* memory preferences

---

# Goals

* Create skills using natural language
* Automatically research missing information
* Store skills locally
* Version skills
* Route conversations automatically
* Allow editing/updating skills
* Support MCP tools during generation

---

# Non Goals

This RFC does not include:

* programming plugins
* executable code
* Docker containers
* sandbox execution

Skills are prompt-based orchestrators.

---

# Architecture

```
             User

               │

       "Create chef skill"

               │

               ▼

      Skill Generator Agent

               │

      ┌────────┴─────────┐
      │                  │
      ▼                  ▼

Collect Information   Research

      │              (Exa MCP)

      └────────┬─────────┘

               ▼

      Generate Skill Spec

               ▼

      Validate Skill

               ▼

      Save Skill

               ▼

      Register Router

               ▼

 Ready for future conversations
```

---

# Skill Lifecycle

```
Draft

↓

Research

↓

Generate

↓

Validate

↓

Installed

↓

Active

↓

Updated

↓

Archived
```

---

# User Experience

## Simple

```
Create a Chef skill.
```

Agent:

```
What cuisine should I specialize in?
```

or

```
I'll research culinary best practices using Exa.
```

---

## Using MCP

```
Create a Chef skill.

Use Exa Search MCP to gather information from reputable cooking websites.
```

---

## Rich Prompt

```
Create a skill named Chef.

Responsibilities:

- cooking
- recipes
- nutrition
- meal planning
- ingredient substitution
- kitchen safety

Use Exa Search MCP.

Generate examples.

Install automatically.
```

---

# Skill Generator Workflow

```
Natural Language

↓

Understand Intent

↓

Extract Requirements

↓

Need More Information?

↓

YES
 Ask User

↓

NO

↓

Research

↓

Generate Skill

↓

Evaluate

↓

Store

↓

Activate
```

---

# Skill Package

Each generated skill is stored as:

```
skills/

    chef/

        skill.yaml

        prompt.md

        examples.md

        metadata.json

        embeddings.bin

        version.json
```

---

# skill.yaml

```yaml
id: chef

name: Chef

version: 1.0.0

description: Cooking assistant

author: AI Generator

routing:

  keywords:

    - recipe

    - cook

    - food

    - ingredient

    - baking

confidence: 0.78

tools:

  - exa-search

  - memory

memory:

  enabled: true

examples:

  enabled: true
```

---

# prompt.md

```
You are an experienced professional chef.

Responsibilities:

- recipes
- meal planning
- cooking techniques
- substitutions
- nutrition
- food safety

Always answer step-by-step.

Never invent dangerous cooking advice.

Suggest alternatives when ingredients are unavailable.
```

---

# metadata.json

```json
{
  "generated_by": "skill-generator",
  "created_at": "...",
  "updated_at": "...",
  "source": [
    "user",
    "exa"
  ]
}
```

---

# Example Skill Generation Prompt

The internal generator prompt may resemble:

```
You are a Skill Generator.

Your job is to produce reusable agent skills.

Generate:

- metadata
- routing keywords
- system prompt
- examples
- constraints
- tools
- suggested memory behavior

Output valid YAML and Markdown.

Do not write implementation code.
```

---

# Automatic Routing

When user says:

```
How do I cook steak?
```

Pipeline:

```
Conversation

↓

Embedding

↓

Intent Detection

↓

Similarity Search

↓

Chef Skill (0.93)

↓

Execute Chef Prompt

↓

Response
```

---

# Routing Example

```
User:

How do I make fried rice?
```

Router

```
Chef

Score:

0.94
```

---

```
User:

How do I deploy Kubernetes?
```

Router

```
DevOps

0.91
```

---

# Skill Registry

```yaml
skills:

  - chef

  - lawyer

  - therapist

  - travel

  - golang

  - react

  - prompt-engineer
```

---

# Updating Skills

User:

```
Update Chef skill.

Add:

- air fryer recipes

- sous vide

- fermentation
```

Pipeline

```
Load Skill

↓

Merge Changes

↓

Validate

↓

Version++

↓

Save
```

---

# Skill Versioning

```
Chef

1.0.0

↓

1.1.0

↓

1.2.0

↓

2.0.0
```

---

# Research Integration

Generator may invoke MCP tools.

Example:

```
Need external knowledge?

YES

↓

Exa Search MCP

↓

Collect Sources

↓

Summarize

↓

Generate Skill
```

Research results become references used during skill synthesis rather than being copied verbatim into prompts.

---

# Example Conversation

```
User:
Create a Chef skill.

Use Exa Search MCP.
```

Agent:

```
Researching culinary references...

✓ Professional cooking techniques
✓ Food safety guidance
✓ Ingredient substitutions
✓ Nutrition fundamentals

Generating reusable skill...

✓ prompt.md
✓ skill.yaml
✓ routing rules
✓ examples
✓ metadata

Installing...

Chef skill installed successfully.
```

---

Later:

```
User:

How do I cook eggs?
```

Router

```
Detected Skill:

Chef
```

Response

```
🥚 There are several ways to cook eggs. Here's a simple fried egg recipe:

Ingredients:
- 1 egg
- 1 tsp butter or oil
- Salt and pepper

Steps:
1. Heat a non-stick pan over medium heat.
2. Add butter or oil.
3. Crack the egg into the pan.
4. Cook for 2–3 minutes until the whites are set.
5. Season and serve.

Tips:
- For a runny yolk, avoid flipping.
- Cover the pan briefly to cook the top without overcooking the yolk.
```

---

# Future Extensions

* Skill marketplace
* Skill sharing/import/export
* Signed skill packages
* Skill dependencies (e.g., `Chef` depends on `Nutrition`)
* RAG-backed knowledge bases
* Tool-specific permissions and policies
* Multi-agent collaboration between skills
* Automatic skill improvement from user feedback
* Scheduled skill refresh using MCP research

## Implementation Recommendation

Rather than storing only a system prompt, model each skill as a declarative package with explicit metadata, routing rules, tools, lifecycle hooks, and examples. For example:

```yaml
apiVersion: skills.rakit.io/v1
kind: Skill

metadata:
  id: chef
  name: Chef
  version: 1.0.0

spec:
  description: Professional culinary assistant

  routing:
    intent:
      - cooking
      - recipes
      - ingredients
    threshold: 0.75

  tools:
    allowed:
      - exa-search
      - memory
      - filesystem:read

  prompt: prompt.md

  examples: examples.md

  constraints:
    - Never fabricate food safety information.
    - Cite sources when using web research.

  lifecycle:
    onInstall:
      - build_embeddings
    onUpdate:
      - regenerate_examples
    onDelete:
      - remove_embeddings
```

This declarative approach keeps the core agent generic while allowing new capabilities to be created, versioned, shared, and routed without modifying Go code. It also aligns well with an OpenClaw-style architecture where skills are treated as first-class, installable assets rather than hardcoded behaviors.
