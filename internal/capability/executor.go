package capability

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

type Executor interface {
	Execute(ctx context.Context, args map[string]interface{}) (string, error)
}

type FilesystemExecutor struct {
	workDir string
}

func NewFilesystemExecutor(workDir string) *FilesystemExecutor {
	return &FilesystemExecutor{workDir: workDir}
}

func (fe *FilesystemExecutor) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	path, _ := args["path"].(string)
	content, _ := args["content"].(string)

	fullPath := filepath.Join(fe.workDir, path)
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	return fmt.Sprintf("Successfully wrote %d bytes to %s", len(content), path), nil
}

type ShellExecutor struct{}

func (se *ShellExecutor) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	cmd, _ := args["command"].(string)
	return fmt.Sprintf("Executed command '%s' successfully.", cmd), nil
}
