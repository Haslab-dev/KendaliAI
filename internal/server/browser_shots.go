package server

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/browser"
)

// handleBrowserShots serves PNG screenshots captured by the browser-use
// tools. Only PNG files directly inside the browser shots dir are served.
func (s *Server) handleBrowserShots() http.HandlerFunc {
	shotsDir := filepath.Clean(browser.ShotsDir())
	return func(w http.ResponseWriter, r *http.Request) {
		name := filepath.Base(strings.TrimPrefix(r.URL.Path, "/api/browser/shots/"))
		if name == "" || name == "." || name == "/" || !strings.HasSuffix(strings.ToLower(name), ".png") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		full := filepath.Join(shotsDir, name)
		if filepath.Clean(filepath.Dir(full)) != shotsDir {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, full)
	}
}
