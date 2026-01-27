package service

import (
	"context"
	"strconv"
	"strings"
)

type RedInkSettings struct {
	TextModelID      string
	ImageModelID     string
	Resolution       string
	AspectRatio      string
	MaxPages         int
	UseShortPrompt   bool
	HighConcurrency  bool
	OutlinePrompt    string
	ContentPrompt    string
	ImagePrompt      string
	ImagePromptShort string
}

func (s *SettingService) GetRedInkSettings(ctx context.Context) (*RedInkSettings, error) {
	keys := []string{
		SettingKeyRedInkTextModel,
		SettingKeyRedInkImageModel,
		SettingKeyRedInkResolution,
		SettingKeyRedInkAspectRatio,
		SettingKeyRedInkMaxPages,
		SettingKeyRedInkUseShortPrompt,
		SettingKeyRedInkHighConcurrency,
		SettingKeyRedInkOutlinePrompt,
		SettingKeyRedInkContentPrompt,
		SettingKeyRedInkImagePrompt,
		SettingKeyRedInkImagePromptShort,
		SettingKeyNewAPIDefaultModel,
	}

	values, err := s.settingRepo.GetMultiple(ctx, keys)
	if err != nil {
		return nil, err
	}

	textModel := strings.TrimSpace(values[SettingKeyRedInkTextModel])
	imageModel := strings.TrimSpace(values[SettingKeyRedInkImageModel])
	defaultModel := strings.TrimSpace(values[SettingKeyNewAPIDefaultModel])

	if textModel == "" {
		textModel = defaultModel
	}
	if textModel == "" {
		textModel = "gpt-4o"
	}
	if imageModel == "" {
		imageModel = defaultModel
	}

	resolution := strings.TrimSpace(values[SettingKeyRedInkResolution])
	if resolution == "" {
		resolution = "1K"
	}
	aspectRatio := strings.TrimSpace(values[SettingKeyRedInkAspectRatio])
	if aspectRatio == "" {
		aspectRatio = "3:4"
	}

	maxPages := 12
	if raw := strings.TrimSpace(values[SettingKeyRedInkMaxPages]); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			maxPages = parsed
		}
	}
	if maxPages < 2 {
		maxPages = 2
	}
	if maxPages > 30 {
		maxPages = 30
	}

	useShortPrompt := strings.TrimSpace(values[SettingKeyRedInkUseShortPrompt]) == "true"
	highConcurrency := strings.TrimSpace(values[SettingKeyRedInkHighConcurrency]) == "true"

	outlinePrompt := strings.TrimSpace(values[SettingKeyRedInkOutlinePrompt])
	if outlinePrompt == "" {
		outlinePrompt = getRedInkOutlinePrompt()
	}
	contentPrompt := strings.TrimSpace(values[SettingKeyRedInkContentPrompt])
	if contentPrompt == "" {
		contentPrompt = getRedInkContentPrompt()
	}
	imagePrompt := strings.TrimSpace(values[SettingKeyRedInkImagePrompt])
	if imagePrompt == "" {
		imagePrompt = getRedInkImagePrompt()
	}
	imagePromptShort := strings.TrimSpace(values[SettingKeyRedInkImagePromptShort])
	if imagePromptShort == "" {
		imagePromptShort = getRedInkImagePromptShort()
	}

	return &RedInkSettings{
		TextModelID:      textModel,
		ImageModelID:     imageModel,
		Resolution:       resolution,
		AspectRatio:      aspectRatio,
		MaxPages:         maxPages,
		UseShortPrompt:   useShortPrompt,
		HighConcurrency:  highConcurrency,
		OutlinePrompt:    outlinePrompt,
		ContentPrompt:    contentPrompt,
		ImagePrompt:      imagePrompt,
		ImagePromptShort: imagePromptShort,
	}, nil
}
