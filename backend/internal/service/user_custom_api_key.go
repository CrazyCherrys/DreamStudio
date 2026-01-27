package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

const userCustomAPIKeyPrefix = "user_custom_api_key:"

var (
	ErrUserCustomAPIKeyDisabled = infraerrors.Forbidden("USER_CUSTOM_API_KEY_DISABLED", "user custom api key is disabled")
	ErrUserCustomAPIKeyMissing  = infraerrors.BadRequest("USER_CUSTOM_API_KEY_MISSING", "user custom api key is not configured")
)

// GetUserCustomAPIKey returns the user's configured API key for NewAPI requests.
func (s *SettingService) GetUserCustomAPIKey(ctx context.Context, userID int64) (string, bool, error) {
	if userID <= 0 {
		return "", false, fmt.Errorf("invalid user id")
	}

	raw, err := s.settingRepo.GetValue(ctx, userCustomAPIKeyKey(userID))
	if err != nil {
		if errors.Is(err, ErrSettingNotFound) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("get user custom api key: %w", err)
	}

	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false, nil
	}
	return trimmed, true, nil
}

// UpdateUserCustomAPIKey sets or clears the user's API key for NewAPI requests.
func (s *SettingService) UpdateUserCustomAPIKey(ctx context.Context, userID int64, key string) error {
	if userID <= 0 {
		return fmt.Errorf("invalid user id")
	}
	if !s.IsUserCustomKeyEnabled(ctx) {
		return ErrUserCustomAPIKeyDisabled
	}

	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		if err := s.settingRepo.Delete(ctx, userCustomAPIKeyKey(userID)); err != nil && !errors.Is(err, ErrSettingNotFound) {
			return fmt.Errorf("clear user custom api key: %w", err)
		}
		return nil
	}

	if err := s.settingRepo.Set(ctx, userCustomAPIKeyKey(userID), trimmed); err != nil {
		return fmt.Errorf("update user custom api key: %w", err)
	}
	return nil
}

// ResolveUserNewAPIAccessKey resolves the access key to use for NewAPI requests.
func (s *SettingService) ResolveUserNewAPIAccessKey(ctx context.Context, userID int64, settings *NewAPISettings) (string, error) {
	if userID <= 0 {
		return "", fmt.Errorf("invalid user id")
	}
	if settings == nil {
		return "", fmt.Errorf("newapi settings are required")
	}

	if s.IsUserCustomKeyEnabled(ctx) {
		customKey, ok, err := s.GetUserCustomAPIKey(ctx, userID)
		if err != nil {
			return "", err
		}
		if ok {
			return customKey, nil
		}
		if settings.AccessKeyConfigured {
			return settings.AccessKey, nil
		}
		return "", ErrUserCustomAPIKeyMissing
	}

	if !settings.AccessKeyConfigured {
		return "", infraerrors.BadRequest("NEWAPI_ACCESS_KEY_MISSING", "newapi access key is not configured")
	}
	return settings.AccessKey, nil
}

func userCustomAPIKeyKey(userID int64) string {
	return userCustomAPIKeyPrefix + fmt.Sprintf("%d", userID)
}
