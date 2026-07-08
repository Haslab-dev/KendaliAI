# RFC-0041 — Unified Skill Package (USP)

**Status:** Draft

**Author:** KendaliAI

**Target:** v1.1

**Type:** Architecture / Packaging

---

# 1. Summary

This RFC defines the **Unified Skill Package (USP)**, also known as the **Kendali Skill Package (KSP)**, the canonical package format for reusable domain knowledge, specialization prompts, and executable tools in KendaliAI.

A Skill is a **passive package** consumed by one or more Agents. Skills never perform reasoning, execute autonomously, or communicate directly with users. All reasoning and orchestration are owned by the Agent Runtime.

USP is designed to be **Markdown-First**, allowing skills to be defined by a single Markdown file (`SKILL.md`) containing YAML frontmatter configuration and a markdown prompt body. This format is fully aligned with and maps directly to Claude Skills and Hermes Skills.

```
External Format (Claude / Hermes)
                │
                ▼
          Skill Importer
                │
                ▼
      Unified Skill Package (SKILL.md + optional dirs)
                │
                ▼
        Agent RuntimeSpecialization
```

---

# 2. Design Principles

A Skill is:

- **Passive:** Contains only instructions, prompt specialization, references, and tool definitions. It cannot execute on its own.
- **Markdown-First:** Easy to write, read, and version control using standard Markdown.
- **Agent-Independent:** Can be loaded by any generic agent (e.g., Coding, Reviewer, Planner) to specialize it for a domain.
- **Self-Contained:** Encapsulates instructions, references, and tool scripts in a flat structure.

---

# 3. Responsibilities

## Agent

Responsible for:
- Reasoning, planning, and decision making.
- Dialogue flow and managing user conversation.
- Selecting which loaded tools to execute.
- State management and memory.

## Skill

Responsible for:
- Domain knowledge and prompt specialization rules.
- Reusable resources and reference materials.
- Flat tool definitions and executable scripts.

---

# 4. Goals

The package format supports:
- Reusable specialization prompts (in `SKILL.md`).
- Flat, easy-to-read reference documents (in `references/`).
- Simple executable tools (in `scripts/`).
- Declaring metadata, keywords, and simple capability requirements via frontmatter.
- Rapid import from popular formats (e.g., Claude.ai Skills, Hermes).

---

# 5. Skill Layout

A Skill Package can be distributed as a single `SKILL.md` file (for instruction-only skills) or as a flat directory structure for execution-heavy skills:

```
swiftui/
├── SKILL.md           # Manifest (YAML Frontmatter) + System Prompt (Markdown Body)
├── scripts/           # Optional: Executable scripts / tools
├── references/        # Optional: Flat folder containing markdown docs / guidelines
├── assets/            # Optional: Flat folder containing images or other media files
└── templates/         # Optional: Flat folder containing code templates or skeletons
```

Runtime-generated embeddings and cached vector stores are stored in the runtime cache directory (`~/.kendaliai/cache/skills/`) and are never distributed inside the skill package itself.

---

# 6. SKILL.md Format (Manifest & Prompt)

Every Skill contains a core `SKILL.md` (or `skill.md`). The top of the file contains the manifest as YAML frontmatter:

```markdown
---
name: SwiftUI Assistant
version: 1.0.0
description: Spezialisasi dalam pengembangan aplikasi native iOS menggunakan SwiftUI.
author: HasLab
license: MIT
keywords: [swiftui, ios, mobile]
tools:
  allowed: [read_file, apply_patch, write_file]
---

You are a senior iOS engineer specializing in SwiftUI. Always follow these rules:
1. Keep views small and compostable.
2. Use `@State` and `@Binding` correctly for state flow.
3. Prefer declarative design patterns.
```

## Frontmatter Fields
- `name`: Human-readable name of the skill.
- `version`: Semantic versioning of the skill.
- `description`: A brief summary of what the skill specializing in.
- `author` / `license`: Author name and licensing information.
- `keywords`: Array of tags used for dynamic skill routing.
- `tools`: Map specifying allowed or denied system tools, or custom definition mappings.

