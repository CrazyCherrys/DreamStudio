package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"strconv"
	"strings"
	"time"

	infraerrors "github.com/CrazyCherrys/DreamStudio/internal/pkg/errors"
)

const (
	defaultImageMimeType = "image/png"
	imageRequestTimeout  = 180 * time.Second // 增加到 180 秒（3 分钟）
)

var (
	ErrImageGenerationInvalid    = infraerrors.BadRequest("IMAGE_GENERATION_INVALID", "invalid image generation request")
	ErrPromptOptimizationInvalid = infraerrors.BadRequest("PROMPT_OPTIMIZE_INVALID", "invalid prompt optimization request")
)

type ImageGenerationInput struct {
	UserID         int64
	ModelID        string
	Prompt         string
	Resolution     string
	AspectRatio    string
	ReferenceImage string
	Count          int
}

type PromptOptimizeInput struct {
	UserID int64
	Prompt string
}

type GeneratedImage struct {
	URL      string `json:"url,omitempty"`
	Base64   string `json:"b64_json,omitempty"`
	MimeType string `json:"mime_type,omitempty"`
}

type ImageGenerationResult struct {
	Images []GeneratedImage `json:"images"`
}

type ImageGenerationService struct {
	settingService *SettingService
	storageService *StorageService
	galleryService *GalleryService
	httpClient     *http.Client
}

func NewImageGenerationService(
	settingService *SettingService,
	storageService *StorageService,
	galleryService *GalleryService,
) *ImageGenerationService {
	return &ImageGenerationService{
		settingService: settingService,
		storageService: storageService,
		galleryService: galleryService,
		httpClient: &http.Client{
			Timeout: imageRequestTimeout,
		},
	}
}

func (s *ImageGenerationService) Generate(ctx context.Context, input ImageGenerationInput) (*ImageGenerationResult, error) {
	if input.UserID <= 0 {
		return nil, ErrImageGenerationInvalid
	}
	modelID := strings.TrimSpace(input.ModelID)
	prompt := strings.TrimSpace(input.Prompt)
	if modelID == "" || prompt == "" {
		return nil, ErrImageGenerationInvalid
	}

	timeoutSettings, err := s.settingService.GetGenerationTimeoutSettings(ctx)
	if err != nil {
		log.Printf("Failed to get generation timeout settings, using default: %v", err)
		timeoutSettings = DefaultGenerationTimeoutSettings()
	}

	timeout := time.Duration(timeoutSettings.ImageTimeoutSeconds) * time.Second
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

	requestEndpoint, err := s.resolveRequestEndpoint(ctx, input.UserID, modelID)
	if err != nil {
		return nil, err
	}

	httpClient := &http.Client{
		Timeout: timeout,
	}

	var result *ImageGenerationResult
	switch requestEndpoint {
	case requestEndpointGemini:
		result, err = s.generateGeminiWithClient(ctx, httpClient, settings.BaseURL, accessKey, modelID, prompt, input)
	case requestEndpointOpenAIMod:
		result, err = s.generateOpenAIModWithClient(ctx, httpClient, settings.BaseURL, accessKey, modelID, prompt, input)
	default:
		result, err = s.generateOpenAIWithClient(ctx, httpClient, settings.BaseURL, accessKey, modelID, prompt, input)
	}
	if err != nil {
		return nil, err
	}

	if s.storageService != nil && len(result.Images) > 0 {
		stored, err := s.storageService.StoreGeneratedImagesWithAuth(ctx, result.Images, accessKey)
		if err != nil {
			log.Printf("storage: failed to store generated images (user_id=%d, model=%s, count=%d): %v",
				input.UserID, modelID, len(result.Images), err)
		} else {
			result.Images = stored
		}
	}

	result.Images = ensureGeneratedImageURLs(result.Images)
	s.persistGalleryRecords(ctx, input, result.Images)

	return result, nil
}

