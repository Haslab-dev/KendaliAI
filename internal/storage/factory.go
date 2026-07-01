package storage

import (
	"fmt"

	"github.com/kendaliai/app/internal/config"
)

func NewManagerFromConfig(cfg *config.Config) (*Manager, error) {
	storageCfg := cfg.Storage

	var backend ObjectStorage
	var err error

	switch storageCfg.Provider {
	case "local":
		backend, err = NewLocalStorage(storageCfg.LocalPath)
	case "r2", "s3":
		backend, err = NewR2Storage(storageCfg)
	default:
		return nil, fmt.Errorf("unknown storage provider: %s", storageCfg.Provider)
	}

	if err != nil {
		return nil, fmt.Errorf("init storage backend: %w", err)
	}

	return NewManager(backend, &storageCfg), nil
}
