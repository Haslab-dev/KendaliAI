 **RFC-0041 — Unified Skill Package Format (KSP)**

Below is a production-grade RFC.

---

# RFC-0041 — Unified Skill Package Format (KSP)

**Status:** Draft

**Author:** KendaliAI

**Target:** v1.1

**Type:** Architecture / Packaging

---

# 1. Summary

This RFC introduces the **Kendali Skill Package (KSP)**, a canonical package format for distributing reusable agent skills.

Rather than executing third-party skill formats directly, KendaliAI imports external skills (Anthropic Skills, Hermes Skills, RigorPilot Skills, local repositories, etc.) into one internal representation.

This provides:

* consistent runtime behavior
* versioned skills
* dependency management
* security policies
* update mechanism
* capability declarations
* sandbox compatibility

The runtime understands only KSP.

---

# 2. Motivation

Today multiple incompatible ecosystems exist.

Examples:

* Anthropic Skills
* Hermes Skills
* RigorPilot Skills
* OpenCode Skills
* Local Git repositories

Each has different layouts.

Instead of supporting every runtime format,

KendaliAI standardizes everything into one format.

```
Git Repository
        │
        ▼
Skill Importer
        │
 Detect Format
        │
        ▼
 Normalize
        │
        ▼
 Kendali Skill Package
        │
        ▼
 Runtime
```

---

# 3. Goals

The package format must support

* reusable prompts
* reusable examples
* reusable templates
* executable tools
* dependency installation
* versioning
* updates
* permissions
* sandbox execution
* indexing
* embeddings
* policy enforcement

---

# 4. Skill Layout

```
frontend-design/

├── skill.yaml
├── README.md
├── LICENSE

├── prompt.md
├── examples.md

├── resources/
│     templates/
│     snippets/
│     assets/

├── tools/
│     install.sh
│     build.sh
│     lint.sh
│     format.sh

├── hooks/
│     pre_run.sh
│     post_run.sh

├── embeddings/
│     vectors.bin

├── metadata.json

└── tests/
```

Everything required by the skill lives inside one directory.

---

# 5. Manifest

Every package contains

```
skill.yaml
```

Example

```yaml
name: frontend-design

displayName: Frontend Design

description: Modern React frontend engineering

version: 1.2.0

author: Anthropic

license: MIT

homepage: https://github.com/anthropics/skills

repository: https://github.com/anthropics/skills

keywords:

  - react
  - ui
  - frontend
  - tailwind

categories:

  - web
  - design

entrypoints:

  prompt: prompt.md
  examples: examples.md

minimumVersion: 1.1.0
```

---

# 6. Dependencies

Skills may declare required software.

```yaml
dependencies:

  node:

    version: ">=20"

  bun:

    version: ">=1.2"

  go:

    version: ">=1.24"

  docker: true

packages:

  npm:

    - react

    - vite

    - tailwindcss

  apt:

    - ffmpeg

  brew:

    - imagemagick
```

The runtime never installs automatically.

Instead

```
kendaliai doctor
```

reports missing dependencies.

---

# 7. Capability Manifest

Every skill declares required permissions.

```yaml
capabilities:

  filesystem:

    read:

      - src/**

    write:

      - src/**

  shell:

    commands:

      - npm

      - bun

      - git

  network:

    domains:

      - api.github.com

      - registry.npmjs.org

  environment:

      - OPENAI_API_KEY
```

These integrate with

RFC-0027 Policy Engine.

---

# 8. Tools

Skills may expose reusable tools.

```
tools/

install.sh

build.sh

test.sh

lint.sh

format.sh
```

Manifest

```yaml
tools:

  install:

      path: tools/install.sh

  build:

      path: tools/build.sh

  lint:

      path: tools/lint.sh
```

Execution always goes through

SandboxRuntime.

Skills never execute directly.

---

# 9. Hooks

Lifecycle hooks

```
hooks/

pre_run.sh

post_run.sh

pre_install.sh

post_install.sh
```

Manifest

```yaml
hooks:

  install:

      pre: hooks/pre_install.sh

      post: hooks/post_install.sh

  execution:

      pre: hooks/pre_run.sh

      post: hooks/post_run.sh
```

---

# 10. Resources

Reusable assets.

```
resources/

templates/

snippets/

assets/

docs/
```

Example

```
templates/

landing-page.tsx

pricing.tsx

navbar.tsx
```

---

# 11. Embeddings

Optional semantic search.

```
embeddings/

vectors.bin
```

Indexed into

VectorStore

during installation.

---

# 12. Importers

KendaliAI supports multiple source formats.

```
Anthropic Skills

↓

AnthropicImporter

↓

KSP
```

```
Hermes Skills

↓

HermesImporter

↓

KSP
```

```
RigorPilot

↓

RigorPilotImporter

↓

KSP
```

```
Generic Git Repository

↓

GenericImporter

↓

KSP
```

---

# 13. Installation

```
kendaliai skill add \
https://github.com/anthropics/skills \
--skill frontend-design
```

Pipeline

```
Clone

↓

Detect format

↓

Convert

↓

Validate

↓

Install

↓

Index

↓

Embed

↓

Ready
```

---

# 14. Updates

Every installed skill records

```
origin repository

commit

version
```

Updating

```
kendaliai skill update frontend-design
```

Pipeline

```
Fetch

↓

Compare Version

↓

Reimport

↓

Reindex

↓

Done
```

---

# 15. Runtime Model

The runtime never knows where the skill originated.

Every installed package becomes

```go
type Skill struct {
    Manifest
    Prompt
    Examples
    Resources
    Tools
    Hooks
    Embeddings
}
```

---

# 16. Security

Every executable action passes through

* Policy Engine
* Sandbox Runtime
* Approval Gate
* Capability Runtime

A skill cannot bypass runtime policies.

---

# 17. Future Extensions

Planned additions include:

* Skill Marketplace
* Signed skill packages
* Skill dependency resolution
* Semantic version constraints
* Private repositories
* Cloud skill registry
* Skill bundles
* OCI/distributed package transport

---

# 18. Relationship to Other RFCs

| RFC               | Relationship                                                         |
| ----------------- | -------------------------------------------------------------------- |
| RFC-0006          | Tool execution uses the Execution Engine                             |
| RFC-0024          | Tool invocations go through the Capability Runtime                   |
| RFC-0027          | Capability declarations are enforced by the Policy Engine            |
| RFC-0039          | Skill resources are indexed into the Unified Data Layer              |
| RFC-0040          | Workspace Intelligence indexes installed skill templates and symbols |
| RFC-0042 (Future) | Remote Skill Registry & Marketplace                                  |

## Suggested CLI

I would also redesign the CLI to feel like a package manager:

```bash
kendaliai skill init
kendaliai skill add <git-url> --skill frontend-design
kendaliai skill remove frontend-design
kendaliai skill update frontend-design
kendaliai skill update --all
kendaliai skill search react
kendaliai skill list
kendaliai skill info frontend-design
kendaliai skill doctor frontend-design
kendaliai skill verify frontend-design
kendaliai skill export frontend-design
kendaliai skill publish
```

This gives KendaliAI a familiar, extensible workflow similar to `npm`, `cargo`, or `brew`, while maintaining a single canonical skill format internally regardless of the source ecosystem.
