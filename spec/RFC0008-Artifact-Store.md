# RFC-0008: Artifact Store

**Status:** Draft
**Version:** 0.3.4

## Problem

Currently, outputs are files on disk. This makes it:
- Difficult to track what was generated
- Impossible to version outputs
- No way to convert outputs to different formats
- No audit trail

## Solution

Build an artifact store:

```go
type ArtifactStore interface {
    Create(ctx context.Context, artifact *Artifact) error
    Get(ctx context.Context, id string) (*Artifact, error)
    List(ctx context.Context, sessionID string) ([]*Artifact, error)
    Update(ctx context.Context, artifact *Artifact) error
    Delete(ctx context.Context, id string) error
    GetURL(ctx context.Context, id string) (string, error)
}
```

## Artifact Types

| Type | Extensions | Description |
|------|-------------|-------------|
| `code` | .go, .ts, .tsx, .py | Source code files |
| `document` | .md, .txt, .docx | Text documents |
| `pdf` | .pdf | PDF documents |
| `spreadsheet` | .xlsx, .csv | Excel/CSV files |
| `presentation` | .pptx | PowerPoint presentations |
| `diagram` | .svg, .png | Visual diagrams |
| `image` | .png, .jpg, .gif | Images |
| `report` | .md, .html | Generated reports |
| `log` | .log, .txt | Execution logs |
| `patch` | .patch | Git-style patches |
| `commit` | - | Git commits |
| `archive` | .zip, .tar.gz | Compressed archives |

## Artifact Schema

```json
{
  "id": "art_abc123",
  "session_id": "sess_abc123",
  "task_id": "task_001",
  "type": "code",
  "name": "LandingPage.tsx",
  "path": "/workspaces/sess_abc123/output/LandingPage.tsx",
  "size_bytes": 4521,
  "mime_type": "text/typescript",
  "checksum": "sha256:abc123...",
  "version": 1,
  "created_at": "2026-07-01T12:30:00Z",
  "metadata": {
    "language": "typescript",
    "framework": "react",
    "lines": 156
  }
}
```

## Conversion Support

| From | To | Tool |
|------|-----|------|
| Markdown | PDF | pandoc |
| Markdown | DOCX | pandoc |
| Markdown | HTML | goldmark |
| CSV | XLSX | excelize |
| JSON | YAML | converter |
| PlantUML | PNG/SVG | plantuml |
