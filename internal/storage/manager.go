package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strings"

	"github.com/kendaliai/app/internal/config"
)

var DefaultManager *Manager

func Init(cfg *config.Config) error {
	mgr, err := NewManagerFromConfig(cfg)
	if err != nil {
		return err
	}
	DefaultManager = mgr
	return nil
}

type Manager struct {
	storage ObjectStorage
	cfg     *config.StorageConfig
}

func NewManager(storage ObjectStorage, cfg *config.StorageConfig) *Manager {
	return &Manager{
		storage: storage,
		cfg:     cfg,
	}
}

func (m *Manager) Upload(ctx context.Context, req UploadRequest) (*UploadResult, error) {
	if req.ContentType == "" {
		ext := filepath.Ext(req.Key)
		req.ContentType = mime.TypeByExtension(ext)
		if req.ContentType == "" {
			req.ContentType = "application/octet-stream"
		}
	}

	hasher := sha256.New()
	reader := io.TeeReader(req.Body, hasher)

	uploadReq := UploadRequest{
		Key:         req.Key,
		Body:        reader,
		ContentType: req.ContentType,
		Size:        req.Size,
		Metadata:    req.Metadata,
	}

	result, err := m.storage.Upload(ctx, uploadReq)
	if err != nil {
		return nil, fmt.Errorf("storage upload: %w", err)
	}

	result.Checksum = hex.EncodeToString(hasher.Sum(nil))
	result.Mime = req.ContentType

	return result, nil
}

func (m *Manager) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	return m.storage.Download(ctx, key)
}

func (m *Manager) Delete(ctx context.Context, key string) error {
	return m.storage.Delete(ctx, key)
}

func (m *Manager) Exists(ctx context.Context, key string) (bool, error) {
	return m.storage.Exists(ctx, key)
}

func (m *Manager) List(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	return m.storage.List(ctx, prefix)
}

func (m *Manager) BuildKey(sessionID, category, filename string) string {
	parts := []string{"sessions", sessionID, category, filename}
	return strings.Join(parts, "/")
}

func (m *Manager) PublicURL(key string) string {
	if m.cfg.PublicURL != "" {
		base := strings.TrimRight(m.cfg.PublicURL, "/")
		return fmt.Sprintf("%s/%s", base, key)
	}
	return key
}
