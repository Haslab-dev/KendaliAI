package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type LocalStorage struct {
	basePath string
}

func NewLocalStorage(basePath string) (*LocalStorage, error) {
	abs, err := filepath.Abs(basePath)
	if err != nil {
		return nil, fmt.Errorf("resolve local storage path: %w", err)
	}
	if err := os.MkdirAll(abs, 0755); err != nil {
		return nil, fmt.Errorf("create local storage dir: %w", err)
	}
	return &LocalStorage{basePath: abs}, nil
}

func (l *LocalStorage) Upload(ctx context.Context, req UploadRequest) (*UploadResult, error) {
	fullPath := filepath.Join(l.basePath, req.Key)
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create dir: %w", err)
	}

	f, err := os.Create(fullPath)
	if err != nil {
		return nil, fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	written, err := io.Copy(f, req.Body)
	if err != nil {
		return nil, fmt.Errorf("write file: %w", err)
	}

	return &UploadResult{
		Key:    req.Key,
		Bucket: "local",
		Size:   written,
		URL:    fullPath,
	}, nil
}

func (l *LocalStorage) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	fullPath := filepath.Join(l.basePath, key)
	return os.Open(fullPath)
}

func (l *LocalStorage) Delete(ctx context.Context, key string) error {
	fullPath := filepath.Join(l.basePath, key)
	if err := os.Remove(fullPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	removeEmptyParents(l.basePath, filepath.Dir(fullPath))
	return nil
}

func (l *LocalStorage) Exists(ctx context.Context, key string) (bool, error) {
	fullPath := filepath.Join(l.basePath, key)
	_, err := os.Stat(fullPath)
	if os.IsNotExist(err) {
		return false, nil
	}
	return err == nil, err
}

func (l *LocalStorage) List(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	searchPath := filepath.Join(l.basePath, prefix)
	var results []ObjectInfo
	_ = filepath.Walk(searchPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(l.basePath, path)
		results = append(results, ObjectInfo{
			Key:          rel,
			Size:         info.Size(),
			LastModified: info.ModTime(),
		})
		return nil
	})
	return results, nil
}

func removeEmptyParents(base, dir string) {
	for dir != base && dir != "." && dir != "/" {
		if entries, err := os.ReadDir(dir); err == nil && len(entries) == 0 {
			os.Remove(dir)
		} else {
			break
		}
		dir = filepath.Dir(dir)
	}
}
