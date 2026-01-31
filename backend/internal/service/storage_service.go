package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	infraerrors "github.com/CrazyCherrys/DreamStudio/internal/pkg/errors"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const (
	defaultLocalStorageRoot = "data/uploads"
	localStorageURLPrefix   = "/api/v1/storage"
)

var (
	ErrStorageInvalid = infraerrors.BadRequest("STORAGE_INVALID", "invalid storage configuration")
	ErrStorageFailed  = infraerrors.ServiceUnavailable("STORAGE_FAILED", "failed to store image")
)

type StorageService struct {
	settingService *SettingService
	httpClient     *http.Client
	localRoot      string
	s3Mu           sync.Mutex
	s3Client       *minio.Client
	s3Config       *StorageSettings
}

type StorageHealth struct {
	Backend   string `json:"backend"`
	Ready     bool   `json:"ready"`
	Error     string `json:"error,omitempty"`
	LocalRoot string `json:"local_root,omitempty"`
	Bucket    string `json:"bucket,omitempty"`
	Endpoint  string `json:"endpoint,omitempty"`
}

func NewStorageService(settingService *SettingService) *StorageService {
	return &StorageService{
		settingService: settingService,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		localRoot: defaultLocalStorageRoot,
	}
}

func (s *StorageService) CheckHealth(ctx context.Context) StorageHealth {
	status := StorageHealth{Backend: "unknown", Ready: false}
	if s == nil || s.settingService == nil {
		status.Error = "storage service not configured"
		return status
	}

	settings, err := s.settingService.GetStorageSettings(ctx)
	if err != nil {
		status.Error = fmt.Sprintf("load storage settings: %v", err)
		return status
	}

	if settings.S3Enabled {
		status.Backend = "s3"
		status.Endpoint = settings.S3Endpoint
		status.Bucket = settings.S3Bucket
		missing := make([]string, 0, 4)
		if settings.S3Endpoint == "" {
			missing = append(missing, "endpoint")
		}
		if settings.S3Bucket == "" {
			missing = append(missing, "bucket")
		}
		if settings.S3AccessKey == "" {
			missing = append(missing, "access_key")
		}
		if settings.S3SecretKey == "" {
			missing = append(missing, "secret_key")
		}
		if len(missing) > 0 {
			status.Error = "missing s3 settings: " + strings.Join(missing, ", ")
			return status
		}
		status.Ready = true
		return status
	}

	status.Backend = "local"
	root := strings.TrimSpace(s.localRoot)
	status.LocalRoot = root
	if root == "" {
		status.Error = "local storage root not configured"
		return status
	}
	info, err := os.Stat(root)
	if err != nil {
		status.Error = fmt.Sprintf("local storage path unavailable: %v", err)
		return status
	}
	if !info.IsDir() {
		status.Error = "local storage path is not a directory"
		return status
	}
	status.Ready = true
	return status
}

func (s *StorageService) StoreGeneratedImages(ctx context.Context, images []GeneratedImage) ([]GeneratedImage, error) {
	return s.storeGeneratedImages(ctx, images, "")
}

func (s *StorageService) StoreGeneratedImagesWithAuth(ctx context.Context, images []GeneratedImage, authHeader string) ([]GeneratedImage, error) {
	return s.storeGeneratedImages(ctx, images, authHeader)
}

func (s *StorageService) storeGeneratedImages(ctx context.Context, images []GeneratedImage, authHeader string) ([]GeneratedImage, error) {
	if len(images) == 0 {
		return images, nil
	}

	out := make([]GeneratedImage, 0, len(images))
	for _, image := range images {
		stored, err := s.storeImage(ctx, image, authHeader)
		if err != nil {
			return nil, err
		}
		out = append(out, stored)
	}
	return out, nil
}

func (s *StorageService) StoreImage(ctx context.Context, image GeneratedImage) (GeneratedImage, error) {
	return s.storeImage(ctx, image, "")
}

