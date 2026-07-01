package storage

import (
	"context"
	"io"
	"time"
)

type UploadRequest struct {
	Key         string
	Body        io.Reader
	ContentType string
	Size        int64
	Metadata    map[string]string
}

type UploadResult struct {
	Key      string
	Bucket   string
	Checksum string
	Size     int64
	Mime     string
	URL      string
}

type ObjectInfo struct {
	Key          string
	Size         int64
	LastModified time.Time
	ContentType  string
	Checksum     string
}

type ObjectStorage interface {
	Upload(ctx context.Context, req UploadRequest) (*UploadResult, error)
	Download(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
	List(ctx context.Context, prefix string) ([]ObjectInfo, error)
}
