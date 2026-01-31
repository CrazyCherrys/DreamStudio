package service

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"

	infraerrors "github.com/CrazyCherrys/DreamStudio/internal/pkg/errors"
	"github.com/CrazyCherrys/DreamStudio/internal/pkg/pagination"
)

var (
	ErrRedInkInvalid       = infraerrors.BadRequest("REDINK_INVALID", "invalid redink request")
	ErrRedInkNotFound      = infraerrors.NotFound("REDINK_NOT_FOUND", "redink record not found")
	ErrRedInkNotEditable   = infraerrors.Forbidden("REDINK_NOT_EDITABLE", "redink record is not editable")
	ErrRedInkGenerateError = infraerrors.ServiceUnavailable("REDINK_GENERATE_FAILED", "redink generation failed")
)

type RedInkOutlineInput struct {
	UserID    int64
	Topic     string
	Images    []string
	ModelID   string
	PageCount int
}

type RedInkOutlineResult struct {
	Outline string
	Pages   []RedInkOutlinePage
}

type RedInkContentInput struct {
	UserID  int64
	Topic   string
	Outline string
	ModelID string
}

type RedInkRecordCreateInput struct {
	UserID       int64
	Topic        string
	OutlineRaw   string
	Content      *RedInkContentResult
	Pages        []RedInkOutlinePage
	InputImages  []string
	TextModelID  string
	ImageModelID string
	Resolution   string
	AspectRatio  string
}

type RedInkRecordUpdateInput struct {
	OutlineRaw string
	Pages      []RedInkOutlinePage
}

type RedInkGenerationOptions struct {
	ImageModelID string
	Resolution   string
	AspectRatio  string
}

type RedInkService struct {
	repo           RedInkRepository
	settingService *SettingService
	storageService *StorageService
	httpClient     *http.Client
}

func NewRedInkService(repo RedInkRepository, settingService *SettingService, storageService *StorageService) *RedInkService {
	return &RedInkService{
		repo:           repo,
		settingService: settingService,
		storageService: storageService,
		httpClient: &http.Client{
			Timeout: imageRequestTimeout,
		},
	}
}

func (s *RedInkService) GenerateOutline(ctx context.Context, input RedInkOutlineInput) (*RedInkOutlineResult, error) {
	if input.UserID <= 0 {
		return nil, ErrRedInkInvalid
	}
	topic := strings.TrimSpace(input.Topic)
	if topic == "" {
		return nil, ErrRedInkInvalid
	}

	settings, err := s.settingService.GetRedInkSettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("get redink settings: %w", err)
	}
	modelID := strings.TrimSpace(input.ModelID)
	if modelID == "" {
		modelID = settings.TextModelID
	}
	if modelID == "" {
		return nil, ErrRedInkInvalid
	}

	prompt := strings.ReplaceAll(settings.OutlinePrompt, "{topic}", topic)
	if len(input.Images) > 0 {
		prompt = prompt + "\n\n注意：用户提供了参考图片，请在生成大纲时考虑图片内容与风格。"
	}
	pageLimit := settings.MaxPages
	if input.PageCount > 0 {
		if input.PageCount < pageLimit {
			pageLimit = input.PageCount
		}
		prompt = fmt.Sprintf("%s\n\n页数要求：请生成 %d 页内容（含封面）。", prompt, pageLimit)
	}

	content, err := s.requestChatCompletion(ctx, input.UserID, modelID, prompt, input.Images)
	if err != nil {
		return nil, ErrRedInkGenerateError.WithCause(err)
	}

	pages := parseRedInkOutline(content, pageLimit)
	if len(pages) == 0 {
		return nil, ErrRedInkGenerateError.WithCause(errors.New("outline parse empty"))
	}

	return &RedInkOutlineResult{
		Outline: content,
		Pages:   pages,
	}, nil
}

func (s *RedInkService) GenerateContent(ctx context.Context, input RedInkContentInput) (*RedInkContentResult, error) {
	if input.UserID <= 0 {
		return nil, ErrRedInkInvalid
	}
	topic := strings.TrimSpace(input.Topic)
	outline := strings.TrimSpace(input.Outline)
	if topic == "" || outline == "" {
		return nil, ErrRedInkInvalid
	}

	settings, err := s.settingService.GetRedInkSettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("get redink settings: %w", err)
	}
	modelID := strings.TrimSpace(input.ModelID)
	if modelID == "" {
		modelID = settings.TextModelID
	}
	if modelID == "" {
		return nil, ErrRedInkInvalid
	}

	prompt := strings.ReplaceAll(settings.ContentPrompt, "{topic}", topic)
	prompt = strings.ReplaceAll(prompt, "{outline}", outline)

	content, err := s.requestChatCompletion(ctx, input.UserID, modelID, prompt, nil)
	if err != nil {
		return nil, ErrRedInkGenerateError.WithCause(err)
	}

	parsed, err := parseRedInkContentJSON(content)
	if err != nil {
		return nil, ErrRedInkGenerateError.WithCause(err)
	}
	return parsed, nil
}

