package admin

import (
	"strconv"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/handler/dto"
	"github.com/Wei-Shaw/sub2api/internal/pkg/pagination"
	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

type InspirationHandler struct {
	galleryService *service.GalleryService
}

func NewInspirationHandler(galleryService *service.GalleryService) *InspirationHandler {
	return &InspirationHandler{galleryService: galleryService}
}

type UpdateSubmissionStatusRequest struct {
	Status string `json:"status"`
}

// ListSubmissions handles listing gallery submissions for admin review.
// GET /api/v1/admin/gallery/submissions
func (h *InspirationHandler) ListSubmissions(c *gin.Context) {
	page, pageSize := response.ParsePagination(c)
	status := strings.TrimSpace(c.DefaultQuery("status", service.GallerySubmissionPending))

	params := pagination.PaginationParams{Page: page, PageSize: pageSize}
	images, result, err := h.galleryService.ListSubmissions(c.Request.Context(), status, params)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	out := make([]dto.GalleryImage, 0, len(images))
	for i := range images {
		if mapped := dto.GalleryImageFromService(&images[i]); mapped != nil {
			out = append(out, *mapped)
		}
	}

	if result == nil {
		response.Paginated(c, out, 0, page, pageSize)
		return
	}

	response.Paginated(c, out, result.Total, result.Page, result.PageSize)
}

// UpdateSubmissionStatus handles approving, rejecting, or reopening a submission.
// PUT /api/v1/admin/gallery/submissions/:id/status
func (h *InspirationHandler) UpdateSubmissionStatus(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	imageID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || imageID <= 0 {
		response.BadRequest(c, "Invalid image ID")
		return
	}

	var req UpdateSubmissionStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body")
		return
	}

	normalizedStatus := strings.ToLower(strings.TrimSpace(req.Status))
	var image *service.GalleryImage

	switch normalizedStatus {
	case service.GallerySubmissionApproved, service.GallerySubmissionRejected:
		image, err = h.galleryService.ReviewSubmission(c.Request.Context(), imageID, subject.UserID, normalizedStatus)
	case service.GallerySubmissionPending:
		image, err = h.galleryService.ReopenSubmission(c.Request.Context(), imageID)
	default:
		response.BadRequest(c, "Invalid submission status")
		return
	}

	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, dto.GalleryImageFromService(image))
}
