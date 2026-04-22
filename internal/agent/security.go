package agent

import (
	"fmt"
	"path/filepath"
	"strings"
)

// ValidateSandboxedPath enforces Security Hardening (Rule 8)
// It ensures that file manipulation tools cannot traverse above the designated root
func ValidateSandboxedPath(targetPath string, workspaceRoot string) error {
	if workspaceRoot == "" {
		return nil // Execution assumes root if empty
	}

	absRoot, err := filepath.Abs(workspaceRoot)
	if err != nil { return err }

	var absTarget string
	if filepath.IsAbs(targetPath) {
		absTarget, err = filepath.Abs(targetPath)
	} else {
		absTarget, err = filepath.Abs(filepath.Join(absRoot, targetPath))
	}
	if err != nil { return err }

	// Ensure the resolved target lies strictly inside the workspace root
	if !strings.HasPrefix(absTarget, absRoot) {
		return fmt.Errorf("SECURITY DENIAL: Access to %s escapes the sandboxed workspace %s", absTarget, absRoot)
	}

	// Dynamic block lists
	denyList := []string{".env", ".git/"}
	for _, deny := range denyList {
		if strings.Contains(absTarget, deny) {
			return fmt.Errorf("SECURITY DENIAL: Target path contains blacklisted restricted block scope: %s", deny)
		}
	}

	return nil
}
