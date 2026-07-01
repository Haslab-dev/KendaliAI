package storage

import (
	"fmt"
	"strings"

	"github.com/kendaliai/app/internal/config"
	"github.com/kendaliai/app/internal/logger"
)

var providerAliases = map[string]string{
	"local":            "local",
	"local storage":    "local",
	"localstorage":     "local",
	"r2":               "r2",
	"s3":               "r2",
	"cloudflare":       "r2",
	"cloudflare r2":    "r2",
	"cloudflarer2":     "r2",
	"minio":            "r2",
	"backblaze":        "r2",
	"b2":               "r2",
}

func ResolveProvider(name string) string {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if alias, ok := providerAliases[normalized]; ok {
		return alias
	}
	return normalized
}

func NewManagerFromConfig(cfg *config.Config) (*Manager, error) {
	sc := cfg.Storage

	localPath := sc.LocalPath
	if localPath == "" {
		localPath = "./storage"
	}

	local, err := NewLocalStorage(localPath)
	if err != nil {
		return nil, fmt.Errorf("local storage init: %w", err)
	}

	mgr := &Manager{
		local: local,
		cfg:   &sc,
	}

	if sc.R2.Endpoint != "" && sc.R2.AccessKey != "" {
		if sc.R2.Bucket == "" {
			sc.R2.Bucket = "kendaliai"
		}
		if sc.R2.Region == "" {
			sc.R2.Region = "auto"
		}
		r2Cfg := config.StorageConfig{R2: sc.R2}
		r2Storage, r2Err := NewR2Storage(r2Cfg)
		if r2Err != nil {
			logger.Info("Storage", fmt.Sprintf("R2 init failed (local only): %v", r2Err))
		} else {
			mgr.remote = r2Storage
			logger.Info("Storage", "local + R2 initialized")
		}
	} else {
		logger.Info("Storage", "local only (no R2 configured)")
	}

	return mgr, nil
}
