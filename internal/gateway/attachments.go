package gateway

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kendaliai/app/internal/agent"
)

// attachmentsRoot can be overridden at startup (cmd/kendaliai) so uploads live
// next to the configured storage directory instead of the home directory.
var attachmentsRoot string

// SetAttachmentsRoot overrides where chat attachments are written.
func SetAttachmentsRoot(dir string) {
	if strings.TrimSpace(dir) == "" {
		return
	}
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}
	attachmentsRoot = dir
}

func attachmentsDir() string {
	if attachmentsRoot != "" {
		return attachmentsRoot
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".", "attachments")
	}
	return filepath.Join(home, ".kendaliai", "attachments")
}

// defaultAttachmentExts is the allowlist applied when config.Attachments has
// no explicit MIME allowlist. Executables and scripts with side effects are
// deliberately excluded.
var defaultAttachmentExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".svg": true, ".bmp": true,
	".pdf": true, ".txt": true, ".md": true, ".csv": true, ".json": true, ".yaml": true, ".yml": true,
	".xml": true, ".html": true, ".htm": true, ".css": true, ".js": true, ".ts": true, ".tsx": true,
	".jsx": true, ".py": true, ".go": true, ".rs": true, ".java": true, ".kt": true, ".c": true,
	".h": true, ".cpp": true, ".hpp": true, ".sh": true, ".sql": true, ".toml": true, ".ini": true,
	".log": true, ".zip": true, ".docx": true, ".xlsx": true, ".pptx": true,
}

// AttachmentKind classifies an attachment for the UI and for provider routing.
func AttachmentKind(name, mimeType string) string {
	m := strings.ToLower(mimeType)
	if strings.HasPrefix(m, "image/") {
		return "image"
	}
	if m == "application/pdf" || strings.EqualFold(filepath.Ext(name), ".pdf") {
		return "pdf"
	}
	if strings.HasPrefix(m, "text/") {
		return "text"
	}
	switch strings.ToLower(filepath.Ext(name)) {
	case ".md", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx",
		".py", ".go", ".rs", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".sh", ".sql", ".toml", ".ini", ".log":
		return "text"
	}
	return "other"
}

// DetectAttachmentMime returns the best MIME type for an uploaded file.
func DetectAttachmentMime(name string, data []byte) string {
	if byExt := mime.TypeByExtension(strings.ToLower(filepath.Ext(name))); byExt != "" {
		return byExt
	}
	if len(data) > 0 {
		return http.DetectContentType(data)
	}
	return "application/octet-stream"
}

// IsAllowedAttachment reports whether the extension is on the upload allowlist.
func IsAllowedAttachment(name string, allowed []string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	if len(allowed) > 0 {
		for _, a := range allowed {
			a = strings.ToLower(strings.TrimSpace(a))
			if a == "" {
				continue
			}
			if a == ext || a == strings.TrimPrefix(ext, ".") || strings.HasPrefix(strings.ToLower(name), a) {
				return true
			}
		}
		return false
	}
	return defaultAttachmentExts[ext]
}