func (s *RedInkService) CreateRecord(ctx context.Context, input RedInkRecordCreateInput) (*RedInkRecord, []RedInkPage, error) {
	if input.UserID <= 0 {
		return nil, nil, ErrRedInkInvalid
	}
	topic := strings.TrimSpace(input.Topic)
	if topic == "" || len(input.Pages) == 0 {
		return nil, nil, ErrRedInkInvalid
	}

	settings, err := s.settingService.GetRedInkSettings(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("get redink settings: %w", err)
	}

	textModelID := strings.TrimSpace(input.TextModelID)
	if textModelID == "" {
		textModelID = settings.TextModelID
	}
	imageModelID := strings.TrimSpace(input.ImageModelID)
	if imageModelID == "" {
		imageModelID = settings.ImageModelID
	}
	resolution := strings.TrimSpace(input.Resolution)
	if resolution == "" {
		resolution = settings.Resolution
	}
	aspectRatio := strings.TrimSpace(input.AspectRatio)
	if aspectRatio == "" {
		aspectRatio = settings.AspectRatio
	}

	storedImages := s.storeInputImages(ctx, input.InputImages)

	record := &RedInkRecord{
		UserID:       input.UserID,
		Topic:        topic,
		OutlineRaw:   strings.TrimSpace(input.OutlineRaw),
		Content:      input.Content,
		InputImages:  storedImages,
		TextModelID:  textModelID,
		ImageModelID: imageModelID,
		Resolution:   resolution,
		AspectRatio:  aspectRatio,
		Status:       RedInkRecordStatusDraft,
	}

	pages := normalizeOutlinePages(input.Pages)
	pageEntities := make([]RedInkPage, 0, len(pages))
	for _, page := range pages {
		pageEntities = append(pageEntities, RedInkPage{
			PageIndex:   page.Index,
			PageType:    normalizeRedInkPageType(page.Type),
			PageContent: strings.TrimSpace(page.Content),
			Status:      RedInkPageStatusPending,
		})
	}

	if err := s.repo.CreateRecord(ctx, record, pageEntities); err != nil {
		return nil, nil, err
	}

	_, pagesOut, err := s.repo.GetByUser(ctx, input.UserID, record.ID)
	if err != nil {
		return record, pageEntities, nil
	}
	return record, pagesOut, nil
}

func (s *RedInkService) UpdateRecordOutline(ctx context.Context, userID, recordID int64, input RedInkRecordUpdateInput) (*RedInkRecord, []RedInkPage, error) {
	if userID <= 0 || recordID <= 0 {
		return nil, nil, ErrRedInkInvalid
	}

	record, pages, err := s.repo.GetByUser(ctx, userID, recordID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, ErrRedInkNotFound
		}
		return nil, nil, err
	}
	if record.Status != RedInkRecordStatusDraft {
		return nil, nil, ErrRedInkNotEditable
	}

	normalizedPages := normalizeOutlinePages(input.Pages)
	pageEntities := make([]RedInkPage, 0, len(normalizedPages))
	for _, page := range normalizedPages {
		pageEntities = append(pageEntities, RedInkPage{
			PageIndex:   page.Index,
			PageType:    normalizeRedInkPageType(page.Type),
			PageContent: strings.TrimSpace(page.Content),
			Status:      RedInkPageStatusPending,
		})
	}

	record.OutlineRaw = strings.TrimSpace(input.OutlineRaw)
	if err := s.repo.UpdateRecord(ctx, record); err != nil {
		return record, pages, err
	}
	if err := s.repo.ReplacePages(ctx, record.ID, pageEntities); err != nil {
		return record, pages, err
	}

	return s.repo.GetByUser(ctx, userID, recordID)
}

func (s *RedInkService) ListRecords(ctx context.Context, userID int64, params pagination.PaginationParams, filters RedInkRecordFilters) ([]RedInkRecordSummary, *pagination.PaginationResult, error) {
	if userID <= 0 {
		return nil, nil, ErrRedInkInvalid
	}
	return s.repo.ListByUser(ctx, userID, params, filters)
}

