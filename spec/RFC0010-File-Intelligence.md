# RFC-0010: File Intelligence

**Status:** Draft
**Version:** 0.3.4

## Problem

Currently, the system can only read raw files. It cannot:
- Parse PDFs
- Extract text from Word docs
- Read Excel files
- Process images (OCR)
- Handle Swagger/OpenAPI specs

## Solution

Build a file intelligence pipeline:

```
File
  │
  ▼
Loader (detect type)
  │
  ▼
Parser (extract content)
  │
  ▼
Chunker (split into pieces)
  │
  ▼
Embedding (vectorize)
  │
  ▼
Metadata Extractor
  │
  ▼
Index
```

## Supported Formats

| Format | Parser | Chunking Strategy |
|--------|--------|-------------------|
| PDF | pdfplumber | Page-based |
| Word | docx | Paragraph |
| Excel | excelize | Sheet/row |
| PowerPoint | pptx | Slide |
| CSV | encoding/csv | Row |
| Markdown | goldmark | Heading sections |
| HTML | readme parser | DOM nodes |
| OpenAPI/Swagger | swagger-parser | Endpoint |
| SQL | sqlparser | Statement |
| YAML | yaml.v3 | Document |
| JSON | encoding/json | Object |
| Images | gocv + tesseract | OCR |
| Video | whisper.cpp | Transcript segment |
| Audio | whisper.cpp | Transcript segment |
| ZIP | archive/zip | File entry |
| Go | ast | Declaration |
| TypeScript | tsparser | Declaration |

## File Intelligence Schema

```json
{
  "id": "fi_abc123",
  "file_path": "docs/spec.pdf",
  "file_type": "pdf",
  "size_bytes": 1048576,
  "processed_at": "2026-07-01T12:00:00Z",
  "chunks": [
    {
      "id": "chunk_001",
      "content": "This document describes...",
      "chunk_index": 0,
      "page": 1,
      "embedding": [0.123, ...]
    }
  ],
  "metadata": {
    "pages": 42,
    "title": "System Specification",
    "author": "Engineering Team"
  }
}
```
