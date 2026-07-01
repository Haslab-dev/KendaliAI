package agent

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/config"
)

// Permission represents an allowed operation on a path.
type Permission string

const (
	PermRead   Permission = "read"
	PermWrite  Permission = "write"
	PermUpdate Permission = "update"
	PermDelete Permission = "delete"
)

// sensitivePatterns contains paths/patterns that are ALWAYS denied, regardless of config.
var sensitivePatterns = []string{
	".env",
	".git/config",
	"config.yaml",
	"config.json",
	"kendaliai.yaml",
	".kendaliai/config",
	"secrets/",
	"credentials/",
	".pem",
	".key",
	".token",
	"token.txt",
	"api_key",
	"apikey",
	".aws/credentials",
	"id_rsa",
	"id_ed25519",
	".ssh/",
	"privatekey",
}

// CheckFilePermission returns an error if the path is denied for the given operation.
// Returns nil if access is allowed.
func CheckFilePermission(targetPath, workspaceRoot string, op Permission) error {
	cwd := filepath.Clean(workspaceRoot)
	abs, err := resolveAbs(targetPath, cwd)
	if err != nil {
		return err
	}

	rel, _ := filepath.Rel(cwd, abs)
	normalized := filepath.ToSlash(rel)

	for _, pattern := range sensitivePatterns {
		if matchPath(normalized, pattern) {
			return fmt.Errorf("Sorry, not allowed: access to '%s' is restricted", normalized)
		}
	}

	if config.Cfg != nil {
		for _, rule := range config.Cfg.Permissions.Deny {
			if matchPath(normalized, rule) {
				return fmt.Errorf("Sorry, not allowed: '%s' is restricted by policy", normalized)
			}
		}
	}

	if config.Cfg != nil && len(config.Cfg.Permissions.Allow) > 0 {
		allowed := false
		for _, rule := range config.Cfg.Permissions.Allow {
			if matchPath(normalized, rule.Path) {
				for _, perm := range rule.Permissions {
					if Permission(perm) == op {
						allowed = true
						break
					}
				}
				if allowed {
					break
				}
			}
		}
		if !allowed {
			return fmt.Errorf("Sorry, not allowed: no '%s' permission for '%s'", op, normalized)
		}
	}

	return nil
}

func matchPath(path, pattern string) bool {
	path = strings.ToLower(filepath.ToSlash(path))
	pattern = strings.ToLower(filepath.ToSlash(pattern))

	if strings.HasSuffix(pattern, "/") {
		return strings.HasPrefix(path, pattern) || strings.Contains(path, "/"+strings.TrimSuffix(pattern, "/")+"/")
	}

	if strings.HasPrefix(pattern, ".") && !strings.HasPrefix(pattern, "./") {
		if pattern == filepath.Base(path) {
			return true
		}
		return strings.HasSuffix(path, pattern)
	}

	return strings.Contains(path, pattern)
}

func resolveAbs(targetPath, cwd string) (string, error) {
	if filepath.IsAbs(targetPath) {
		return filepath.Abs(targetPath)
	}
	return filepath.Abs(filepath.Join(cwd, targetPath))
}

// ValidateSandboxedPath enforces Security Hardening (Rule 8)
// It ensures that file manipulation tools cannot traverse above the designated root
func ValidateSandboxedPath(targetPath string, workspaceRoot string) error {
	if workspaceRoot == "" {
		return nil
	}

	absRoot, err := filepath.Abs(workspaceRoot)
	if err != nil {
		return err
	}

	var absTarget string
	if filepath.IsAbs(targetPath) {
		absTarget, err = filepath.Abs(targetPath)
	} else {
		absTarget, err = filepath.Abs(filepath.Join(absRoot, targetPath))
	}
	if err != nil {
		return err
	}

	if !strings.HasPrefix(absTarget, absRoot) {
		return fmt.Errorf("SECURITY DENIAL: Access to %s escapes the sandboxed workspace %s", absTarget, absRoot)
	}

	return nil
}
