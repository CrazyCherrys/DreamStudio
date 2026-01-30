package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

const (
	userModelSettingsKeyPrefix = "user_model_settings:"
	adminModelSettingsKey      = "admin_model_settings"
	requestEndpointOpenAI      = "openai"
	requestEndpointGemini      = "gemini"
	requestEndpointOpenAIMod   = "openai_mod"
	modelTypeImage             = "image"
	modelTypeVideo             = "video"
	modelTypeText              = "text"
)

type UserModelSetting struct {
	ModelID         string   `json:"model_id"`
	RequestModelID  string   `json:"request_model_id"`
	Resolutions     []string `json:"resolutions"`
	AspectRatios    []string `json:"aspect_ratios"`
	Durations       []string `json:"durations"`
	RequestEndpoint string   `json:"request_endpoint"`
	ModelType       string   `json:"model_type"`
	DisplayName     string   `json:"display_name"`
	RPM             int      `json:"rpm"`
	RPMEnabled      bool     `json:"rpm_enabled"`
}

func (s *SettingService) GetUserModelSettings(ctx context.Context, userID int64) ([]UserModelSetting, error) {
	if userID <= 0 {
		return nil, fmt.Errorf("invalid user id")
	}

	return s.GetAdminModelSettings(ctx)
}

func (s *SettingService) GetAdminModelSettings(ctx context.Context) ([]UserModelSetting, error) {
	raw, err := s.settingRepo.GetValue(ctx, adminModelSettingsKey)
	if err != nil {
		if errors.Is(err, ErrSettingNotFound) {
			return []UserModelSetting{}, nil
		}
		return nil, fmt.Errorf("get admin model settings: %w", err)
	}

	if strings.TrimSpace(raw) == "" {
		return []UserModelSetting{}, nil
	}

	var items []UserModelSetting
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil, fmt.Errorf("parse admin model settings: %w", err)
	}

	return normalizeUserModelSettings(items), nil
}

func (s *SettingService) UpdateUserModelSettings(ctx context.Context, userID int64, items []UserModelSetting) ([]UserModelSetting, error) {
	if userID <= 0 {
		return nil, fmt.Errorf("invalid user id")
	}

	return s.UpdateAdminModelSettings(ctx, items)
}

func (s *SettingService) UpdateAdminModelSettings(ctx context.Context, items []UserModelSetting) ([]UserModelSetting, error) {
	normalized := normalizeUserModelSettings(items)
	payload, err := json.Marshal(normalized)
	if err != nil {
		return nil, fmt.Errorf("encode admin model settings: %w", err)
	}

	if err := s.settingRepo.Set(ctx, adminModelSettingsKey, string(payload)); err != nil {
		return nil, fmt.Errorf("update admin model settings: %w", err)
	}

	return normalized, nil
}

func userModelSettingsKey(userID int64) string {
	return userModelSettingsKeyPrefix + strconv.FormatInt(userID, 10)
}

func normalizeUserModelSettings(items []UserModelSetting) []UserModelSetting {
	if len(items) == 0 {
		return []UserModelSetting{}
	}

	seen := make(map[string]UserModelSetting, len(items))
	order := make([]string, 0, len(items))

	for _, item := range items {
		modelID := strings.TrimSpace(item.ModelID)
		if modelID == "" {
			continue
		}
		resolutions := normalizeStringList(item.Resolutions)
		aspectRatios := normalizeStringList(item.AspectRatios)
		durations := normalizeStringList(item.Durations)
		requestEndpoint := normalizeRequestEndpoint(item.RequestEndpoint)
		modelType := normalizeModelType(item.ModelType)
		requestModelID := normalizeRequestModelID(item.RequestModelID)
		displayName := normalizeDisplayName(item.DisplayName)
		rpm := normalizeRPM(item.RPM)
		rpmEnabled := normalizeRPMEnabled(item.RPMEnabled, rpm)
		if _, exists := seen[modelID]; !exists {
			order = append(order, modelID)
		}
		seen[modelID] = UserModelSetting{
			ModelID:         modelID,
			RequestModelID:  requestModelID,
			Resolutions:     resolutions,
			AspectRatios:    aspectRatios,
			Durations:       durations,
			RequestEndpoint: requestEndpoint,
			ModelType:       modelType,
			DisplayName:     displayName,
			RPM:             rpm,
			RPMEnabled:      rpmEnabled,
		}
	}

	result := make([]UserModelSetting, 0, len(order))
	for _, modelID := range order {
		if item, ok := seen[modelID]; ok {
			result = append(result, item)
		}
	}
	return result
}

func normalizeStringList(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func normalizeRequestEndpoint(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	switch trimmed {
	case requestEndpointOpenAI, requestEndpointGemini, requestEndpointOpenAIMod:
		return trimmed
	default:
		return ""
	}
}

func normalizeModelType(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	switch trimmed {
	case modelTypeImage, modelTypeVideo, modelTypeText:
		return trimmed
	default:
		return ""
	}
}

func normalizeRequestModelID(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return trimmed
}

func normalizeDisplayName(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return trimmed
}

func normalizeRPM(value int) int {
	if value < 0 {
		return 0
	}
	return value
}

func normalizeRPMEnabled(enabled bool, rpm int) bool {
	return enabled && rpm > 0
}