func (s *StorageService) DeleteStoredImages(ctx context.Context, imageURLs []string) error {
	if len(imageURLs) == 0 {
		return nil
	}
	settings, err := s.settingService.GetStorageSettings(ctx)
	if err != nil {
		return ErrStorageFailed.WithCause(err)
	}

	var firstErr error
	for _, rawURL := range imageURLs {
		if err := s.deleteStoredImage(ctx, settings, rawURL); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if firstErr != nil {
		return ErrStorageFailed.WithCause(firstErr)
	}
	return nil
}

func (s *StorageService) storeImage(ctx context.Context, image GeneratedImage, authHeader string) (GeneratedImage, error) {
	data, mimeType, err := s.resolveImageData(ctx, image, authHeader)
	if err != nil {
		return GeneratedImage{}, err
	}

	url, err := s.storeBytes(ctx, data, mimeType)
	if err != nil {
		return GeneratedImage{}, err
	}

	return GeneratedImage{
		URL:      url,
		MimeType: mimeType,
	}, nil
}

func (s *StorageService) ResolveLocalPath(key string) (string, error) {
	cleanKey := strings.TrimPrefix(strings.TrimSpace(key), "/")
	if cleanKey == "" {
		return "", ErrStorageInvalid
	}
	cleaned := path.Clean("/" + cleanKey)
	cleaned = strings.TrimPrefix(cleaned, "/")
	if cleaned == "." || strings.HasPrefix(cleaned, "..") {
		return "", ErrStorageInvalid
	}
	return filepath.Join(s.localRoot, filepath.FromSlash(cleaned)), nil
}

func (s *StorageService) resolveImageData(ctx context.Context, image GeneratedImage, authHeader string) ([]byte, string, error) {
	if image.Base64 != "" {
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(image.Base64))
		if err != nil {
			return nil, "", ErrStorageInvalid.WithCause(err)
		}
		return decoded, normalizeMimeType(image.MimeType, decoded), nil
	}

	urlValue := strings.TrimSpace(image.URL)
	if urlValue == "" {
		return nil, "", ErrStorageInvalid
	}

	if strings.HasPrefix(urlValue, "data:") {
		decoded, mimeType, err := parseDataURL(urlValue)
		if err != nil {
			return nil, "", ErrStorageInvalid.WithCause(err)
		}
		return decoded, normalizeMimeType(mimeType, decoded), nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlValue, nil)
	if err != nil {
		return nil, "", ErrStorageInvalid.WithCause(err)
	}
	if headerValue := normalizeAuthHeader(authHeader); headerValue != "" {
		req.Header.Set("Authorization", headerValue)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", ErrStorageFailed.WithCause(err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, "", ErrStorageFailed.WithCause(fmt.Errorf("download failed with status %d", resp.StatusCode))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", ErrStorageFailed.WithCause(err)
	}
	return body, normalizeMimeType(resp.Header.Get("Content-Type"), body), nil
}

func (s *StorageService) storeBytes(ctx context.Context, data []byte, mimeType string) (string, error) {
	settings, err := s.settingService.GetStorageSettings(ctx)
	if err != nil {
		return "", ErrStorageFailed.WithCause(err)
	}

	if settings.S3Enabled {
		return s.storeS3(ctx, settings, data, mimeType)
	}
	return s.storeLocal(data, mimeType)
}

func (s *StorageService) storeLocal(data []byte, mimeType string) (string, error) {
	key := buildObjectKey(mimeType)
	fullPath := filepath.Join(s.localRoot, filepath.FromSlash(key))

	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return "", ErrStorageFailed.WithCause(err)
	}
	if err := os.WriteFile(fullPath, data, 0o644); err != nil {
		return "", ErrStorageFailed.WithCause(err)
	}

	return buildLocalObjectURL(key), nil
}

func (s *StorageService) storeS3(ctx context.Context, settings *StorageSettings, data []byte, mimeType string) (string, error) {
	if settings == nil || settings.S3Endpoint == "" || settings.S3Bucket == "" || settings.S3AccessKey == "" || settings.S3SecretKey == "" {
		return "", ErrStorageInvalid
	}

	client, err := s.getS3Client(settings)
	if err != nil {
		return "", ErrStorageFailed.WithCause(err)
	}

	key := buildObjectKey(mimeType)
	reader := bytes.NewReader(data)
	_, err = client.PutObject(ctx, settings.S3Bucket, key, reader, int64(len(data)), minio.PutObjectOptions{
		ContentType: mimeType,
	})
	if err != nil {
		return "", ErrStorageFailed.WithCause(err)
	}

	url, err := buildS3ObjectURL(settings, key)
	if err != nil {
		return "", ErrStorageFailed.WithCause(err)
	}
	return url, nil
}

