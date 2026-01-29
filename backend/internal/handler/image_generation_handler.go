package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/CrazyCherrys/DreamStudio/internal/handler/dto"
	"github.com/CrazyCherrys/DreamStudio/internal/pkg/pagination"
	"github.com/CrazyCherrys/DreamStudio/internal/pkg/response"
	"github.com/CrazyCherrys/DreamStudio/internal/server/middleware"
	"github.com/CrazyCherrys/DreamStudio/internal/service"
	"github.com/gin-gonic/gin"
)

type ImageGenerationHandler struct {
	imageService   *service.ImageGenerationService
	taskService    *service.ImageTaskService
	galleryService *service.GalleryService
	storageService *service.StorageService
	modelRPMHelper *ModelRPMHelper
}

func NewImageGenerationHandler(
	imageService *service.ImageGenerationService,
	taskService *service.ImageTaskService,
	galleryService *service.GalleryService,
	storageService *service.StorageService,
	modelRPMService *service.ModelRPMService,
) *ImageGenerationHandler {
	return &ImageGenerationHandler{
		imageService:   imageService,
		taskService:    taskService,
		galleryService: galleryService,
		storageService: storageService,
		modelRPMHelper: NewModelRPMHelper(modelRPMService, SSEPingFormatNone, 0),
	}
}

type ImageGenerateRequest struct {
	ModelID        string `json:"model_id"`
	Prompt         string `json:"prompt"`
	Resolution     string `json:"resolution,omitempty"`
	AspectRatio    string `json:"aspect_ratio,omitempty"`
	ReferenceImage string `json:"reference_image,omitempty"`
	Count          int    `json:"count,omitempty"`
	Async          bool   `json:"async,omitempty"`
}

type ImagePromptOptimizeRequest struct {
	Prompt string `json:"prompt"`
}

type ImagePromptOptimizeResponse struct {
	Prompt string `json:"prompt"`
}

func (h *ImageGenerationHandler) Generate(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	var req ImageGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	if err := h.modelRPMHelper.WaitForModelRPM(c, subject.UserID, req.ModelID, false, nil); err != nil {
		if _, ok := err.(*ModelRPMError); ok {
			response.Error(c, http.StatusTooManyRequests, "Model RPM limit reached, please retry later")
		} else {
			response.InternalError(c, "Failed to apply model RPM limit")
		}
		return
	}

	input := service.ImageGenerationInput{
		UserID:         subject.UserID,
		ModelID:        req.ModelID,
		Prompt:         req.Prompt,
		Resolution:     req.Resolution,
		AspectRatio:    req.AspectRatio,
		ReferenceImage: req.ReferenceImage,
		Count:          req.Count,
	}

	if req.Async {
		task, err := h.taskService.CreateTask(c.Request.Context(), input)
		if err != nil {
			response.ErrorFrom(c, err)
			return
		}
		response.Success(c, dto.ImageGenerationTaskFromService(task))
		return
	}

	result, err := h.imageService.Generate(c.Request.Context(), input)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, result)
}

