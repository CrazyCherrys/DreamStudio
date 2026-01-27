package handler

import (
	"errors"
	"io"
	"strconv"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/handler/dto"
	"github.com/Wei-Shaw/sub2api/internal/pkg/pagination"
	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

type RedInkHandler struct {
	redinkService *service.RedInkService
}

func NewRedInkHandler(redinkService *service.RedInkService) *RedInkHandler {
	return &RedInkHandler{redinkService: redinkService}
}

type RedInkOutlineRequest struct {
	Topic     string   `json:"topic"`
	Images    []string `json:"images,omitempty"`
	ModelID   string   `json:"model_id,omitempty"`
	PageCount int      `json:"page_count,omitempty"`
}

type RedInkContentRequest struct {
	Topic   string `json:"topic"`
	Outline string `json:"outline"`
	ModelID string `json:"model_id,omitempty"`
}

type RedInkRecordCreateRequest struct {
	Topic        string                    `json:"topic"`
	OutlineRaw   string                    `json:"outline_raw"`
	Content      *dto.RedInkContentResult  `json:"content,omitempty"`
	Pages        []service.RedInkOutlinePage `json:"pages"`
	InputImages  []string                  `json:"input_images,omitempty"`
	TextModelID  string                    `json:"text_model_id,omitempty"`
	ImageModelID string                    `json:"image_model_id,omitempty"`
	Resolution   string                    `json:"resolution,omitempty"`
	AspectRatio  string                    `json:"aspect_ratio,omitempty"`
}

type RedInkRecordUpdateRequest struct {
	OutlineRaw string                  `json:"outline_raw"`
	Pages      []service.RedInkOutlinePage `json:"pages"`
}

type RedInkGenerationRequest struct {
	ImageModelID string `json:"image_model_id,omitempty"`
	Resolution   string `json:"resolution,omitempty"`
	AspectRatio  string `json:"aspect_ratio,omitempty"`
}

type RedInkRetryRequest struct {
	PageIDs []int64 `json:"page_ids,omitempty"`
}

// GenerateOutline handles outline generation.
// POST /api/v1/redink/outline
func (h *RedInkHandler) GenerateOutline(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	var req RedInkOutlineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	result, err := h.redinkService.GenerateOutline(c.Request.Context(), service.RedInkOutlineInput{
		UserID:    subject.UserID,
		Topic:     req.Topic,
		Images:    req.Images,
		ModelID:   req.ModelID,
		PageCount: req.PageCount,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	pages := make([]dto.RedInkOutlinePage, 0, len(result.Pages))
	for _, page := range result.Pages {
		pages = append(pages, dto.RedInkOutlinePageFromService(page))
	}

	response.Success(c, gin.H{
		"outline": result.Outline,
		"pages":   pages,
	})
}

// GenerateContent handles content generation.
// POST /api/v1/redink/content
func (h *RedInkHandler) GenerateContent(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	var req RedInkContentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	result, err := h.redinkService.GenerateContent(c.Request.Context(), service.RedInkContentInput{
		UserID:  subject.UserID,
		Topic:   req.Topic,
		Outline: req.Outline,
		ModelID: req.ModelID,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, dto.RedInkContentFromService(result))
}

// CreateRecord handles record creation.
// POST /api/v1/redink/records
func (h *RedInkHandler) CreateRecord(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	var req RedInkRecordCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	var content *service.RedInkContentResult
	if req.Content != nil {
		content = &service.RedInkContentResult{
			Titles:      req.Content.Titles,
			Copywriting: req.Content.Copywriting,
			Tags:        req.Content.Tags,
		}
	}

	record, pages, err := h.redinkService.CreateRecord(c.Request.Context(), service.RedInkRecordCreateInput{
		UserID:       subject.UserID,
		Topic:        req.Topic,
		OutlineRaw:   req.OutlineRaw,
		Content:      content,
		Pages:        req.Pages,
		InputImages:  req.InputImages,
		TextModelID:  req.TextModelID,
		ImageModelID: req.ImageModelID,
		Resolution:   req.Resolution,
		AspectRatio:  req.AspectRatio,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Created(c, dto.RedInkRecordDetailFromService(record, pages))
}

// UpdateRecord handles outline update for draft records.
// PUT /api/v1/redink/records/:id
func (h *RedInkHandler) UpdateRecord(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	recordID, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || recordID <= 0 {
		response.BadRequest(c, "Invalid record ID")
		return
	}

	var req RedInkRecordUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	record, pages, err := h.redinkService.UpdateRecordOutline(c.Request.Context(), subject.UserID, recordID, service.RedInkRecordUpdateInput{
		OutlineRaw: req.OutlineRaw,
		Pages:      req.Pages,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, dto.RedInkRecordDetailFromService(record, pages))
}

// ListRecords handles listing records.
// GET /api/v1/redink/records
func (h *RedInkHandler) ListRecords(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	page, pageSize := response.ParsePagination(c)
	params := pagination.PaginationParams{Page: page, PageSize: pageSize}

	filters := service.RedInkRecordFilters{
		Status: strings.TrimSpace(c.Query("status")),
	}
	if start, err := parseImageHistoryTime(c.Query("start_time")); err == nil {
		filters.StartTime = start
	}
	if end, err := parseImageHistoryTime(c.Query("end_time")); err == nil {
		filters.EndTime = end
	}

	records, result, err := h.redinkService.ListRecords(c.Request.Context(), subject.UserID, params, filters)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	out := make([]dto.RedInkRecord, 0, len(records))
	for i := range records {
		if mapped := dto.RedInkRecordSummaryFromService(&records[i]); mapped != nil {
			out = append(out, *mapped)
		}
	}

	if result == nil {
		response.Paginated(c, out, 0, page, pageSize)
		return
	}
	response.Paginated(c, out, result.Total, result.Page, result.PageSize)
}

// GetRecord handles record detail fetch.
// GET /api/v1/redink/records/:id
func (h *RedInkHandler) GetRecord(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	recordID, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || recordID <= 0 {
		response.BadRequest(c, "Invalid record ID")
		return
	}

	record, pages, err := h.redinkService.GetRecord(c.Request.Context(), subject.UserID, recordID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, dto.RedInkRecordDetailFromService(record, pages))
}

// DeleteRecord handles record deletion.
// DELETE /api/v1/redink/records/:id
func (h *RedInkHandler) DeleteRecord(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	recordID, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || recordID <= 0 {
		response.BadRequest(c, "Invalid record ID")
		return
	}

	if err := h.redinkService.DeleteRecord(c.Request.Context(), subject.UserID, recordID); err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, gin.H{"message": "deleted"})
}

// StartGeneration handles generation start.
// POST /api/v1/redink/records/:id/generate
func (h *RedInkHandler) StartGeneration(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	recordID, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || recordID <= 0 {
		response.BadRequest(c, "Invalid record ID")
		return
	}

	var req RedInkGenerationRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	if err := h.redinkService.StartGeneration(c.Request.Context(), subject.UserID, recordID, service.RedInkGenerationOptions{
		ImageModelID: req.ImageModelID,
		Resolution:   req.Resolution,
		AspectRatio:  req.AspectRatio,
	}); err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, gin.H{"message": "generation_started"})
}

// RetryPages handles retrying failed pages.
// POST /api/v1/redink/records/:id/retry
func (h *RedInkHandler) RetryPages(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	recordID, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || recordID <= 0 {
		response.BadRequest(c, "Invalid record ID")
		return
	}

	var req RedInkRetryRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	if err := h.redinkService.RetryFailedPages(c.Request.Context(), subject.UserID, recordID, req.PageIDs); err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, gin.H{"message": "retry_started"})
}
