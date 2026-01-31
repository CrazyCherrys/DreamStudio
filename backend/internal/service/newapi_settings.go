package service

import (
	"context"
	"fmt"
	"strings"
)

const DefaultNewAPIBaseURL = "https://api.haokun.de"

type NewAPISettings struct {
	BaseURL             string
	AccessKey           string
	AccessKeyConfigured bool
	DefaultModel        string
}

type UpdateNewAPISettingsInput struct {
	BaseURL      *string
	AccessKey    *string
	DefaultModel *string
}

func (s *SettingService) GetNewAPISettings(ctx context.Context) (*NewAPISettings, error) {
	keys := []string{
		SettingKeyNewAPIBaseURL,
		SettingKeyNewAPIAccessKey,
		SettingKeyNewAPIDefaultModel,
	}

	settings, err := s.settingRepo.GetMultiple(ctx, keys)
	if err != nil {
		return nil, fmt.Errorf("get newapi settings: %w", err)
	}

	baseURL := strings.TrimSpace(settings[SettingKeyNewAPIBaseURL])
	if baseURL == "" {
		baseURL = DefaultNewAPIBaseURL
	}

	accessKey := strings.TrimSpace(settings[SettingKeyNewAPIAccessKey])
	defaultModel := strings.TrimSpace(settings[SettingKeyNewAPIDefaultModel])

	return &NewAPISettings{
		BaseURL:             baseURL,
		AccessKey:           accessKey,
		AccessKeyConfigured: accessKey != "",
		DefaultModel:        defaultModel,
	}, nil
}

func (s *SettingService) UpdateNewAPISettings(ctx context.Context, input UpdateNewAPISettingsInput) (*NewAPISettings, error) {
	updates := make(map[string]string)

	if input.BaseURL != nil {
		updates[SettingKeyNewAPIBaseURL] = strings.TrimSpace(*input.BaseURL)
	}
	if input.AccessKey != nil {
		updates[SettingKeyNewAPIAccessKey] = strings.TrimSpace(*input.AccessKey)
	}
	if input.DefaultModel != nil {
		updates[SettingKeyNewAPIDefaultModel] = strings.TrimSpace(*input.DefaultModel)
	}

	if len(updates) > 0 {
		if err := s.settingRepo.SetMultiple(ctx, updates); err != nil {
			return nil, fmt.Errorf("update newapi settings: %w", err)
		}
		if s.onUpdate != nil {
			s.onUpdate()
		}
	}

	return s.GetNewAPISettings(ctx)
}
