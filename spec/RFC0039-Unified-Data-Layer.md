# RFC-0039 — Unified Data Layer

**Status:** Proposed
**Version:** 2.0
**Owner:** KendaliAI Core
**Updated:** July 2026

---

# Overview

KendaliAI adopts a **layered, provider-agnostic data architecture** designed for autonomous software engineering.

The architecture separates metadata, semantic retrieval, lexical search, structural code intelligence, and binary object storage into dedicated components while exposing unified interfaces to the rest of the system.

This ensures:

* Local-first execution
* Low token consumption
* Incremental indexing
* Pluggable storage providers
* Future cloud scalability
* Minimal vendor lock-in

The rest of KendaliAI never communicates directly with SQLite, sqlite-vec, Bleve, Tree-sitter, or Cloudflare R2.

All access must go through adapters.

---

# Architecture

```text
                     Agent Runtime
                           │
                    Context Compiler
                           │
          Memory / Knowledge Services
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
 Repository Layer    Search Engine      Vector Store
        │                  │                  │
        │                  │                  │
     SQLite             Bleve          sqlite-vec
                                            │
                                     Qdrant Adapter
                                            │
                                    Pinecone Adapter
        │
        │
   Tree-sitter
        │
 Workspace Graph
        │
 Object Storage Interface
        │
 Cloudflare R2
```

---

# Design Principles

1. SQLite is the authoritative metadata store.
2. Vector databases are replaceable.
3. Search engines are replaceable.
4. Object storage is replaceable.
5. Tree-sitter owns code intelligence.
6. Incremental indexing only.
7. Context Builder owns token budgeting.
8. Agents never explore repositories blindly.
9. Every subsystem is accessed through an interface.
10. Infrastructure choices never leak into business logic.

---

# Storage Responsibilities

## SQLite

SQLite is the **single source of truth**.

Stores:

* sessions
* goals
* tasks
* events
* conversations
* prompt cache
* tool executions
* telemetry
* artifacts metadata
* workspace metadata
* symbol metadata
* checkpoints
* snapshots
* settings

SQLite stores metadata only.

Large binary objects must never be stored inside SQLite.

---

## Vector Store

Semantic retrieval is abstracted behind a provider interface.

Default implementation:

* sqlite-vec

Future implementations:

* Qdrant
* Pinecone

The application must never import sqlite-vec directly.

---

## Search Engine

Lexical search is abstracted behind a provider interface.

Default implementation:

* Bleve

Future implementations:

* Meilisearch
* Typesense
* Elasticsearch

Responsibilities:

* BM25 ranking
* fuzzy search
* filename search
* README search
* package search
* symbol search

---

## Tree-sitter

Tree-sitter is the primary source-code intelligence engine.

Supported languages include:

* Go
* TypeScript
* JavaScript
* TSX
* JSX
* Python
* JSON
* YAML
* Markdown

Extracted information:

* imports
* exports
* functions
* classes
* interfaces
* methods
* variables
* decorators
* JSX hierarchy
* routes
* comments

Tree-sitter continuously maintains the Workspace Graph.

---

## Object Storage

Binary objects are abstracted behind an Object Storage interface.

Default implementation:

* Cloudflare R2

Future implementations:

* Amazon S3
* MinIO
* Google Cloud Storage
* Azure Blob Storage

Stored objects include:

* generated ZIP archives
* screenshots
* PDFs
* datasets
* videos
* images
* audio
* workspace backups
* checkpoint archives
* generated artifacts
* exported reports

SQLite stores only object metadata.

---

# Repository Layer

Business logic must never execute SQL directly.

Instead, access must flow through repositories.

Examples:

* SessionRepository
* GoalRepository
* TaskRepository
* MemoryRepository
* ArtifactRepository
* WorkspaceRepository
* ConversationRepository
* PromptCacheRepository

---

# Provider Interfaces

## Vector Store

```go
type VectorStore interface {
    Upsert(ctx context.Context, docs []Document) error
    Delete(ctx context.Context, ids []string) error
    Search(ctx context.Context, query VectorQuery) ([]SearchResult, error)
    Get(ctx context.Context, id string) (*Document, error)
    Stats(ctx context.Context) (*Stats, error)
}
```

---

## Search Engine

