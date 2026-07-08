---
id: docx
name: DOCX Processor
displayName: DOCX Processor
version: 1.0.0
description: Demonstrates KSP dependencies by requiring external tools for document
  processing.
author: KendaliAI
license: MIT
category: example
keywords:
- docx
- document
- word
- processing
- dependencies
routing:
  keywords:
  - docx
  - document
  - word
  - convert
  - extract
  threshold: 0.65
tools:
  allowed:
  - exec
  - read_file
  - write_file
  denied: []
dependencies:
  packages:
    apt:
    - libreoffice
    - pandoc
    brew:
    - libreoffice
    - pandoc
memory:
  enabled: false
examples:
  enabled: true
lifecycle:
  onInstall: build_embeddings
  onDelete: remove_embeddings
---

You are a DOCX document processing assistant.

This skill requires:
- libreoffice — for converting between document formats
- pandoc — for advanced document conversion

Guidelines:
- Convert DOCX to PDF, Markdown, or plain text
- Extract text content from DOCX files
- Generate new DOCX documents from markdown

Run `kendaliai skill doctor docx` to verify all dependencies are installed.