func (s *StorageService) getS3Client(settings *StorageSettings) (*minio.Client, error) {
	if settings == nil {
		return nil, ErrStorageInvalid
	}

	s.s3Mu.Lock()
	defer s.s3Mu.Unlock()

	if s.s3Client != nil && s.s3Config != nil && sameS3Config(s.s3Config, settings) {
		return s.s3Client, nil
	}

	endpoint, secure, err := normalizeS3Endpoint(settings.S3Endpoint, settings.S3UseSSL)
	if err != nil {
		return nil, err
	}

	opts := &minio.Options{
		Creds:  credentials.NewStaticV4(settings.S3AccessKey, settings.S3SecretKey, ""),
		Secure: secure,
		Region: settings.S3Region,
	}
	if settings.S3PathStyle {
		opts.BucketLookup = minio.BucketLookupPath
	}

	client, err := minio.New(endpoint, opts)
	if err != nil {
		return nil, err
	}

	s.s3Client = client
	copied := *settings
	s.s3Config = &copied
	return client, nil
}

func sameS3Config(a, b *StorageSettings) bool {
	if a == nil || b == nil {
		return false
	}
	return a.S3Endpoint == b.S3Endpoint &&
		a.S3Region == b.S3Region &&
		a.S3Bucket == b.S3Bucket &&
		a.S3AccessKey == b.S3AccessKey &&
		a.S3SecretKey == b.S3SecretKey &&
		a.S3UseSSL == b.S3UseSSL &&
		a.S3PathStyle == b.S3PathStyle &&
		a.S3PublicURL == b.S3PublicURL
}

func normalizeS3Endpoint(endpoint string, useSSL bool) (string, bool, error) {
	trimmed := strings.TrimSpace(endpoint)
	if trimmed == "" {
		return "", useSSL, ErrStorageInvalid
	}

	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		parsed, err := url.Parse(trimmed)
		if err != nil || parsed.Host == "" {
			return "", useSSL, ErrStorageInvalid.WithCause(err)
		}
		if parsed.Scheme == "https" {
			useSSL = true
		} else if parsed.Scheme == "http" {
			useSSL = false
		}
		trimmed = parsed.Host
	}

	trimmed = strings.TrimRight(trimmed, "/")
	if trimmed == "" {
		return "", useSSL, ErrStorageInvalid
	}
	return trimmed, useSSL, nil
}

func buildS3ObjectURL(settings *StorageSettings, key string) (string, error) {
	if settings == nil {
		return "", ErrStorageInvalid
	}

	key = strings.TrimPrefix(key, "/")
	base := strings.TrimRight(settings.S3PublicURL, "/")
	if base != "" {
		return base + "/" + key, nil
	}

	endpoint, secure, err := normalizeS3Endpoint(settings.S3Endpoint, settings.S3UseSSL)
	if err != nil {
		return "", err
	}

	scheme := "http"
	if secure {
		scheme = "https"
	}

	if settings.S3PathStyle {
		return fmt.Sprintf("%s://%s/%s/%s", scheme, endpoint, settings.S3Bucket, key), nil
	}
	return fmt.Sprintf("%s://%s.%s/%s", scheme, settings.S3Bucket, endpoint, key), nil
}

func buildLocalObjectURL(key string) string {
	clean := strings.TrimPrefix(key, "/")
	return localStorageURLPrefix + "/" + clean
}

func buildObjectKey(mimeType string) string {
	ext := extensionForMimeType(mimeType)
	now := time.Now().UTC()
	return path.Join(
		fmt.Sprintf("%04d", now.Year()),
		fmt.Sprintf("%02d", int(now.Month())),
		fmt.Sprintf("%02d", now.Day()),
		uuid.NewString()+ext,
	)
}

func extensionForMimeType(mimeType string) string {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "image/bmp":
		return ".bmp"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "video/quicktime":
		return ".mov"
	case "application/octet-stream":
		return ".bin"
	default:
		return ".png"
	}
}

func normalizeMimeType(mimeType string, data []byte) string {
	trimmed := strings.TrimSpace(mimeType)
	if trimmed == "" && len(data) > 0 {
		trimmed = http.DetectContentType(data)
	}
	if trimmed == "" {
		return defaultImageMimeType
	}
	if idx := strings.Index(trimmed, ";"); idx >= 0 {
		trimmed = strings.TrimSpace(trimmed[:idx])
	}
	return trimmed
}