func (s *RedInkService) GetRecord(ctx context.Context, userID, recordID int64) (*RedInkRecord, []RedInkPage, error) {
	if userID <= 0 || recordID <= 0 {
		return nil, nil, ErrRedInkInvalid
	}
	record, pages, err := s.repo.GetByUser(ctx, userID, recordID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, ErrRedInkNotFound
		}
		return nil, nil, err
	}
	return record, pages, nil
}

func (s *RedInkService) DeleteRecord(ctx context.Context, userID, recordID int64) error {
	if userID <= 0 || recordID <= 0 {
		return ErrRedInkInvalid
	}
	if err := s.repo.MarkDeleted(ctx, userID, recordID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrRedInkNotFound
		}
		return err
	}
	return nil
}

func (s *RedInkService) StartGeneration(ctx context.Context, userID, recordID int64, opts RedInkGenerationOptions) error {
	if userID <= 0 || recordID <= 0 {
		return ErrRedInkInvalid
	}
	record, _, err := s.repo.GetByUser(ctx, userID, recordID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrRedInkNotFound
		}
		return err
	}

	if modelID := strings.TrimSpace(opts.ImageModelID); modelID != "" {
		record.ImageModelID = modelID
	}
	if resolution := strings.TrimSpace(opts.Resolution); resolution != "" {
		record.Resolution = resolution
	}
	if ratio := strings.TrimSpace(opts.AspectRatio); ratio != "" {
		record.AspectRatio = ratio
	}
	record.Status = RedInkRecordStatusGenerating

	if err := s.repo.UpdateRecord(ctx, record); err != nil {
		return err
	}
	if err := s.repo.ResetPages(ctx, record.ID, nil); err != nil {
		return err
	}
	return nil
}

func (s *RedInkService) RetryFailedPages(ctx context.Context, userID, recordID int64, pageIDs []int64) error {
	if userID <= 0 || recordID <= 0 {
		return ErrRedInkInvalid
	}
	record, pages, err := s.repo.GetByUser(ctx, userID, recordID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrRedInkNotFound
		}
		return err
	}

	targetIDs := pageIDs
	if len(targetIDs) == 0 {
		for _, page := range pages {
			if page.Status == RedInkPageStatusFailed {
				targetIDs = append(targetIDs, page.ID)
			}
		}
	}
	if len(targetIDs) == 0 {
		return nil
	}

	if err := s.repo.ResetPages(ctx, record.ID, targetIDs); err != nil {
		return err
	}
	record.Status = RedInkRecordStatusGenerating
	return s.repo.UpdateRecordStatus(ctx, record.ID, record.Status)
}

func (s *RedInkService) requestChatCompletion(ctx context.Context, userID int64, modelID string, prompt string, images []string) (string, error) {
	settings, err := s.settingService.GetNewAPISettings(ctx)
	if err != nil {
		return "", err
	}

	accessKey, err := s.settingService.ResolveUserNewAPIAccessKey(ctx, userID, settings)
	if err != nil {
		return "", err
	}

	req, err := buildRedInkChatRequest(ctx, settings.BaseURL, accessKey, modelID, prompt, images)
	if err != nil {
		return "", err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("newapi chat failed: %s", formatNewAPIError(resp.StatusCode, body))
	}

	content := parseOpenAIChatResponse(body)
	if strings.TrimSpace(content) == "" {
		return "", errors.New("empty chat response")
	}
	return content, nil
}

