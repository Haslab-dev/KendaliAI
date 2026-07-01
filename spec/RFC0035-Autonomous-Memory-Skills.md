# RFC-0035 — Autonomous Daily Skill Generation & Reflective Memory

**Status:** Draft

**Target Version:** v0.8

---

# Abstract

This RFC introduces an autonomous background process that periodically analyzes user conversations, activities, files, and memories to generate new reusable skills and maintain a searchable timeline.

The daemon performs scheduled reflection every day at **12:00 AM (local timezone)**.

Instead of only storing raw conversation history, the system continuously extracts:

* user interests
* recurring workflows
* expertise
* preferences
* routines
* projects
* long-term goals
* reusable skills

This enables the agent to answer questions such as:

> What did I do yesterday?

> What was I working on last week?

> What happened on June 20?

> Continue my R2 upload implementation.

without requiring explicit user reminders.

---

# Motivation

Raw chat history becomes large and difficult to search.

Instead, the daemon should continuously transform history into structured knowledge.

```
Conversation

↓

Memory

↓

Reflection

↓

Knowledge

↓

Skills

↓

Future conversations
```

---

# Components

```
+-----------------------+
| Telegram Agent        |
+-----------+-----------+
            |
            v
 Conversation Store
            |
            v
 Daily Reflection Daemon
            |
    +-------+-------+
    |               |
    v               v
Timeline       Skill Generator
    |               |
    +-------+-------+
            |
            v
 Knowledge Store
```

---

# Reflection Schedule

Default schedule

```
Every day

00:00

(local timezone)
```

Config

```yaml
reflection:

  enabled: true

  schedule: "0 0 * * *"

  timezone: Asia/Jakarta
```

---

# Reflection Pipeline

```
Load conversations

↓

Load memories

↓

Load uploaded files

↓

Load completed tasks

↓

Cluster conversations

↓

Summarize day

↓

Extract facts

↓

Generate timeline

↓

Generate skills

↓

Update embeddings

↓

Store
```

---

# Daily Timeline

Each day produces

```
timeline/

    2026/

        06/

            20.json

            21.json

            22.json
```

Example

```json
{
  "date": "2026-06-20",
  "summary": "Worked on Telegram AI Agent",

  "activities": [
    "Designed Skill Generator",
    "Implemented R2 upload",
    "Reviewed OpenClaw architecture",
    "Discussed memory reflection"
  ],

  "people": [],

  "projects": [
    "AI Agent"
  ],

  "skills_created": [
    "Go Backend",
    "R2 Storage"
  ],

  "tags": [
    "golang",
    "telegram",
    "r2"
  ]
}
```

---

# Daily Reflection Prompt

Internal prompt

```
You are a Reflection Agent.

Analyze today's conversations.

Extract:

- important events

- ongoing work

- completed work

- user preferences

- recurring tasks

- future reminders

- reusable skills

Return structured JSON.

Ignore casual conversations.
```

---

# Skill Generation

After reflection

```
Did user learn something?

↓

YES

↓

Generate Skill
```

Example

```
User spent 6 hours discussing:

- R2 Storage
- S3 API
- Go SDK

↓

Generate

R2 Storage Skill
```

---

# Skill Example

```
Name

Cloudflare R2

Knowledge

- upload
- presigned URLs
- bucket policies
- Go SDK
- multipart upload

Examples

- upload object

- list objects

- delete

Routing

r2

object storage

bucket

cloudflare
```

---

# Timeline Embeddings

Every day is embedded.

```
2026-06-20

↓

Embedding

↓

Vector Database
```

This allows

```
Yesterday

↓

Semantic Search

↓

June 30 Timeline
```

---

# Memory Queries

Example

User

```
What did I do yesterday?
```

Pipeline

```
Detect

time query

↓

Timeline Search

↓

Return Summary
```

---

User

```
What was I working on on June 20?
```

Pipeline

```
Date Parser

↓

Timeline

↓

Summary
```

---

User

```
When did I start building the AI Agent?
```

Pipeline

```
Semantic Search

↓

Timeline

↓

Earliest Match
```

---

# Reflection Output

```
reflection/

    daily/

        2026-06-20.md

    weekly/

    monthly/
```

Example

```
Summary

Today you:

• implemented R2 uploads

• discussed OpenClaw

• improved CLI

Progress

AI Agent

███████░░░

70%

Next

• finish skill routing

• MCP integration
```

---

# Weekly Reflection

Every Sunday

```
Load

7 timelines

↓

Merge

↓

Generate insights
```

Output

```
Week 26

Most worked topics

1. Golang

2. AI Agents

3. R2

New interests

- MCP

Productivity

High
```

---

# Monthly Reflection

```
30 timelines

↓

Summarize

↓

Long-term memory

↓

Archive
```

---

# Skill Evolution

Skills improve automatically.

```
Chef

v1

↓

User asks

120 cooking questions

↓

Reflection

↓

Improve examples

↓

Chef v2
```

---

# Storage Layout

```
data/

    memory/

    conversations/

    reflections/

        daily/

        weekly/

        monthly/

    timeline/

    skills/

    embeddings/
```

---

# Daemon Workflow

```
┌──────────────────────┐
│ Scheduler (00:00)    │
└──────────┬───────────┘
           │
           ▼
 Load today's conversations
           │
           ▼
 Generate timeline
           │
           ▼
 Extract memories
           │
           ▼
 Generate/update skills
           │
           ▼
 Build embeddings
           │
           ▼
 Persist all artifacts
           │
           ▼
 Finished
```

---

# Query Flow

```
User

"What did I do yesterday?"

↓

Intent Router

↓

Temporal Query

↓

Timeline Search

↓

Reflection Summary

↓

Relevant Skills

↓

Answer
```

---

## Additional Recommendation: Event Sourcing Instead of Daily Summaries

Rather than relying only on one daily summary, treat every meaningful interaction as an immutable **Activity Event**. The midnight daemon then aggregates those events into higher-level artifacts.

```
Telegram Message
        │
        ▼
 Activity Extractor
        │
        ▼
Activity Event
        │
        ├── Timeline
        ├── Project
        ├── Memory
        └── Skill Candidate
```

Example event:

```json
{
  "id": "evt_01JZ...",
  "timestamp": "2026-06-20T14:35:22+07:00",
  "type": "project.work",
  "project": "telegram-agent",
  "summary": "Implemented Cloudflare R2 upload service",
  "artifacts": [
    "storage/r2.go",
    "skills/r2-upload.yaml"
  ],
  "tags": ["golang", "r2", "s3"]
}
```

At midnight, the daemon performs:

1. **Event aggregation** → build the daily timeline.
2. **Project progress update** → determine what changed in each project.
3. **Skill candidate detection** → identify domains with enough repeated activity to justify creating or updating a skill.
4. **Embedding generation** → index events, timelines, and skills for semantic retrieval.

This architecture makes questions like **"What did I do yesterday?"**, **"What was I doing on June 20?"**, **"When did I first implement R2 uploads?"**, and **"Continue the work I was doing last week."** much more accurate because the agent searches structured activity events first and uses daily reflections as concise summaries rather than the sole source of truth.
