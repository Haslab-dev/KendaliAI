package executors

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/kendaliai/app/internal/sandbox"
	"github.com/kendaliai/app/internal/storage"
)

type DownloadExecutor struct {
	manager *storage.Manager
	workDir string
}

func NewDownloadExecutor(manager *storage.Manager, workDir string) *DownloadExecutor {
	return &DownloadExecutor{manager: manager, workDir: workDir}
}

func (e *DownloadExecutor) Run(ctx context.Context, env sandbox.RuntimeEnvironment, args map[string]interface{}) (string, error) {
	key, _ := args["key"].(string)
	if key == "" {
		return "", fmt.Errorf("missing required arg: key")
	}

	destPath, _ := args["dest"].(string)
	if destPath == "" {
		destPath, _ = args["path"].(string)
	}
	if destPath == "" {
		destPath = filepath.Base(key)
	}
	if !filepath.IsAbs(destPath) {
		destPath = filepath.Join(e.workDir, destPath)
	}

	reader, err := e.manager.Download(ctx, key)
	if err != nil {
		return "", fmt.Errorf("download: %w", err)
	}
	defer reader.Close()

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return "", fmt.Errorf("create dest dir: %w", err)
	}

	f, err := os.Create(destPath)
	if err != nil {
		return "", fmt.Errorf("create dest file: %w", err)
	}
	defer f.Close()

	written, err := io.Copy(f, reader)
	if err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}

	return fmt.Sprintf(`{"dest":"%s","size":%d,"key":"%s"}`, destPath, written, key), nil
}
