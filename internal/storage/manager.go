package storage

import (
	"bytes"
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
	local  *LocalStorage
	remote ObjectStorage
	cfg    *config.StorageConfig
}

func (m *Manager) Local() ObjectStorage   { return m.local }
func (m *Manager) Remote() ObjectStorage  { return m.remote }
func (m *Manager) HasRemote() bool        { return m.remote != nil }

func (m *Manager) Upload(ctx context.Context, req UploadRequest, provider string) (*UploadResult, error) {
	if req.ContentType == "" {
		ext := filepath.Ext(req.Key)
		req.ContentType = mime.TypeByExtension(ext)
		if req.ContentType == "" {
			req.ContentType = "application/octet-stream"
		}
	}

	data, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	hasher := sha256.New()
	hasher.Write(data)

	target := m.selectProvider(provider)

	localReq := UploadRequest{
		Key:         req.Key,
		Body:        bytes.NewReader(data),
		ContentType: req.ContentType,
		Size:        int64(len(data)),
		Metadata:    req.Metadata,
	}

	var result *UploadResult

	if target == nil || provider == "local" || provider == "both" {
		result, err = m.local.Upload(ctx, localReq)
		if err != nil {
			return nil, fmt.Errorf("local upload: %w", err)
		}
	}

	if target != nil && (provider == "r2" || provider == "both" || provider == "") {
		r2Req := UploadRequest{
			Key:         req.Key,
			Body:        bytes.NewReader(data),
			ContentType: req.ContentType,
			Size:        int64(len(data)),
			Metadata:    req.Metadata,
		}
		r2Result, r2Err := target.Upload(ctx, r2Req)
		if r2Err != nil {
			return nil, fmt.Errorf("remote upload: %w", r2Err)
		}
		if result == nil {
			result = r2Result
		}
	}

	if result == nil {
		return nil, fmt.Errorf("no storage provider available")
	}

	result.Checksum = hex.EncodeToString(hasher.Sum(nil))
	result.Mime = req.ContentType

	return result, nil
}

func (m *Manager) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	reader, err := m.local.Download(ctx, key)
	if err == nil {
		return reader, nil
	}
	if m.remote != nil {
		return m.remote.Download(ctx, key)
	}
	return nil, err
}

func (m *Manager) Delete(ctx context.Context, key string) error {
	var lastErr error
	if err := m.local.Delete(ctx, key); err != nil && !strings.Contains(err.Error(), "no such file") {
		lastErr = err
	}
	if m.remote != nil {
		if err := m.remote.Delete(ctx, key); err != nil {
			lastErr = err
		}
	}
	return lastErr
}

func (m *Manager) Exists(ctx context.Context, key string) (bool, error) {
	exists, err := m.local.Exists(ctx, key)
	if err == nil && exists {
		return true, nil
	}
	if m.remote != nil {
		return m.remote.Exists(ctx, key)
	}
	return exists, err
}

func (m *Manager) List(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	results, err := m.local.List(ctx, prefix)
	if err != nil {
		results = nil
	}
	if m.remote != nil {
		remoteResults, rErr := m.remote.List(ctx, prefix)
		if rErr == nil {
			results = append(results, remoteResults...)
		}
	}
	return results, nil
}

func (m *Manager) BuildKey(sessionID, category, filename string) string {
	if sessionID == "" {
		return filepath.Join(category, filename)
	}
	return filepath.Join("sessions", sessionID, category, filename)
}

func (m *Manager) PublicURL(key string, provider string) string {
	if provider == "r2" || provider == "both" {
		if m.cfg.R2.PublicURL != "" {
			base := strings.TrimRight(m.cfg.R2.PublicURL, "/")
			return fmt.Sprintf("%s/%s", base, key)
		}
	}
	if m.cfg.LocalPath != "" {
		return filepath.Join(m.cfg.LocalPath, key)
	}
	return key
}

func (m *Manager) selectProvider(provider string) ObjectStorage {
	switch strings.ToLower(provider) {
	case "r2", "cloudflare", "s3", "remote", "cloud":
		return m.remote
	case "local", "both", "":
		return m.local
	default:
		return m.remote
	}
}