func (s *ImageGenerationService) OptimizePrompt(ctx context.Context, input PromptOptimizeInput) (string, error) {
	if input.UserID <= 0 {
		return "", ErrPromptOptimizationInvalid
	}
	prompt := strings.TrimSpace(input.Prompt)
	if prompt == "" {
		return "", ErrPromptOptimizationInvalid
	}

	settings, err := s.settingService.GetNewAPISettings(ctx)
	if err != nil {
		return "", fmt.Errorf("get newapi settings: %w", err)
	}

	accessKey, err := s.settingService.ResolveUserNewAPIAccessKey(ctx, input.UserID, settings)
	if err != nil {
		return "", err
	}

	optSettings, err := s.settingService.GetPromptOptimizationSettings(ctx)
	if err != nil {
		return "", fmt.Errorf("get prompt optimization settings: %w", err)
	}
	modelID := strings.TrimSpace(optSettings.Model)
	if modelID == "" {
		return "", infraerrors.BadRequest("PROMPT_OPTIMIZE_MODEL_MISSING", "prompt optimize model is not configured")
	}

	req, err := buildOpenAIChatRequest(ctx, settings.BaseURL, accessKey, modelID, prompt, optSettings.Prompt)
	if err != nil {
		return "", err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request newapi prompt optimize: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read newapi prompt optimize response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", infraerrors.ServiceUnavailable("PROMPT_OPTIMIZE_FAILED", formatNewAPIError(resp.StatusCode, body))
	}

	optimized := parseOpenAIChatResponse(body)
	if optimized == "" {
		return "", infraerrors.ServiceUnavailable("PROMPT_OPTIMIZE_FAILED", "no prompt returned from model")
	}
	return optimized, nil
}

func (s *ImageGenerationService) persistGalleryRecords(
	ctx context.Context,
	input ImageGenerationInput,
	images []GeneratedImage,
) {
	if s.galleryService == nil || len(images) == 0 {
		return
	}

	promptValue := strings.TrimSpace(input.Prompt)
	var promptPtr *string
	if promptValue != "" {
		promptPtr = &promptValue
	}

	modelValue := strings.TrimSpace(input.ModelID)
	var modelPtr *string
	if modelValue != "" {
		modelPtr = &modelValue
	}

	widthPtr, heightPtr := buildImageDimensions(input.Resolution, input.AspectRatio)
	referencePtr := s.resolveReferenceImageURL(ctx, input.ReferenceImage)

	for _, image := range images {
		url := resolveGeneratedImageURL(image)
		if url == "" {
			log.Printf("gallery: skip generated image without url (user_id=%d)", input.UserID)
			continue
		}
		_, err := s.galleryService.Create(ctx, input.UserID, GalleryCreateInput{
			ImageURL:          url,
			ReferenceImageURL: referencePtr,
			Prompt:            promptPtr,
			Model:             modelPtr,
			Width:             widthPtr,
			Height:            heightPtr,
			IsPublic:          false,
		})
		if err != nil {
			log.Printf("gallery: failed to store generated image (user_id=%d, url=%s): %v",
				input.UserID, url, err)
		}
	}
}

func (s *ImageGenerationService) resolveReferenceImageURL(ctx context.Context, reference string) *string {
	trimmed := strings.TrimSpace(reference)
	if trimmed == "" {
		return nil
	}

	if s.storageService != nil {
		storedURL, err := s.storeReferenceImage(ctx, trimmed)
		if err != nil {
			log.Printf("gallery: failed to store reference image: %v", err)
		} else if storedURL != "" {
			return &storedURL
		}
	}

	if fallback := buildReferenceImageFallback(trimmed); fallback != "" {
		return &fallback
	}
	return nil
}

func (s *ImageGenerationService) resolveRequestEndpoint(ctx context.Context, userID int64, modelID string) (string, error) {
	items, err := s.settingService.GetUserModelSettings(ctx, userID)
	if err != nil {
		return "", fmt.Errorf("get user model settings: %w", err)
	}
	for _, item := range items {
		if item.ModelID == modelID {
			if endpoint := normalizeRequestEndpoint(item.RequestEndpoint); endpoint != "" {
				return endpoint, nil
			}
			break
		}
	}
	return requestEndpointOpenAI, nil
}

func (s *ImageGenerationService) generateOpenAI(
	ctx context.Context,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	input ImageGenerationInput,
) (*ImageGenerationResult, error) {
	return s.generateOpenAIWithClient(ctx, s.httpClient, baseURL, accessKey, modelID, prompt, input)
}

