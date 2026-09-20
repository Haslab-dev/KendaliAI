package server

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/computer"
)

// handleComputerShots serves PNG screenshots captured by the computer-use
// tools. Only PNG files directly inside the computer data dir are served, so
// the route cannot be walked into arbitrary paths.
func (s *Server) handleComputerShots() http.HandlerFunc {
	dataDir := filepath.Clean(computer.DataDir())
	return func(w http.ResponseWriter, r *http.Request) {
		name := filepath.Base(strings.TrimPrefix(r.URL.Path, "/api/computer/shots/"))
		if name == "" || name == "." || name == "/" || !strings.HasSuffix(strings.ToLower(name), ".png") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		full := filepath.Join(dataDir, name)
		if filepath.Clean(filepath.Dir(full)) != dataDir {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, full)
	}
}