// SaveAttachment writes the bytes to local attachment storage and records the
// object row so it can be served and restored later.
func (s *Store) SaveAttachment(sessionID, name string, data []byte) (Attachment, error) {
	if strings.TrimSpace(name) == "" {
		name = "file"
	}
	mimeType := DetectAttachmentMime(name, data)
	ext := strings.ToLower(filepath.Ext(name))
	id := "att_" + uuid.New().String()[:12]
	key := filepath.Join(sessionID, id+ext)
	fullPath := filepath.Join(attachmentsDir(), key)

	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return Attachment{}, fmt.Errorf("create attachment dir: %w", err)
	}
	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return Attachment{}, fmt.Errorf("write attachment: %w", err)
	}

	hasher := sha256.New()
	hasher.Write(data)
	checksum := hex.EncodeToString(hasher.Sum(nil))
	url := "/api/attachments/" + id
	att := Attachment{
		ID:   id,
		Name: filepath.Base(name),
		Mime: mimeType,
		Kind: AttachmentKind(name, mimeType),
		Size: int64(len(data)),
		URL:  url,
		Path: fullPath,
	}

	if s != nil && s.db != nil {
		_, err := s.db.Exec(`
			INSERT INTO objects (id, session_id, bucket, key, checksum, mime, size, url, metadata, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			att.ID, sessionID, "attachments", key, checksum, att.Mime, att.Size, url, att.Name, time.Now().UnixMilli())
		if err != nil {
			return Attachment{}, fmt.Errorf("record attachment: %w", err)
		}
	}
	return att, nil
}

// GetAttachment resolves an attachment id to its metadata.
func (s *Store) GetAttachment(id string) (*Attachment, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("store unavailable")
	}
	var att Attachment
	var key, name string
	err := s.db.QueryRow(`
		SELECT id, COALESCE(session_id, ''), COALESCE(mime, ''), COALESCE(size, 0), COALESCE(url, ''), key, COALESCE(metadata, '')
		FROM objects WHERE id = ? AND bucket = 'attachments'`, id).
		Scan(&att.ID, &att.SessionID, &att.Mime, &att.Size, &att.URL, &key, &name)
	if err != nil {
		return nil, err
	}
	att.Name = name
	att.Path = filepath.Join(attachmentsDir(), key)
	att.Kind = AttachmentKind(att.Name, att.Mime)
	return &att, nil
}

// LoadAttachmentBytes reads an attachment's bytes from local storage.
func LoadAttachmentBytes(att Attachment) ([]byte, error) {
	if att.Path == "" {
		return nil, fmt.Errorf("attachment has no local path")
	}
	return os.ReadFile(att.Path)
}

const maxAttachmentTextChars = 20000

// prepareAttachmentContext converts attachments into provider inputs: inline
// images for vision-capable models, extracted text for documents, and a
// reference note for everything else.
func prepareAttachmentContext(provCfg *ProviderConfig, model string, atts []Attachment) ([]agent.ImageInput, []string) {
	supportVision := modelVisionCapability(provCfg, model)
	var images []agent.ImageInput
	var notes []string

	for _, a := range atts {
		switch a.Kind {
		case "image":
			// SVG is a vector format most vision endpoints reject; keep it as a
			// reference instead of an inline image part.
			if strings.EqualFold(a.Mime, "image/svg+xml") {
				notes = append(notes, fmt.Sprintf("- Vector image attached: %s (%d bytes), previewable at %s", a.Name, a.Size, a.URL))
				continue
			}
			if !supportVision {
				notes = append(notes, fmt.Sprintf("- Image attached: %s (%s, %d bytes). The current model `%s` does not accept image input, so only the filename is available.", a.Name, a.Mime, a.Size, model))
				continue
			}
			data, err := LoadAttachmentBytes(a)
			if err != nil {
				notes = append(notes, fmt.Sprintf("- Image attached but unreadable: %s (%v)", a.Name, err))
				continue
			}
			images = append(images, agent.ImageInput{
				Mime:   a.Mime,
				Base64: base64.StdEncoding.EncodeToString(data),
			})
			notes = append(notes, fmt.Sprintf("- Image attached: %s (%s, %d bytes)", a.Name, a.Mime, a.Size))
		case "text", "pdf":
			data, err := LoadAttachmentBytes(a)
			if err != nil {
				notes = append(notes, fmt.Sprintf("- Attached file: %s (%s, %d bytes)", a.Name, a.Mime, a.Size))
				continue
			}
			text, exErr := ExtractTextContent(a.Name, data)
			text = strings.TrimSpace(text)
			if exErr != nil || text == "" {
				notes = append(notes, fmt.Sprintf("- Attached file: %s (%s, %d bytes) — contents could not be extracted; it is downloadable at %s", a.Name, a.Mime, a.Size, a.URL))
				continue
			}
			if len(text) > maxAttachmentTextChars {
				text = text[:maxAttachmentTextChars] + "\n... [attachment truncated]"
			}
			notes = append(notes, fmt.Sprintf("#### %s\n```\n%s\n```", a.Name, text))
		default:
			notes = append(notes, fmt.Sprintf("- Attached file: %s (%s, %d bytes), available at %s", a.Name, a.Mime, a.Size, a.URL))
		}
	}
	return images, notes
}

// SanitizeAttachmentName strips any directory components from a client name.
func SanitizeAttachmentName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	if name == "." || name == "/" || name == "" {
		return "file"
	}
	return name
}