func (s *ImageGenerationService) generateOpenAIWithClient(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	input ImageGenerationInput,
) (*ImageGenerationResult, error) {
	reference, err := parseReferenceImage(input.ReferenceImage)
	if err != nil {
		return nil, err
	}

	size := buildImageSize(input.Resolution, input.AspectRatio)
	count := normalizeImageCount(input.Count)

	var req *http.Request
	if reference == nil {
		req, err = buildOpenAIImagesRequest(ctx, baseURL, accessKey, modelID, prompt, size, count)
	} else {
		req, err = buildOpenAIImageEditRequest(ctx, baseURL, accessKey, modelID, prompt, size, count, reference)
	}
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request newapi image generation: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read newapi image response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_IMAGE_FAILED", formatNewAPIError(resp.StatusCode, body))
	}

	result := parseOpenAIImageResponse(body)
	if len(result.Images) == 0 {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_IMAGE_FAILED", "no image returned from openai")
	}
	return result, nil
}

func (s *ImageGenerationService) generateOpenAIMod(
	ctx context.Context,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	input ImageGenerationInput,
) (*ImageGenerationResult, error) {
	return s.generateOpenAIModWithClient(ctx, s.httpClient, baseURL, accessKey, modelID, prompt, input)
}

func (s *ImageGenerationService) generateOpenAIModWithClient(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	input ImageGenerationInput,
) (*ImageGenerationResult, error) {
	image := strings.TrimSpace(input.ReferenceImage)
	count := normalizeImageCount(input.Count)
	var req *http.Request
	var err error
	if image == "" {
		req, err = buildOpenAIModImageGenerateRequest(
			ctx,
			baseURL,
			accessKey,
			modelID,
			prompt,
			input.Resolution,
			input.AspectRatio,
			count,
		)
	} else {
		req, err = buildOpenAIModImageEditRequest(
			ctx,
			baseURL,
			accessKey,
			modelID,
			prompt,
			image,
			input.Resolution,
			input.AspectRatio,
			count,
		)
	}
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request newapi image generation: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read newapi image response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_IMAGE_FAILED", formatNewAPIError(resp.StatusCode, body))
	}

	result := parseOpenAIImageResponse(body)
	if len(result.Images) == 0 {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_IMAGE_FAILED", "no image returned from openai mod")
	}
	return result, nil
}

func (s *ImageGenerationService) generateGemini(
	ctx context.Context,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	input ImageGenerationInput,
) (*ImageGenerationResult, error) {
	return s.generateGeminiWithClient(ctx, s.httpClient, baseURL, accessKey, modelID, prompt, input)
}

func (s *ImageGenerationService) generateGeminiWithClient(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	input ImageGenerationInput,
) (*ImageGenerationResult, error) {
	reference, err := parseReferenceImage(input.ReferenceImage)
	if err != nil {
		return nil, err
	}

	req, err := buildGeminiGenerateContentRequest(
		ctx,
		baseURL,
		accessKey,
		modelID,
		prompt,
		input.Resolution,
		input.AspectRatio,
		reference,
	)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request newapi gemini generation: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read newapi gemini response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_IMAGE_FAILED", formatNewAPIError(resp.StatusCode, body))
	}

	result, err := parseGeminiImageResponse(body)
	if err != nil {
		return nil, err
	}
	return result, nil
}

type referenceImageData struct {
	MimeType string
	Base64   string
	Bytes    []byte
}

func parseReferenceImage(value string) (*referenceImageData, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, nil
	}

	mimeType := defaultImageMimeType
	payload := trimmed
	if strings.HasPrefix(trimmed, "data:") {
		parts := strings.SplitN(trimmed, ",", 2)
		if len(parts) != 2 {
			return nil, ErrImageGenerationInvalid
		}
		header := parts[0]
		payload = parts[1]
		if strings.Contains(header, ";") {
			headerParts := strings.SplitN(strings.TrimPrefix(header, "data:"), ";", 2)
			if len(headerParts) > 0 && headerParts[0] != "" {
				mimeType = headerParts[0]
			}
		}
	}

	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, ErrImageGenerationInvalid.WithCause(err)
	}

	return &referenceImageData{
		MimeType: mimeType,
		Base64:   payload,
		Bytes:    decoded,
	}, nil
}