func buildRedInkChatRequest(ctx context.Context, baseURL, accessKey, modelID, prompt string, images []string) (*http.Request, error) {
	endpoint, err := buildOpenAIImageURL(baseURL, "chat/completions")
	if err != nil {
		return nil, err
	}

	var messages []map[string]any
	if len(images) == 0 {
		messages = []map[string]any{
			{"role": "user", "content": prompt},
		}
	} else {
		content := make([]any, 0, len(images)+1)
		content = append(content, map[string]any{
			"type": "text",
			"text": prompt,
		})
		for _, image := range images {
			if strings.TrimSpace(image) == "" {
				continue
			}
			content = append(content, map[string]any{
				"type": "image_url",
				"image_url": map[string]any{
					"url": image,
				},
			})
		}
		messages = []map[string]any{
			{"role": "user", "content": content},
		}
	}

	payload := map[string]any{
		"model":       modelID,
		"messages":    messages,
		"temperature": 0.7,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	applyNewAPIHeaders(req, accessKey)
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

func parseRedInkOutline(raw string, maxPages int) []RedInkOutlinePage {
	cleaned := strings.TrimSpace(raw)
	if cleaned == "" {
		return nil
	}

	parts := splitOutlinePages(cleaned)
	out := make([]RedInkOutlinePage, 0, len(parts))

	for _, part := range parts {
		text := strings.TrimSpace(part)
		if text == "" {
			continue
		}
		pageType, content := parseOutlinePageContent(text)
		out = append(out, RedInkOutlinePage{
			Type:    pageType,
			Content: content,
		})
	}

	out = normalizeOutlinePages(out)
	if maxPages > 0 && len(out) > maxPages {
		out = out[:maxPages]
	}
	return out
}

func splitOutlinePages(raw string) []string {
	if strings.Contains(strings.ToLower(raw), "<page>") {
		re := regexp.MustCompile(`(?i)<page>`)
		return re.Split(raw, -1)
	}
	if strings.Contains(raw, "---") {
		return strings.Split(raw, "---")
	}
	return []string{raw}
}

func parseOutlinePageContent(raw string) (string, string) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return RedInkPageTypeContent, ""
	}

	lines := strings.Split(text, "\n")
	if len(lines) == 0 {
		return RedInkPageTypeContent, text
	}

	typeLine := strings.TrimSpace(lines[0])
	typeValue := normalizeRedInkPageType(typeLine)
	if typeValue == RedInkPageTypeContent && strings.HasPrefix(typeLine, "[") {
		matched := regexp.MustCompile(`^\[(.+)\]`).FindStringSubmatch(typeLine)
		if len(matched) > 1 {
			typeValue = normalizeRedInkPageType(matched[1])
		}
	}

	content := text
	if strings.HasPrefix(typeLine, "[") {
		content = strings.TrimSpace(strings.TrimPrefix(text, typeLine))
		if content == "" && len(lines) > 1 {
			content = strings.TrimSpace(strings.Join(lines[1:], "\n"))
		}
	}

	if content == "" {
		content = text
	}
	return typeValue, content
}

func normalizeOutlinePages(pages []RedInkOutlinePage) []RedInkOutlinePage {
	if len(pages) == 0 {
		return []RedInkOutlinePage{}
	}

	normalized := make([]RedInkOutlinePage, 0, len(pages))
	hasCover := false
	for _, page := range pages {
		content := strings.TrimSpace(page.Content)
		if content == "" {
			continue
		}
		pageType := normalizeRedInkPageType(page.Type)
		if pageType == RedInkPageTypeCover {
			hasCover = true
		}
		normalized = append(normalized, RedInkOutlinePage{
			Type:    pageType,
			Content: content,
		})
	}

	if len(normalized) == 0 {
		return []RedInkOutlinePage{}
	}

	if !hasCover {
		normalized[0].Type = RedInkPageTypeCover
	}

	for i := range normalized {
		normalized[i].Index = i
	}
	return normalized
}

func normalizeRedInkPageType(value string) string {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	switch trimmed {
	case "封面", "cover":
		return RedInkPageTypeCover
	case "总结", "summary":
		return RedInkPageTypeSummary
	default:
		return RedInkPageTypeContent
	}
}

func parseRedInkContentJSON(raw string) (*RedInkContentResult, error) {
	cleaned := strings.TrimSpace(raw)
	if cleaned == "" {
		return nil, errors.New("empty content response")
	}

	start := strings.Index(cleaned, "{")
	end := strings.LastIndex(cleaned, "}")
	if start < 0 || end <= start {
		return nil, errors.New("missing json payload")
	}

	payload := cleaned[start : end+1]
	var content RedInkContentResult
	if err := json.Unmarshal([]byte(payload), &content); err != nil {
		return nil, err
	}
	return &content, nil
}

func (s *RedInkService) storeInputImages(ctx context.Context, images []string) []string {
	if len(images) == 0 {
		return nil
	}
	if s.storageService == nil {
		return images
	}

	out := make([]string, 0, len(images))
	for _, image := range images {
		trimmed := strings.TrimSpace(image)
		if trimmed == "" {
			continue
		}
		stored, err := s.storageService.StoreImage(ctx, GeneratedImage{URL: trimmed})
		if err != nil || strings.TrimSpace(stored.URL) == "" {
			out = append(out, trimmed)
			continue
		}
		out = append(out, strings.TrimSpace(stored.URL))
	}
	return out
}
