package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	infraerrors "github.com/CrazyCherrys/DreamStudio/internal/pkg/errors"
)

const (
	videoRequestTimeout = 180 * time.Second // 增加到 180 秒（3 分钟）
)

var ErrVideoGenerationInvalid = infraerrors.BadRequest("VIDEO_GENERATION_INVALID", "invalid video generation request")

// VideoGenerationInput defines input parameters for Sora video generation.
type VideoGenerationInput struct {
	UserID   int64
	ModelID  string
	Prompt   string
	Image    string
	Duration int
	Width    int
	Height   int
	FPS      int
	Seed     int
	Count    int
}

type SoraVideoError struct {
	Message string `json:"message"`
	Code    string `json:"code"`
}

type SoraVideoResponse struct {
	ID          string                 `json:"id"`
	Object      string                 `json:"object"`
	Model       string                 `json:"model"`
	Status      string                 `json:"status"`
	Progress    int                    `json:"progress"`
	CreatedAt   int64                  `json:"created_at"`
	Seconds     string                 `json:"seconds"`
	CompletedAt *int64                 `json:"completed_at,omitempty"`
	ExpiresAt   *int64                 `json:"expires_at,omitempty"`
	Size        string                 `json:"size,omitempty"`
	Error       *SoraVideoError        `json:"error,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type VideoGenerationService struct {
	settingService *SettingService
	storageService *StorageService
	httpClient     *http.Client
}

func NewVideoGenerationService(settingService *SettingService, storageService *StorageService) *VideoGenerationService {
	return &VideoGenerationService{
		settingService: settingService,
		storageService: storageService,
		httpClient: &http.Client{
			Timeout: videoRequestTimeout,
		},
	}
}

func (s *VideoGenerationService) Create(ctx context.Context, input VideoGenerationInput) (*SoraVideoResponse, error) {
	if input.UserID <= 0 {
		return nil, ErrVideoGenerationInvalid
	}
	modelID := strings.TrimSpace(input.ModelID)
	prompt := strings.TrimSpace(input.Prompt)
	image := strings.TrimSpace(input.Image)
	if modelID == "" || (prompt == "" && image == "") {
		return nil, ErrVideoGenerationInvalid
	}

	timeoutSettings, err := s.settingService.GetGenerationTimeoutSettings(ctx)
	if err != nil {
		log.Printf("Failed to get generation timeout settings, using default: %v", err)
		timeoutSettings = DefaultGenerationTimeoutSettings()
	}

	timeout := time.Duration(timeoutSettings.VideoTimeoutSeconds) * time.Second
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	settings, err := s.settingService.GetNewAPISettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("get newapi settings: %w", err)
	}

	accessKey, err := s.settingService.ResolveUserNewAPIAccessKey(ctx, input.UserID, settings)
	if err != nil {
		return nil, err
	}

	req, err := buildSoraVideoRequest(ctx, settings.BaseURL, accessKey, input)
	if err != nil {
		return nil, err
	}

	httpClient := &http.Client{
		Timeout: timeout,
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request newapi video: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read newapi video response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_VIDEO_FAILED", formatNewAPIError(resp.StatusCode, body))
	}

	result := parseSoraVideoResponse(body)
	if result == nil || strings.TrimSpace(result.ID) == "" {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_VIDEO_FAILED", "video task id missing")
	}
	if result.Error != nil && strings.TrimSpace(result.Error.Message) != "" {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_VIDEO_FAILED", strings.TrimSpace(result.Error.Message))
	}
	return result, nil
}

func (s *VideoGenerationService) GetStatus(ctx context.Context, userID int64, videoID string) (*SoraVideoResponse, error) {
	trimmedID := strings.TrimSpace(videoID)
	if trimmedID == "" {
		return nil, ErrVideoGenerationInvalid
	}

	settings, err := s.settingService.GetNewAPISettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("get newapi settings: %w", err)
	}

	accessKey, err := s.settingService.ResolveUserNewAPIAccessKey(ctx, userID, settings)
	if err != nil {
		return nil, err
	}

	endpoint, err := buildOpenAIImageURL(settings.BaseURL, fmt.Sprintf("videos/%s", url.PathEscape(trimmedID)))
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create video status request: %w", err)
	}
	applyNewAPIHeaders(req, accessKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request newapi video status: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read newapi video status response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_VIDEO_STATUS_FAILED", formatNewAPIError(resp.StatusCode, body))
	}

	result := parseSoraVideoResponse(body)
	if result == nil || strings.TrimSpace(result.ID) == "" {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_VIDEO_STATUS_FAILED", "video task id missing")
	}
	return result, nil
}

func (s *VideoGenerationService) StoreContent(ctx context.Context, userID int64, videoID string) (string, error) {
	trimmedID := strings.TrimSpace(videoID)
	if trimmedID == "" {
		return "", ErrVideoGenerationInvalid
	}
	if s.storageService == nil {
		return "", infraerrors.ServiceUnavailable("VIDEO_STORAGE_MISSING", "storage service not configured")
	}

	settings, err := s.settingService.GetNewAPISettings(ctx)
	if err != nil {
		return "", fmt.Errorf("get newapi settings: %w", err)
	}

	accessKey, err := s.settingService.ResolveUserNewAPIAccessKey(ctx, userID, settings)
	if err != nil {
		return "", err
	}

	endpoint, err := buildOpenAIImageURL(settings.BaseURL, fmt.Sprintf("videos/%s/content", url.PathEscape(trimmedID)))
	if err != nil {
		return "", err
	}

	stored, err := s.storageService.StoreGeneratedImagesWithAuth(ctx, []GeneratedImage{{URL: endpoint}}, accessKey)
	if err != nil {
		log.Printf("storage: failed to store video content (user_id=%d, video_id=%s): %v",
			userID, trimmedID, err)
		return endpoint, fmt.Errorf("store video content: %w", err)
	}
	if len(stored) == 0 || strings.TrimSpace(stored[0].URL) == "" {
		fallbackErr := infraerrors.ServiceUnavailable("VIDEO_STORE_FAILED", "no stored video url")
		log.Printf("storage: empty stored video url (user_id=%d, video_id=%s): %v",
			userID, trimmedID, fallbackErr)
		return endpoint, fallbackErr
	}
	return stored[0].URL, nil
}

func buildSoraVideoRequest(
	ctx context.Context,
	baseURL string,
	accessKey string,
	input VideoGenerationInput,
) (*http.Request, error) {
	endpoint, err := buildOpenAIImageURL(baseURL, "videos")
	if err != nil {
		return nil, err
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	if err := writer.WriteField("model", strings.TrimSpace(input.ModelID)); err != nil {
		return nil, fmt.Errorf("write model field: %w", err)
	}
	if prompt := strings.TrimSpace(input.Prompt); prompt != "" {
		if err := writer.WriteField("prompt", prompt); err != nil {
			return nil, fmt.Errorf("write prompt field: %w", err)
		}
	}
	if image := strings.TrimSpace(input.Image); image != "" {
		if err := writer.WriteField("image", image); err != nil {
			return nil, fmt.Errorf("write image field: %w", err)
		}
	}
	if input.Duration > 0 {
		if err := writer.WriteField("duration", strconv.Itoa(input.Duration)); err != nil {
			return nil, fmt.Errorf("write duration field: %w", err)
		}
	}
	if input.Width > 0 {
		if err := writer.WriteField("width", strconv.Itoa(input.Width)); err != nil {
			return nil, fmt.Errorf("write width field: %w", err)
		}
	}
	if input.Height > 0 {
		if err := writer.WriteField("height", strconv.Itoa(input.Height)); err != nil {
			return nil, fmt.Errorf("write height field: %w", err)
		}
	}
	if input.FPS > 0 {
		if err := writer.WriteField("fps", strconv.Itoa(input.FPS)); err != nil {
			return nil, fmt.Errorf("write fps field: %w", err)
		}
	}
	if input.Seed > 0 {
		if err := writer.WriteField("seed", strconv.Itoa(input.Seed)); err != nil {
			return nil, fmt.Errorf("write seed field: %w", err)
		}
	}
	if input.Count > 0 {
		if err := writer.WriteField("n", strconv.Itoa(input.Count)); err != nil {
			return nil, fmt.Errorf("write count field: %w", err)
		}
	}
	if input.UserID > 0 {
		if err := writer.WriteField("user", strconv.FormatInt(input.UserID, 10)); err != nil {
			return nil, fmt.Errorf("write user field: %w", err)
		}
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("finalize multipart: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
	if err != nil {
		return nil, fmt.Errorf("create video request: %w", err)
	}
	applyNewAPIHeaders(req, accessKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req, nil
}

func parseSoraVideoResponse(body []byte) *SoraVideoResponse {
	var resp SoraVideoResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil
	}
	return &resp
}