func (s *ImageGenerationService) storeReferenceImage(ctx context.Context, reference string) (string, error) {
	if s.storageService == nil {
		return "", ErrStorageFailed
	}

	trimmed := strings.TrimSpace(reference)
	if trimmed == "" {
		return "", nil
	}

	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "data:") {
		stored, err := s.storageService.StoreImage(ctx, GeneratedImage{URL: trimmed})
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(stored.URL), nil
	}

	parsed, err := parseReferenceImage(trimmed)
	if err != nil || parsed == nil {
		if err != nil {
			return "", err
		}
		return "", nil
	}

	stored, err := s.storageService.StoreImage(ctx, GeneratedImage{
		Base64:   parsed.Base64,
		MimeType: parsed.MimeType,
	})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(stored.URL), nil
}

func buildReferenceImageFallback(reference string) string {
	trimmed := strings.TrimSpace(reference)
	if trimmed == "" {
		return ""
	}

	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "data:") {
		return trimmed
	}

	parsed, err := parseReferenceImage(trimmed)
	if err != nil || parsed == nil || parsed.Base64 == "" {
		return ""
	}
	mimeType := parsed.MimeType
	if mimeType == "" {
		mimeType = defaultImageMimeType
	}
	return fmt.Sprintf("data:%s;base64,%s", mimeType, parsed.Base64)
}

func normalizeImageCount(count int) int {
	if count <= 0 {
		return 1
	}
	if count > 4 {
		return 4
	}
	return count
}

func buildOpenAIImagesRequest(
	ctx context.Context,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	size string,
	count int,
) (*http.Request, error) {
	endpoint, err := buildOpenAIImageURL(baseURL, "images/generations")
	if err != nil {
		return nil, err
	}

	payload := map[string]any{
		"model":  modelID,
		"prompt": prompt,
		"n":      count,
	}
	if size != "" {
		payload["size"] = size
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode image request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create image request: %w", err)
	}
	applyNewAPIHeaders(req, accessKey)
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

func buildOpenAIChatRequest(
	ctx context.Context,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	systemPrompt string,
) (*http.Request, error) {
	endpoint, err := buildOpenAIImageURL(baseURL, "chat/completions")
	if err != nil {
		return nil, err
	}

	messages := make([]map[string]string, 0, 2)
	if strings.TrimSpace(systemPrompt) != "" {
		messages = append(messages, map[string]string{
			"role":    "system",
			"content": systemPrompt,
		})
	}
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": prompt,
	})

	payload := map[string]any{
		"model":       modelID,
		"messages":    messages,
		"temperature": 0.7,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode prompt optimize request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create prompt optimize request: %w", err)
	}
	applyNewAPIHeaders(req, accessKey)
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

