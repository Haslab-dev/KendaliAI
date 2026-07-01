package workspace

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

type Workspace struct {
	ID       string `json:"id"`
	RootPath string `json:"rootPath"`
}

type WorkspaceManager struct {
	baseDir string
}

func NewWorkspaceManager(baseDir string) *WorkspaceManager {
	if baseDir == "" {
		home, err := os.UserHomeDir()
		if err == nil {
			baseDir = filepath.Join(home, ".kendaliai", "workspaces")
		} else {
			baseDir = filepath.Join(".", "build", "workspaces")
		}
	}
	return &WorkspaceManager{
		baseDir: baseDir,
	}
}

func (wm *WorkspaceManager) Create(ctx context.Context, sessionID string) (*Workspace, error) {
	rootPath := filepath.Join(wm.baseDir, "sess_"+sessionID)

	dirs := []string{
		filepath.Join(rootPath, "repo"),
		filepath.Join(rootPath, "docs"),
		filepath.Join(rootPath, "output"),
		filepath.Join(rootPath, "cache"),
	}

	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return nil, fmt.Errorf("failed to create sandbox directory %s: %w", d, err)
		}
	}

	return &Workspace{
		ID:       sessionID,
		RootPath: rootPath,
	}, nil
}

func (wm *WorkspaceManager) GetPath(sessionID string) string {
	return filepath.Join(wm.baseDir, "sess_"+sessionID)
}
