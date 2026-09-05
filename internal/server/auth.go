package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/kendaliai/app/internal/security"
)

// Simple single-user password auth for the WebUI (GOALS.md Track C hardening):
// the password hash lives in the local SQLite settings table, and a valid
// login issues an HMAC session cookie derived from the same machine-bound
// secret the gateway already uses for encryption, so sessions survive
// restarts without a server-side session store.

const sessionCookieName = "kendaliai_session"
const settingPasswordHash = "auth_password_hash"
const settingPasswordSalt = "auth_password_salt"

func (s *Server) ensureAuthTable() {
	_, _ = s.db.Exec(`CREATE TABLE IF NOT EXISTS app_settings (
		key TEXT PRIMARY KEY,
		value TEXT
	)`)
}

func (s *Server) getSetting(key string) (string, error) {
	var val string
	err := s.db.QueryRow("SELECT value FROM app_settings WHERE key = ?", key).Scan(&val)
	return val, err
}

func (s *Server) setSetting(key, value string) error {
	_, err := s.db.Exec(`INSERT INTO app_settings (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

// machineFingerprint mirrors internal/security's machine-bound key derivation.
func machineFingerprint() string {
	if key := os.Getenv("KENDALIAI_KEY"); key != "" {
		return key
	}
	home := os.Getenv("HOME")
	user := os.Getenv("USER")
	return fmt.Sprintf("%s-%s", home, user)
}

func sessionToken() string {
	return security.HashToken("kendaliai-session|" + machineFingerprint())
}

func hashPassword(password, salt string) string {
	sum := sha256.Sum256([]byte(salt + ":" + password))
	return hex.EncodeToString(sum[:])
}

func randomSalt() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// authRequired reports whether a password has been configured.
func (s *Server) authRequired() bool {
	hash, err := s.getSetting(settingPasswordHash)
	return err == nil && strings.TrimSpace(hash) != ""
}

func (s *Server) verifyPassword(password string) bool {
	salt, err := s.getSetting(settingPasswordSalt)
	if err != nil {
		return false
	}
	hash, err := s.getSetting(settingPasswordHash)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(hashPassword(password, salt)), []byte(hash)) == 1
}

// authMiddleware gates the API and WebSocket behind the password when one is
// configured. SPA assets stay public so the login screen can load.
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path != "/ws" && !strings.HasPrefix(path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		if path == "/api/auth/status" || path == "/api/auth/login" || path == "/health" {
			next.ServeHTTP(w, r)
			return
		}
		if !s.authRequired() {
			next.ServeHTTP(w, r)
			return
		}
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(sessionToken())) != 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "authentication required"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) setSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionToken(),
		Path:     "/",
		MaxAge:   60 * 60 * 24 * 30,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) handleAuthStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		required := s.authRequired()
		authenticated := false
		if required {
			cookie, err := r.Cookie(sessionCookieName)
			authenticated = err == nil && subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(sessionToken())) == 1
		}
		_ = json.NewEncoder(w).Encode(map[string]bool{
			"required":      required,
			"authenticated": authenticated,
		})
	}
}

func (s *Server) handleAuthLogin() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if !s.verifyPassword(req.Password) {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Incorrect password"})
			return
		}
		s.setSessionCookie(w)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	}
}

func (s *Server) handleAuthLogout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.SetCookie(w, &http.Cookie{
			Name:     sessionCookieName,
			Value:    "",
			Path:     "/",
			MaxAge:   -1,
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	}
}

// handleAuthPassword sets the initial password or changes it (verifying the
// current one first when auth is already active).
func (s *Server) handleAuthPassword() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if len(req.NewPassword) < 4 {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "New password must be at least 4 characters"})
			return
		}
		if s.authRequired() && !s.verifyPassword(req.CurrentPassword) {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Current password is incorrect"})
			return
		}
		salt := randomSalt()
		if err := s.setSetting(settingPasswordSalt, salt); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := s.setSetting(settingPasswordHash, hashPassword(req.NewPassword, salt)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Printf("🔐 Password updated via settings")
		s.setSessionCookie(w)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	}
}