func buildOpenAIImageEditRequest(
	ctx context.Context,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	size string,
	count int,
	reference *referenceImageData,
) (*http.Request, error) {
	if reference == nil || len(reference.Bytes) == 0 {
		return nil, ErrImageGenerationInvalid
	}

	endpoint, err := buildOpenAIImageURL(baseURL, "images/edits")
	if err != nil {
		return nil, err
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	if err := writer.WriteField("model", modelID); err != nil {
		return nil, fmt.Errorf("write model field: %w", err)
	}
	if err := writer.WriteField("prompt", prompt); err != nil {
		return nil, fmt.Errorf("write prompt field: %w", err)
	}
	if size != "" {
		if err := writer.WriteField("size", size); err != nil {
			return nil, fmt.Errorf("write size field: %w", err)
		}
	}
	if err := writer.WriteField("n", strconv.Itoa(count)); err != nil {
		return nil, fmt.Errorf("write count field: %w", err)
	}

	partHeader := make(textproto.MIMEHeader)
	partHeader.Set("Content-Disposition", `form-data; name="image"; filename="reference.png"`)
	partHeader.Set("Content-Type", reference.MimeType)
	part, err := writer.CreatePart(partHeader)
	if err != nil {
		return nil, fmt.Errorf("create image part: %w", err)
	}
	if _, err := part.Write(reference.Bytes); err != nil {
		return nil, fmt.Errorf("write image part: %w", err)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("finalize multipart: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
	if err != nil {
		return nil, fmt.Errorf("create image edit request: %w", err)
	}
	applyNewAPIHeaders(req, accessKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req, nil
}

func buildOpenAIModImageEditRequest(
	ctx context.Context,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	image string,
	resolution string,
	aspectRatio string,
	count int,
) (*http.Request, error) {
	endpoint, err := buildOpenAIImageURL(baseURL, "images/edits")
	if err != nil {
		return nil, err
	}

	payload := map[string]any{
		"model":  modelID,
		"image":  image,
		"prompt": prompt,
		"n":      count,
	}
	if imageConfig := buildOpenAIModImageConfig(resolution, aspectRatio, modelID); imageConfig != nil {
		payload["image_config"] = imageConfig
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode image request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create image request: %w", err)
	}
	applyNewAPIHeaders(req, accessKey)
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

func buildOpenAIModImageGenerateRequest(
	ctx context.Context,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	resolution string,
	aspectRatio string,
	count int,
) (*http.Request, error) {
	endpoint, err := buildOpenAIImageURL(baseURL, "images/generations")
	if err != nil {
		return nil, err
	}

	payload := map[string]any{
		"model":  modelID,
		"prompt": prompt,
		"n":      count,
	}
	if imageConfig := buildOpenAIModImageConfig(resolution, aspectRatio, modelID); imageConfig != nil {
		payload["image_config"] = imageConfig
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode image request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create image request: %w", err)
	}
	applyNewAPIHeaders(req, accessKey)
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

func buildGeminiGenerateContentRequest(
	ctx context.Context,
	baseURL string,
	accessKey string,
	modelID string,
	prompt string,
	resolution string,
	aspectRatio string,
	reference *referenceImageData,
) (*http.Request, error) {
	endpoint, err := buildGeminiGenerateContentURL(baseURL, modelID, accessKey)
	if err != nil {
		return nil, err
	}

	parts := make([]map[string]any, 0, 2)
	parts = append(parts, map[string]any{"text": prompt})
	if reference != nil && reference.Base64 != "" {
		parts = append(parts, map[string]any{
			"inlineData": map[string]any{
				"mimeType": reference.MimeType,
				"data":     reference.Base64,
			},
		})
	}

	generationConfig := map[string]any{
		"responseModalities": []string{"IMAGE"},
	}
	if imageConfig := buildGeminiImageConfig(resolution, aspectRatio); imageConfig != nil {
		generationConfig["imageConfig"] = imageConfig
	}

	payload := map[string]any{
		"contents": []map[string]any{
			{
				"parts": parts,
			},
		},
		"generationConfig": generationConfig,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode gemini request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create gemini request: %w", err)
	}
	applyNewAPIHeaders(req, accessKey)
	req.Header.Set("Content-Type", "application/json")
	return req, nil
}

func buildOpenAIImageURL(baseURL string, suffix string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "" {
		return "", errors.New("newapi base url is empty")
	}
	if strings.HasSuffix(trimmed, "/v1") || strings.HasSuffix(trimmed, "/api") {
		return trimmed + "/" + strings.TrimPrefix(suffix, "/"), nil
	}
	return trimmed + "/v1/" + strings.TrimPrefix(suffix, "/"), nil
}

func buildGeminiGenerateContentURL(baseURL, modelID, accessKey string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "" {
		return "", errors.New("newapi base url is empty")
	}
	if modelID == "" {
		return "", errors.New("model id is empty")
	}
	key := strings.TrimSpace(accessKey)
	if strings.HasPrefix(strings.ToLower(key), "bearer ") {
		key = strings.TrimSpace(key[7:])
	}
	if key == "" {
		return "", errors.New("newapi access key is empty")
	}
	escapedModel := url.PathEscape(modelID)
	if !strings.HasSuffix(trimmed, "/v1beta") {
		trimmed = trimmed + "/v1beta"
	}
	query := url.Values{}
	query.Set("key", key)
	return fmt.Sprintf("%s/models/%s:generateContent?%s", trimmed, escapedModel, query.Encode()), nil
}

func applyNewAPIHeaders(req *http.Request, accessKey string) {
	if req == nil {
		return
	}
	authHeader := strings.TrimSpace(accessKey)
	if authHeader != "" && !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		authHeader = "Bearer " + authHeader
	}
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	req.Header.Set("Accept", "application/json")
}

type openAIImageResponse struct {
	Data []struct {
		URL     string `json:"url"`
		Base64  string `json:"b64_json"`
		Revised string `json:"revised_prompt"`
	} `json:"data"`
}

type openAIChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		Text string `json:"text"`
	} `json:"choices"`
}

func parseOpenAIImageResponse(body []byte) *ImageGenerationResult {
	var resp openAIImageResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return &ImageGenerationResult{Images: []GeneratedImage{}}
	}
	images := make([]GeneratedImage, 0, len(resp.Data))
	for _, item := range resp.Data {
		image := GeneratedImage{
			URL:    strings.TrimSpace(item.URL),
			Base64: strings.TrimSpace(item.Base64),
		}
		if image.Base64 != "" {
			image.MimeType = defaultImageMimeType
		}
		if image.URL == "" && image.Base64 == "" {
			continue
		}
		images = append(images, image)
	}
	return &ImageGenerationResult{Images: images}
}

func parseOpenAIChatResponse(body []byte) string {
	var resp openAIChatResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return ""
	}
	for _, choice := range resp.Choices {
		content := strings.TrimSpace(choice.Message.Content)
		if content == "" {
			content = strings.TrimSpace(choice.Text)
		}
		if content != "" {
			return content
		}
	}
	return ""
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				InlineData *struct {
					MimeType string `json:"mime_type"`
					Data     string `json:"data"`
				} `json:"inline_data"`
				FileData *struct {
					MimeType string `json:"mime_type"`
					FileURI  string `json:"file_uri"`
				} `json:"file_data"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

type geminiGenerateResponseCamel struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
			InlineData *struct {
				MimeType string `json:"mimeType"`
				Data     string `json:"data"`
			} `json:"inlineData"`
			FileData *struct {
				MimeType string `json:"mimeType"`
				FileURI  string `json:"fileUri"`
			} `json:"fileData"`
		} `json:"parts"`
	} `json:"content"`
} `json:"candidates"`
}

func parseGeminiImageResponse(body []byte) (*ImageGenerationResult, error) {
	var resp geminiGenerateResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parse gemini response: %w", err)
	}
	images := make([]GeneratedImage, 0)
	for _, candidate := range resp.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData == nil {
				if part.FileData != nil {
					url := strings.TrimSpace(part.FileData.FileURI)
					if url != "" {
						images = append(images, GeneratedImage{
							URL:      url,
							MimeType: strings.TrimSpace(part.FileData.MimeType),
						})
					}
				}
				continue
			}
			data, mimeType := normalizeGeminiInlineData(part.InlineData.MimeType, part.InlineData.Data)
			if data == "" {
				continue
			}
			images = append(images, GeneratedImage{
				Base64:   data,
				MimeType: mimeType,
			})
		}
	}
	if len(images) == 0 {
		images = parseGeminiImageResponseCamel(body)
	}
	if len(images) == 0 {
		return nil, infraerrors.ServiceUnavailable("NEWAPI_IMAGE_FAILED", "no image returned from gemini")
	}
	return &ImageGenerationResult{Images: images}, nil
}

func parseGeminiImageResponseCamel(body []byte) []GeneratedImage {
	var resp geminiGenerateResponseCamel
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil
	}
	images := make([]GeneratedImage, 0)
	for _, candidate := range resp.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData == nil {
				if part.FileData != nil {
					url := strings.TrimSpace(part.FileData.FileURI)
					if url != "" {
						images = append(images, GeneratedImage{
							URL:      url,
							MimeType: strings.TrimSpace(part.FileData.MimeType),
						})
					}
				}
				continue
			}
			data, mimeType := normalizeGeminiInlineData(part.InlineData.MimeType, part.InlineData.Data)
			if data == "" {
				continue
			}
			images = append(images, GeneratedImage{
				Base64:   data,
				MimeType: mimeType,
			})
		}
	}
	return images
}

func normalizeGeminiInlineData(mimeType, data string) (string, string) {
	clean := strings.TrimSpace(data)
	if clean == "" {
		return "", ""
	}
	parsedMime := strings.TrimSpace(mimeType)
	if strings.HasPrefix(clean, "data:") {
		parts := strings.SplitN(clean, ",", 2)
		if len(parts) == 2 {
			header := strings.TrimPrefix(parts[0], "data:")
			if semi := strings.Index(header, ";"); semi >= 0 {
				header = header[:semi]
			}
			if header != "" {
				parsedMime = header
			}
			clean = parts[1]
		}
	}
	if parsedMime == "" {
		parsedMime = defaultImageMimeType
	}
	return clean, parsedMime
}

func buildOpenAIModImageConfig(resolution, aspectRatio, modelID string) map[string]any {
	config := map[string]any{}

	ratio := strings.TrimSpace(aspectRatio)
	if ratio != "" && !strings.EqualFold(ratio, "auto") {
		config["aspect_ratio"] = ratio
	}

	if strings.TrimSpace(modelID) == "gemini-3.0-pro-image-preview" {
		resolution = strings.TrimSpace(strings.ToUpper(resolution))
		switch resolution {
		case "1K", "2K", "4K":
			config["image_size"] = resolution
		}
	}

	if len(config) == 0 {
		return nil
	}
	return config
}

func buildGeminiImageConfig(resolution, aspectRatio string) map[string]any {
	config := map[string]any{}

	resolution = strings.TrimSpace(strings.ToUpper(resolution))
	switch resolution {
	case "1K", "2K", "4K":
		config["imageSize"] = resolution
	}

	ratio := strings.TrimSpace(aspectRatio)
	if ratio != "" && !strings.EqualFold(ratio, "auto") {
		config["aspectRatio"] = ratio
	}

	if len(config) == 0 {
		return nil
	}
	return config
}

func buildImageSize(resolution, aspectRatio string) string {
	resolution = strings.TrimSpace(strings.ToUpper(resolution))
	aspectRatio = strings.TrimSpace(aspectRatio)
	if resolution == "" || aspectRatio == "" {
		return ""
	}

	base := 0
	switch resolution {
	case "1K":
		base = 1024
	case "2K":
		base = 2048
	case "4K":
		base = 4096
	default:
		return ""
	}

	ratioParts := strings.Split(aspectRatio, ":")
	if len(ratioParts) != 2 {
		return ""
	}
	widthRatio, err := strconv.Atoi(strings.TrimSpace(ratioParts[0]))
	if err != nil || widthRatio <= 0 {
		return ""
	}
	heightRatio, err := strconv.Atoi(strings.TrimSpace(ratioParts[1]))
	if err != nil || heightRatio <= 0 {
		return ""
	}

	maxRatio := widthRatio
	if heightRatio > maxRatio {
		maxRatio = heightRatio
	}

	width := base * widthRatio / maxRatio
	height := base * heightRatio / maxRatio
	if width <= 0 || height <= 0 {
		return ""
	}
	return fmt.Sprintf("%dx%d", width, height)
}

func buildImageDimensions(resolution, aspectRatio string) (*int, *int) {
	size := buildImageSize(resolution, aspectRatio)
	if size == "" {
		return nil, nil
	}
	parts := strings.Split(size, "x")
	if len(parts) != 2 {
		return nil, nil
	}
	width, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || width <= 0 {
		return nil, nil
	}
	height, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil || height <= 0 {
		return nil, nil
	}
	return &width, &height
}

func ensureGeneratedImageURLs(images []GeneratedImage) []GeneratedImage {
	for i := range images {
		if strings.TrimSpace(images[i].URL) != "" {
			continue
		}
		if fallback := resolveGeneratedImageURL(images[i]); fallback != "" {
			images[i].URL = fallback
		}
	}
	return images
}

func resolveGeneratedImageURL(image GeneratedImage) string {
	if url := strings.TrimSpace(image.URL); url != "" {
		return url
	}
	base64Value := strings.TrimSpace(image.Base64)
	if base64Value == "" {
		return ""
	}
	mimeType := strings.TrimSpace(image.MimeType)
	if mimeType == "" {
		mimeType = defaultImageMimeType
	}
	return fmt.Sprintf("data:%s;base64,%s", mimeType, base64Value)
}
