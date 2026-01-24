package service

import (
	"context"
	"fmt"
	"strings"
)

type StorageSettings struct {
	S3Enabled   bool
	S3Endpoint  string
	S3Region    string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3PublicURL string
	S3UseSSL    bool
	S3PathStyle bool
}

func (s *SettingService) GetStorageSettings(ctx context.Context) (*StorageSettings, error) {
	keys := []string{
		SettingKeyStorageS3Enabled,
		SettingKeyStorageS3Endpoint,
		SettingKeyStorageS3Region,
		SettingKeyStorageS3Bucket,
		SettingKeyStorageS3AccessKey,
		SettingKeyStorageS3SecretKey,
		SettingKeyStorageS3PublicURL,
		SettingKeyStorageS3UseSSL,
		SettingKeyStorageS3PathStyle,
	}

	settings, err := s.settingRepo.GetMultiple(ctx, keys)
	if err != nil {
		return nil, fmt.Errorf("get storage settings: %w", err)
	}

	return &StorageSettings{
		S3Enabled:   settings[SettingKeyStorageS3Enabled] == "true",
		S3Endpoint:  strings.TrimSpace(settings[SettingKeyStorageS3Endpoint]),
		S3Region:    strings.TrimSpace(settings[SettingKeyStorageS3Region]),
		S3Bucket:    strings.TrimSpace(settings[SettingKeyStorageS3Bucket]),
		S3AccessKey: strings.TrimSpace(settings[SettingKeyStorageS3AccessKey]),
		S3SecretKey: strings.TrimSpace(settings[SettingKeyStorageS3SecretKey]),
		S3PublicURL: strings.TrimSpace(settings[SettingKeyStorageS3PublicURL]),
		S3UseSSL:    settings[SettingKeyStorageS3UseSSL] != "false",
		S3PathStyle: settings[SettingKeyStorageS3PathStyle] == "true",
	}, nil
}