---

# 7. Dependencies

Skills can list raw environment dependency recommendations in their frontmatter:

```yaml
---
dependencies:
  node: ">=20"
  go: ">=1.24"
  brew: [swiftlint]
---
```

The Agent Runtime does not automatically install system dependencies. If a required dependency is missing, the command `kendaliai doctor <skill>` reports the issue.

---

# 8. Capabilities

Skills declare required capabilities/permissions in the YAML frontmatter:

```yaml
---
capabilities:
  filesystem:
    read: [src/**]
    write: [src/**]
  shell:
    commands: [git, swift, xcodebuild]
---
```

These permissions are checked and enforced by the **Policy Engine** when the agent invokes tools.

---

# 9. Reference Materials

The `references/` folder contains markdown files and text assets containing reusable domain knowledge, guidelines, or APIs.
The runtime indexes these reference materials into the Unified Data Layer at startup, making them searchable by the agent via semantic search or vector queries.

---

# 10. Custom Scripts (Tools)

Executable tools go into the `scripts/` directory:

```
scripts/
├── build.sh
├── test.sh
└── format.sh
```

Tools are exposed to the agent and are run within the **Sandbox Runtime** subject to approval gates.

---

# 11. Tests

Verification tests can be included inside the package:
- Unit tests for script tools.
- Evaluative prompts to verify that the loaded skill specialization yields the correct agent behavior.

---

# 12. Runtime Indexing & Cache

At installation time, the runtime compiles the skill, processes the frontmatter, and creates a searchable vector index:

```
Install Skill (SKILL.md)
           │
           ▼
        Validate
           │
           ▼
    Index References
           │
           ▼
   Generate Embeddings
           │
           ▼
      Ready Cache
```

These artifacts are cached under `~/.kendaliai/cache/skills/<id>/vectors.db` and are not committed to source repositories.

---

# 13. Agent Integration

When an agent is initialized, it dynamically loads its default skills or workflow-specified skills. The runtime merges the prompt from the `SKILL.md` body into the agent's system prompt and registers the custom scripts from the `scripts/` folder.

```
Generic Agent (Coder)
         │
  Loads SwiftUI Skill
         │
  Merges Prompt Body
         │
  Registers Scripts (scripts/)
         │
         ▼
  Ready to Execute Tasks
```

---

# 14. Importers

Unified Skill Package maps directly to popular formats:
- **Claude Skills:** Converted by reading the Anthropic JSON manifest and wrapping the system instructions into a standard `SKILL.md` file.
- **Hermes Skills:** Python-decorated methods are translated into executable CLI script wrappers under the `scripts/` directory, and their decorators are extracted into the `SKILL.md` frontmatter.

---

# 15. Installation

```bash
kendaliai skill add https://github.com/example/swiftui-skill
```

---

# 16. Updates

```bash
kendaliai skill update swiftui
```

---

# 17. Runtime Model

In the Go runtime, the skill structure represents the simplified specification:

```go
type Skill struct {
    Spec     SkillSpec // Parsed from YAML frontmatter
    Prompt   string    // Markdown body of SKILL.md
    Examples string    // Optional examples content
}
```

---

# 18. Security

Every tool execution initiated by a skill script passes through the Sandbox Runtime and is evaluated against the Policy Engine and Approval Gates. Skills cannot elevate permissions beyond what is allowed by the Agent Manifest policies.

---

# 19. Future Extensions
- Signed skill packages for secure execution.
- Skill marketplace and centralized registry distribution.
- Semantic dependency resolution.

---

# 20. Relationship to Other RFCs

| RFC | Relationship |
|------|--------------|
| RFC-0019 | Skills specialization prompts are consumed by Generic Agent Runtime |
| RFC-0024 | Custom script tools execute through the Capability Runtime |
| RFC-0027 | Skill capability requests are enforced by the Policy Engine |
| RFC-0039 | References and docs are indexed into the Unified Data Layer |
| RFC-0042 | Generic Agents dynamically load the compiled skills |
| RFC-0044 | Agent manifests declare default skills to load |