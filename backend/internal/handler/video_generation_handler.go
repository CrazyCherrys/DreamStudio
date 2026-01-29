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

type VideoGenerationHandler struct {
	taskService    *service.VideoTaskService
	storageService *service.StorageService
	modelRPMHelper *ModelRPMHelper
}

func NewVideoGenerationHandler(
	taskService *service.VideoTaskService,
	storageService *service.StorageService,
	modelRPMService *service.ModelRPMService,
) *VideoGenerationHandler {
	return &VideoGenerationHandler{
		taskService:    taskService,
		storageService: storageService,
		modelRPMHelper: NewModelRPMHelper(modelRPMService, SSEPingFormatNone, 0),
	}
}

type VideoGenerateRequest struct {
	ModelID  string `json:"model_id"`
	Prompt   string `json:"prompt"`
	Image    string `json:"image,omitempty"`
	Duration int    `json:"duration,omitempty"`
	Width    int    `json:"width,omitempty"`
	Height   int    `json:"height,omitempty"`
	FPS      int    `json:"fps,omitempty"`
	Seed     int    `json:"seed,omitempty"`
	Count    int    `json:"count,omitempty"`
	Async    bool   `json:"async,omitempty"`
}

func (h *VideoGenerationHandler) Generate(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	var req VideoGenerateRequest
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

	input := service.VideoGenerationInput{
		UserID:   subject.UserID,
		ModelID:  req.ModelID,
		Prompt:   req.Prompt,
		Image:    req.Image,
		Duration: req.Duration,
		Width:    req.Width,
		Height:   req.Height,
		FPS:      req.FPS,
		Seed:     req.Seed,
		Count:    req.Count,
	}

	task, err := h.taskService.CreateTask(c.Request.Context(), input)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dto.VideoGenerationTaskFromService(task))
}

// ListHistory handles listing video generation history for the current user.
// GET /api/v1/videos/history
func (h *VideoGenerationHandler) ListHistory(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	page, pageSize := response.ParsePagination(c)
	params := pagination.PaginationParams{Page: page, PageSize: pageSize}

	filters, err := parseVideoHistoryFilters(c)
	if err != nil {
		response.BadRequest(c, "Invalid filters: "+err.Error())
		return
	}

	tasks, result, err := h.taskService.ListByUser(c.Request.Context(), subject.UserID, params, filters)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	out := make([]dto.VideoGenerationTask, 0, len(tasks))
	for i := range tasks {
		if mapped := dto.VideoGenerationTaskFromService(&tasks[i]); mapped != nil {
			if primaryURL := primaryVideoURL(&tasks[i]); primaryURL != "" {
				mapped.PrimaryVideo = &dto.VideoHistoryVideo{VideoURL: primaryURL}
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

// GetHistory handles fetching a single video generation task with details.
// GET /api/v1/videos/history/:id
func (h *VideoGenerationHandler) GetHistory(c *gin.Context) {
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

	mapped := dto.VideoGenerationTaskFromService(task)
	if mapped == nil {
		response.Success(c, dto.VideoGenerationTaskDetail{VideoGenerationTask: dto.VideoGenerationTask{}})
		return
	}

	mapped.PrimaryVideo = nil
	response.Success(c, dto.VideoGenerationTaskDetail{
		VideoGenerationTask: *mapped,
		Videos:              buildVideoHistoryVideos(task.VideoURLs),
	})
}

// DeleteHistory handles deleting a video generation task.
// DELETE /api/v1/videos/history/:id
func (h *VideoGenerationHandler) DeleteHistory(c *gin.Context) {
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

	warnings := make([]string, 0, 1)
	videoURLs := collectNonEmptyVideoStrings(task.VideoURLs)
	if h.storageService != nil && len(videoURLs) > 0 {
		if err := h.storageService.DeleteStoredImages(c.Request.Context(), videoURLs); err != nil {
			warnings = append(warnings, "failed to delete stored videos")
		}
	}

	if len(warnings) > 0 {
		response.Success(c, gin.H{"message": "deleted", "warnings": warnings})
		return
	}
	response.Success(c, gin.H{"message": "deleted"})
}

func parseVideoHistoryFilters(c *gin.Context) (service.VideoTaskFilters, error) {
	var filters service.VideoTaskFilters

	status := strings.ToLower(strings.TrimSpace(c.Query("status")))
	if status != "" && status != "all" {
		if !isValidVideoTaskStatus(status) {
			return filters, fmt.Errorf("unknown status")
		}
		filters.Status = status
	}

	filters.ModelID = strings.TrimSpace(c.Query("model"))

	startTime, err := parseVideoHistoryTime(c.Query("start_time"))
	if err != nil {
		return filters, err
	}
	endTime, err := parseVideoHistoryTime(c.Query("end_time"))
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

func parseVideoHistoryTime(value string) (*time.Time, error) {
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

func isValidVideoTaskStatus(value string) bool {
	switch value {
	case service.VideoTaskStatusPending,
		service.VideoTaskStatusRunning,
		service.VideoTaskStatusSucceeded,
		service.VideoTaskStatusFailed:
		return true
	default:
		return false
	}
}

func primaryVideoURL(task *service.VideoGenerationTask) string {
	if task == nil {
		return ""
	}
	for _, url := range task.VideoURLs {
		trimmed := strings.TrimSpace(url)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func collectNonEmptyVideoStrings(values []string) []string {
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

func buildVideoHistoryVideos(urls []string) []dto.VideoHistoryVideo {
	if len(urls) == 0 {
		return []dto.VideoHistoryVideo{}
	}
	out := make([]dto.VideoHistoryVideo, 0, len(urls))
	for _, rawURL := range urls {
		trimmed := strings.TrimSpace(rawURL)
		if trimmed == "" {
			continue
		}
		out = append(out, dto.VideoHistoryVideo{VideoURL: trimmed})
	}
	return out
}