func parseDataURL(value string) ([]byte, string, error) {
	if !strings.HasPrefix(value, "data:") {
		return nil, "", errors.New("not a data url")
	}

	parts := strings.SplitN(value, ",", 2)
	if len(parts) != 2 {
		return nil, "", errors.New("invalid data url")
	}

	header := strings.TrimPrefix(parts[0], "data:")
	payload := parts[1]

	mimeType := defaultImageMimeType
	if header != "" {
		headerParts := strings.SplitN(header, ";", 2)
		if len(headerParts) > 0 && strings.TrimSpace(headerParts[0]) != "" {
			mimeType = strings.TrimSpace(headerParts[0])
		}
	}

	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, "", err
	}

	return decoded, mimeType, nil
}

func normalizeAuthHeader(authHeader string) string {
	header := strings.TrimSpace(authHeader)
	if header == "" {
		return ""
	}
	lower := strings.ToLower(header)
	if strings.HasPrefix(lower, "bearer ") {
		return header
	}
	return "Bearer " + header
}

func (s *StorageService) deleteStoredImage(ctx context.Context, settings *StorageSettings, rawURL string) error {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" || strings.HasPrefix(trimmed, "data:") {
		return nil
	}

	if fullPath, ok, err := s.resolveLocalPathFromURL(trimmed); err != nil {
		return err
	} else if ok {
		if err := os.Remove(fullPath); err != nil && !os.IsNotExist(err) {
			return ErrStorageFailed.WithCause(err)
		}
		return nil
	}

	if settings == nil || settings.S3Endpoint == "" || settings.S3Bucket == "" {
		return nil
	}

	key, ok := resolveS3ObjectKey(settings, trimmed)
	if !ok {
		return nil
	}

	client, err := s.getS3Client(settings)
	if err != nil {
		return ErrStorageFailed.WithCause(err)
	}
	if err := client.RemoveObject(ctx, settings.S3Bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return ErrStorageFailed.WithCause(err)
	}
	return nil
}

func (s *StorageService) resolveLocalPathFromURL(rawURL string) (string, bool, error) {
	pathValue := ""
	if strings.HasPrefix(rawURL, "/") {
		pathValue = rawURL
	} else if strings.HasPrefix(rawURL, "http://") || strings.HasPrefix(rawURL, "https://") {
		parsed, err := url.Parse(rawURL)
		if err != nil {
			return "", false, ErrStorageInvalid.WithCause(err)
		}
		pathValue = parsed.Path
	}

	if pathValue == "" {
		return "", false, nil
	}

	prefix := localStorageURLPrefix + "/"
	if !strings.HasPrefix(pathValue, prefix) {
		return "", false, nil
	}

	key := strings.TrimPrefix(pathValue, prefix)
	if key == "" {
		return "", false, nil
	}

	fullPath, err := s.ResolveLocalPath(key)
	if err != nil {
		return "", false, err
	}
	return fullPath, true, nil
}

func resolveS3ObjectKey(settings *StorageSettings, rawURL string) (string, bool) {
	if settings == nil {
		return "", false
	}

	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return "", false
	}

	base := strings.TrimRight(settings.S3PublicURL, "/")
	if base != "" {
		prefix := base + "/"
		if strings.HasPrefix(trimmed, prefix) {
			key := strings.TrimPrefix(trimmed, prefix)
			key = strings.TrimPrefix(key, "/")
			if key == "" {
				return "", false
			}
			return key, true
		}
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return "", false
	}

	endpoint, _, err := normalizeS3Endpoint(settings.S3Endpoint, settings.S3UseSSL)
	if err != nil {
		return "", false
	}

	host := strings.ToLower(parsed.Host)
	endpoint = strings.ToLower(endpoint)
	bucket := strings.ToLower(settings.S3Bucket)
	pathValue := strings.TrimPrefix(parsed.Path, "/")
	if pathValue == "" {
		return "", false
	}

	if settings.S3PathStyle {
		if host != endpoint {
			return "", false
		}
		prefix := bucket + "/"
		if !strings.HasPrefix(pathValue, prefix) {
			return "", false
		}
		key := strings.TrimPrefix(pathValue, prefix)
		if key == "" {
			return "", false
		}
		return key, true
	}

	if !strings.HasPrefix(host, bucket+".") || !strings.HasSuffix(host, endpoint) {
		return "", false
	}
	return pathValue, true
}
