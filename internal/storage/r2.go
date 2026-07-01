package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/url"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	storagecfg "github.com/kendaliai/app/internal/config"
)

type R2Storage struct {
	client *s3.Client
	bucket string
	region string
}

func NewR2Storage(cfg storagecfg.StorageConfig) (*R2Storage, error) {
	endpoint := cfg.R2.Endpoint
	accessKey := cfg.R2.AccessKey
	secretKey := cfg.R2.SecretKey
	region := cfg.R2.Region
	if region == "" {
		region = "auto"
	}

	resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL:           endpoint,
			SigningRegion: region,
		}, nil
	})

	awsCfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		config.WithEndpointResolverWithOptions(resolver),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	return &R2Storage{
		client: client,
		bucket: cfg.R2.Bucket,
		region: region,
	}, nil
}

func (r *R2Storage) Upload(ctx context.Context, req UploadRequest) (*UploadResult, error) {
	data, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	input := &s3.PutObjectInput{
		Bucket:      aws.String(r.bucket),
		Key:         aws.String(req.Key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(req.ContentType),
	}

	if len(req.Metadata) > 0 {
		input.Metadata = req.Metadata
	}

	output, err := r.client.PutObject(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("put object: %w", err)
	}

	size := int64(len(data))
	checksum := ""
	if output.ChecksumSHA256 != nil {
		checksum = *output.ChecksumSHA256
	}

	result := &UploadResult{
		Key:      req.Key,
		Bucket:   r.bucket,
		Size:     size,
		Checksum: checksum,
	}

	return result, nil
}

func (r *R2Storage) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	output, err := r.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}
	return output.Body, nil
}

func (r *R2Storage) Delete(ctx context.Context, key string) error {
	_, err := r.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (r *R2Storage) Exists(ctx context.Context, key string) (bool, error) {
	_, err := r.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		var nf *types.NotFound
		_ = nf
		return false, nil
	}
	return true, nil
}

func (r *R2Storage) List(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	output, err := r.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(r.bucket),
		Prefix: aws.String(prefix),
	})
	if err != nil {
		return nil, fmt.Errorf("list objects: %w", err)
	}

	var results []ObjectInfo
	for _, obj := range output.Contents {
		info := ObjectInfo{
			Key:  aws.ToString(obj.Key),
			Size: aws.ToInt64(obj.Size),
		}
		if obj.LastModified != nil {
			info.LastModified = *obj.LastModified
		}
		results = append(results, info)
	}
	return results, nil
}

var _ ObjectStorage = (*R2Storage)(nil)
var _ = url.Parse
var _ = types.NotFound{}
