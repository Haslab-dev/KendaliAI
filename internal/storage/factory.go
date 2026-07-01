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
	storageCfg := cfg.Storage
	provider := ResolveProvider(storageCfg.Provider)
	if provider == "" {
		provider = "local"
	}

	var backend ObjectStorage
	var err error

	switch provider {
	case "local":
		path := storageCfg.LocalPath
		if path == "" {
			path = "./storage"
		}
		backend, err = NewLocalStorage(path)
	case "r2":
		if storageCfg.Endpoint == "" || storageCfg.AccessKey == "" {
			logger.Info("Storage", "R2 config incomplete, falling back to local storage")
			path := storageCfg.LocalPath
			if path == "" {
				path = "./storage"
			}
			backend, err = NewLocalStorage(path)
			provider = "local"
		} else {
			backend, err = NewR2Storage(storageCfg)
		}
	default:
		logger.Info("Storage", fmt.Sprintf("unknown provider '%s', falling back to local storage", provider))
		path := storageCfg.LocalPath
		if path == "" {
			path = "./storage"
		}
		backend, err = NewLocalStorage(path)
		provider = "local"
	}

	if err != nil {
		logger.Info("Storage", fmt.Sprintf("provider init failed: %v, falling back to local", err))
		backend, err = NewLocalStorage("./storage")
		if err != nil {
			return nil, fmt.Errorf("local storage fallback failed: %w", err)
		}
	}

	logger.Info("Storage", fmt.Sprintf("initialized provider: %s", provider))
	return NewManager(backend, &storageCfg), nil
}