// OptimizePrompt handles optimizing prompt text using configured model.
// POST /api/v1/images/optimize
func (h *ImageGenerationHandler) OptimizePrompt(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	var req ImagePromptOptimizeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	optimized, err := h.imageService.OptimizePrompt(c.Request.Context(), service.PromptOptimizeInput{
		UserID: subject.UserID,
		Prompt: req.Prompt,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, ImagePromptOptimizeResponse{Prompt: optimized})
}

// ListHistory handles listing image generation history for the current user.
// GET /api/v1/images/history
func (h *ImageGenerationHandler) ListHistory(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	page, pageSize := response.ParsePagination(c)
	params := pagination.PaginationParams{Page: page, PageSize: pageSize}

	filters, err := parseImageHistoryFilters(c)
	if err != nil {
		response.BadRequest(c, "Invalid filters: "+err.Error())
		return
	}

	tasks, result, err := h.taskService.ListByUser(c.Request.Context(), subject.UserID, params, filters)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	galleryByURL := map[string]*dto.GalleryImage{}
	if h.galleryService != nil {
		primaryURLs := collectPrimaryImageURLs(tasks)
		if len(primaryURLs) > 0 {
			if images, err := h.galleryService.ListByUserAndImageURLs(c.Request.Context(), subject.UserID, primaryURLs); err == nil {
				for i := range images {
					image := images[i]
					if image.ImageURL == "" {
						continue
					}
					galleryByURL[image.ImageURL] = dto.GalleryImageFromService(&image)
				}
			}
		}
	}

	out := make([]dto.ImageGenerationTask, 0, len(tasks))
	for i := range tasks {
		if mapped := dto.ImageGenerationTaskFromService(&tasks[i]); mapped != nil {
			if primaryURL := primaryImageURL(&tasks[i]); primaryURL != "" {
				primary := &dto.ImageHistoryImage{ImageURL: primaryURL}
				if gallery, ok := galleryByURL[primaryURL]; ok {
					primary.Gallery = gallery
				}
				mapped.PrimaryImage = primary
			}
			out = append(out, *mapped)
		}
	}

	if result == nil {
		response.Paginated(c, out, 0, page, pageSize)
		return
	}

	response.Paginated(c, out, result.Total, result.Page, result.PageSize)
}

// GetHistory handles fetching a single image generation task with details.
// GET /api/v1/images/history/:id
func (h *ImageGenerationHandler) GetHistory(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	taskID, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || taskID <= 0 {
		response.BadRequest(c, "Invalid task ID")
		return
	}

	task, err := h.taskService.GetByUser(c.Request.Context(), subject.UserID, taskID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	galleryByURL := map[string]*dto.GalleryImage{}
	if h.galleryService != nil {
		imageURLs := collectNonEmptyStrings(task.ImageURLs)
		if len(imageURLs) > 0 {
			if images, err := h.galleryService.ListByUserAndImageURLs(c.Request.Context(), subject.UserID, imageURLs); err == nil {
				for i := range images {
					image := images[i]
					if image.ImageURL == "" {
						continue
					}
					galleryByURL[image.ImageURL] = dto.GalleryImageFromService(&image)
				}
			}
		}
	}

	mapped := dto.ImageGenerationTaskFromService(task)
	if mapped == nil {
		response.Error(c, 500, "Failed to map task")
		return
	}

	images := buildImageHistoryImages(task.ImageURLs, galleryByURL)
	primaryURL := primaryImageURL(task)
	if primaryURL != "" {
		primary := &dto.ImageHistoryImage{ImageURL: primaryURL}
		if gallery, ok := galleryByURL[primaryURL]; ok {
			primary.Gallery = gallery
		}
		mapped.PrimaryImage = primary
	}

	out := dto.ImageGenerationTaskDetail{
		ImageGenerationTask: *mapped,
		Images:              images,
	}
	response.Success(c, out)
}

// DeleteHistory handles deleting a single image generation task.
// DELETE /api/v1/images/history/:id
func (h *ImageGenerationHandler) DeleteHistory(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	taskID, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || taskID <= 0 {
		response.BadRequest(c, "Invalid task ID")
		return
	}

	task, err := h.taskService.DeleteByUser(c.Request.Context(), subject.UserID, taskID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	warnings := make([]string, 0, 2)
	imageURLs := collectNonEmptyStrings(task.ImageURLs)
	if h.galleryService != nil && len(imageURLs) > 0 {
		if err := h.galleryService.DeleteByUserAndImageURLs(c.Request.Context(), subject.UserID, imageURLs); err != nil {
			warnings = append(warnings, "failed to delete gallery records")
		}
	}
	if h.storageService != nil && len(imageURLs) > 0 {
		if err := h.storageService.DeleteStoredImages(c.Request.Context(), imageURLs); err != nil {
			warnings = append(warnings, "failed to delete stored images")
		}
	}

	if len(warnings) > 0 {
		response.Success(c, gin.H{"message": "deleted", "warnings": warnings})
		return
	}
	response.Success(c, gin.H{"message": "deleted"})
}

func parseImageHistoryFilters(c *gin.Context) (service.ImageTaskFilters, error) {
	var filters service.ImageTaskFilters

	status := strings.ToLower(strings.TrimSpace(c.Query("status")))
	if status != "" && status != "all" {
		if !isValidImageTaskStatus(status) {
			return filters, fmt.Errorf("unknown status")
		}
		filters.Status = status
	}

	filters.ModelID = strings.TrimSpace(c.Query("model"))

	startTime, err := parseImageHistoryTime(c.Query("start_time"))
	if err != nil {
		return filters, err
	}
	endTime, err := parseImageHistoryTime(c.Query("end_time"))
	if err != nil {
		return filters, err
	}
	if startTime != nil && endTime != nil && startTime.After(*endTime) {
		return filters, fmt.Errorf("start_time must be <= end_time")
	}
	filters.StartTime = startTime
	filters.EndTime = endTime
	return filters, nil
}

func parseImageHistoryTime(value string) (*time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, nil
	}
	if parsed, err := time.Parse(time.RFC3339Nano, trimmed); err == nil {
		return &parsed, nil
	}
	if parsed, err := time.Parse(time.RFC3339, trimmed); err == nil {
		return &parsed, nil
	}
	if unix, err := strconv.ParseInt(trimmed, 10, 64); err == nil {
		if len(trimmed) > 10 {
			unix = unix / 1000
		}
		parsed := time.Unix(unix, 0).UTC()
		return &parsed, nil
	}
	return nil, fmt.Errorf("invalid time")
}

func isValidImageTaskStatus(value string) bool {
	switch value {
	case service.ImageTaskStatusPending,
		service.ImageTaskStatusRunning,
		service.ImageTaskStatusSucceeded,
		service.ImageTaskStatusFailed:
		return true
	default:
		return false
	}
}

func primaryImageURL(task *service.ImageGenerationTask) string {
	if task == nil {
		return ""
	}
	for _, url := range task.ImageURLs {
		trimmed := strings.TrimSpace(url)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func collectPrimaryImageURLs(tasks []service.ImageGenerationTask) []string {
	seen := make(map[string]struct{}, len(tasks))
	out := make([]string, 0, len(tasks))
	for i := range tasks {
		url := primaryImageURL(&tasks[i])
		if url == "" {
			continue
		}
		if _, ok := seen[url]; ok {
			continue
		}
		seen[url] = struct{}{}
		out = append(out, url)
	}
	return out
}

func collectNonEmptyStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func buildImageHistoryImages(urls []string, galleryByURL map[string]*dto.GalleryImage) []dto.ImageHistoryImage {
	if len(urls) == 0 {
		return []dto.ImageHistoryImage{}
	}
	out := make([]dto.ImageHistoryImage, 0, len(urls))
	for _, rawURL := range urls {
		trimmed := strings.TrimSpace(rawURL)
		if trimmed == "" {
			continue
		}
		item := dto.ImageHistoryImage{ImageURL: trimmed}
		if gallery, ok := galleryByURL[trimmed]; ok {
			item.Gallery = gallery
		}
		out = append(out, item)
	}
	return out
}
