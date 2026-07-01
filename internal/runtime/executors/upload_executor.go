package executors

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kendaliai/app/internal/sandbox"
	"github.com/kendaliai/app/internal/storage"
)

type UploadExecutor struct {
	manager *storage.Manager
	workDir string
}

func NewUploadExecutor(manager *storage.Manager, workDir string) *UploadExecutor {
	return &UploadExecutor{manager: manager, workDir: workDir}
}

func (e *UploadExecutor) Run(ctx context.Context, env sandbox.RuntimeEnvironment, args map[string]interface{}) (string, error) {
	path, _ := args["path"].(string)
	if path == "" {
		path, _ = args["file"].(string)
	}
	if path == "" {
		return "", fmt.Errorf("missing required arg: path")
	}

	bucket, _ := args["bucket"].(string)
	if bucket == "" {
		bucket = "default"
	}

	if !filepath.IsAbs(path) {
		path = filepath.Join(e.workDir, path)
	}

	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open file: %w", err)
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return "", fmt.Errorf("stat file: %w", err)
	}

	sessionID, _ := args["session_id"].(string)
	key := e.manager.BuildKey(sessionID, bucket, filepath.Base(path))

	result, err := e.manager.Upload(ctx, storage.UploadRequest{
		Key:  key,
		Body: f,
		Size: fi.Size(),
	})
	if err != nil {
		return "", fmt.Errorf("upload: %w", err)
	}

	return fmt.Sprintf(`{"artifact_id":"%s","url":"%s","checksum":"%s","size":%d,"key":"%s"}`,
		key, e.manager.PublicURL(key), result.Checksum, result.Size, result.Key), nil
}