```go
type SearchEngine interface {
    Index(ctx context.Context, doc SearchDocument) error
    Delete(ctx context.Context, id string) error
    Search(ctx context.Context, query SearchQuery) ([]SearchResult, error)
}
```

---

## Object Storage

```go
type ObjectStorage interface {
    Upload(ctx context.Context, object UploadRequest) (*UploadResult, error)
    Download(ctx context.Context, key string) (*DownloadResult, error)
    Delete(ctx context.Context, key string) error
    SignedURL(ctx context.Context, key string, ttl time.Duration) (string, error)
}
```

---

## Embedding Provider

Embedding generation is independent from the Vector Store.

```go
type EmbeddingProvider interface {
    Embed(ctx context.Context, texts []string) ([][]float32, error)
}
```

Supported providers may include:

* OpenAI
* Voyage AI
* Jina AI
* Ollama
* Nomic
* Gemini

---

# Configuration

```yaml
database:
  driver: sqlite
  path: ./data/kendaliai.db

search:
  provider: bleve

vector:
  provider: sqlite

embedding:
  provider: openai

object_storage:
  provider: r2

providers:

  sqlite:
    database: ./data/kendaliai.db

  qdrant:
    endpoint: http://localhost:6333
    api_key: ""

  pinecone:
    api_key: ""
    index: ""
    namespace: ""

  bleve:
    index: ./data/index

  r2:
    endpoint: ""
    bucket: ""
    access_key: ""
    secret_key: ""
```

Changing providers requires configuration changes only.

No application code changes.

---

# Workspace Graph

Tree-sitter maintains a continuously updated Workspace Graph.

Metadata includes:

* file hierarchy
* imports
* exports
* symbol references
* dependencies
* callers
* callees

Agents navigate using this graph instead of repeatedly scanning directories.

---

# Incremental Indexing

Workspace indexing is event-driven.

```
File Changed

↓

Hash Changed?

↓

No

↓

Stop

↓

Yes

↓

Tree-sitter Parse

↓

Update Workspace Graph

↓

Update Bleve

↓

Queue Embeddings

↓

Vector Store Update
```

Only modified files are reprocessed.

---

# Retrieval Pipeline

The retrieval pipeline follows this sequence:

```
User Request

↓

Intent Parser

↓

Workspace Graph

↓

Relevant Files

↓

Bleve Search

↓

Vector Store Re-ranking

↓

Conversation Memory

↓

Prompt Cache

↓

Context Builder

↓

LLM
```

The LLM receives only the minimal required context.

---

# Upload Flow

```
Tool Request

↓

Policy Engine

↓

Object Storage

↓

Cloudflare R2

↓

SQLite Metadata

↓

Artifact Registry

↓

Return Signed URL
```

---

# Download Flow

```
Artifact ID

↓

Artifact Repository

↓

Object Storage

↓

Signed URL

↓

Download
```

Agents never receive raw storage credentials.

---

# Prompt Cache

Prompt caching prevents duplicate model calls.

Metadata:

* prompt hash
* provider
* model
* response
* token savings
* creation timestamp

---

# Embedding Queue

Embedding generation is asynchronous.

States:

* pending
* running
* completed
* failed

Background workers process the queue.

---

# Artifact Provenance

Every generated artifact records lineage.

Relationships include:

* parent artifact
* derived artifact
* generating agent
* originating task
* originating goal
* originating conversation

This enables complete execution traceability.

---

# Expected Benefits

This architecture provides:

* Local-first operation
* Provider independence
* Minimal vendor lock-in
* Efficient incremental indexing
* Lower token consumption
* Deterministic repository navigation
* Fast lexical and semantic retrieval
* Pluggable infrastructure components
* Scalable cloud migration path
* Production-ready data abstractions

The default stack for KendaliAI v1 consists of:

* **SQLite** for metadata and state management
* **sqlite-vec** as the default Vector Store
* **Bleve** as the default Search Engine
* **Tree-sitter** for code intelligence and Workspace Graph generation
* **Cloudflare R2** as the default Object Storage backend

All components are accessed exclusively through provider interfaces, allowing future migration to alternative implementations such as Qdrant, Pinecone, Meilisearch, Elasticsearch, MinIO, or Amazon S3 without affecting the agent runtime or business logic.
