package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/gateway"
)

// handleAttachments accepts multipart uploads for chat attachments.
// POST /api/attachments (multipart: files[], optional sessionId)
func (s *Server) handleAttachments() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		limits := config.Cfg.DefaultAttachments()
		// Allow a little multipart overhead on top of the byte budget.
		r.Body = http.MaxBytesReader(w, r.Body, limits.MaxTotalBytes+(1<<20))
		if err := r.ParseMultipartForm(limits.MaxTotalBytes); err != nil {
			http.Error(w, "upload too large or malformed: "+err.Error(), http.StatusRequestEntityTooLarge)
			return
		}

		files := r.MultipartForm.File["files"]
		if len(files) == 0 {
			files = r.MultipartForm.File["file"]
		}
		if len(files) == 0 {
			http.Error(w, "no files uploaded", http.StatusBadRequest)
			return
		}
		if len(files) > limits.MaxFiles {
			http.Error(w, fmt.Sprintf("too many files: max %d", limits.MaxFiles), http.StatusBadRequest)
			return
		}

		sessionID := strings.TrimSpace(r.FormValue("sessionId"))
		var total int64
		attachments := make([]gateway.Attachment, 0, len(files))

		for _, header := range files {
			if header.Size > limits.MaxFileBytes {
				http.Error(w, fmt.Sprintf("file %q is too large: max %d MB", header.Filename, limits.MaxFileBytes/(1<<20)), http.StatusRequestEntityTooLarge)
				return
			}
			total += header.Size
			if total > limits.MaxTotalBytes {
				http.Error(w, fmt.Sprintf("total upload too large: max %d MB", limits.MaxTotalBytes/(1<<20)), http.StatusRequestEntityTooLarge)
				return
			}

			name := gateway.SanitizeAttachmentName(header.Filename)
			if !gateway.IsAllowedAttachment(name, limits.AllowedMime) {
				http.Error(w, fmt.Sprintf("unsupported file type: %s", name), http.StatusUnsupportedMediaType)
				return
			}

			f, err := header.Open()
			if err != nil {
				http.Error(w, "failed to read upload", http.StatusBadRequest)
				return
			}
			data, err := io.ReadAll(f)
			f.Close()
			if err != nil {
				http.Error(w, "failed to read upload", http.StatusBadRequest)
				return
			}
			// Header size can lie; enforce the real byte count.
			if int64(len(data)) > limits.MaxFileBytes {
				http.Error(w, fmt.Sprintf("file %q is too large: max %d MB", name, limits.MaxFileBytes/(1<<20)), http.StatusRequestEntityTooLarge)
				return
			}

			att, err := s.store.SaveAttachment(sessionID, name, data)
			if err != nil {
				http.Error(w, "failed to store attachment: "+err.Error(), http.StatusInternalServerError)
				return
			}
			attachments = append(attachments, att)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(attachments)
	}
}

// handleAttachmentServe streams an uploaded attachment inline.
// GET /api/attachments/{id}
func (s *Server) handleAttachmentServe() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/api/attachments/")
		id = strings.TrimSpace(strings.Split(id, "/")[0])
		if id == "" {
			http.Error(w, "missing attachment id", http.StatusBadRequest)
			return
		}
		att, err := s.store.GetAttachment(id)
		if err != nil || att == nil {
			http.Error(w, "attachment not found", http.StatusNotFound)
			return
		}
		contentType := att.Mime
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", att.Name))
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeFile(w, r, att.Path)
	}
}

// resolveAttachments replaces client-supplied attachment metadata with the
// authoritative stored rows, so a crafted request cannot point at arbitrary
// files on disk.
func (s *Server) resolveAttachments(sessionID string, incoming []gateway.Attachment) []gateway.Attachment {
	if len(incoming) == 0 {
		return nil
	}
	resolved := make([]gateway.Attachment, 0, len(incoming))
	for _, in := range incoming {
		if strings.TrimSpace(in.ID) == "" {
			continue
		}
		att, err := s.store.GetAttachment(in.ID)
		if err != nil || att == nil {
			continue
		}
		// Attachments uploaded before the session existed have no session id
		// yet; everything else must belong to this session.
		if att.SessionID != "" && sessionID != "" && att.SessionID != sessionID {
			continue
		}
		resolved = append(resolved, *att)
	}
	return resolved
}

// attachmentPromptSuffix describes attachments for agents that cannot accept
// inline images (ACP orchestrators and the embedded RakitKode engine).
func attachmentPromptSuffix(atts []gateway.Attachment) string {
	if len(atts) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\n\n### Attached files\n")
	for _, a := range atts {
		b.WriteString(fmt.Sprintf("- %s (%s, %d bytes): %s\n", a.Name, a.Mime, a.Size, a.URL))
	}
	return b.String()
}
