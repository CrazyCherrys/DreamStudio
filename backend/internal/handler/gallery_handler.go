package handler

import (
	"strconv"

	"github.com/CrazyCherrys/DreamStudio/internal/handler/dto"
	"github.com/CrazyCherrys/DreamStudio/internal/pkg/pagination"
	"github.com/CrazyCherrys/DreamStudio/internal/pkg/response"
	middleware2 "github.com/CrazyCherrys/DreamStudio/internal/server/middleware"
	"github.com/CrazyCherrys/DreamStudio/internal/service"
	"github.com/gin-gonic/gin"
)

type GalleryHandler struct {
	galleryService *service.GalleryService
}

func NewGalleryHandler(galleryService *service.GalleryService) *GalleryHandler {
	return &GalleryHandler{galleryService: galleryService}
}

type CreateGalleryImageRequest struct {
	ImageURL          string  `json:"image_url"`
	ThumbnailURL      *string `json:"thumbnail_url"`
	ReferenceImageURL *string `json:"reference_image_url"`
	Prompt            *string `json:"prompt"`
	Model             *string `json:"model"`
	Width             *int    `json:"width"`
	Height            *int    `json:"height"`
	IsPublic          bool    `json:"is_public"`
}

type UpdateGalleryVisibilityRequest struct {
	IsPublic bool `json:"is_public"`
}

type SubmitGalleryImageRequest struct {
	ImageURL string `json:"image_url"`
}

// ListPublic handles listing public gallery images.
// GET /api/v1/gallery
func (h *GalleryHandler) ListPublic(c *gin.Context) {
	page, pageSize := response.ParsePagination(c)
	params := pagination.PaginationParams{Page: page, PageSize: pageSize}

	images, result, err := h.galleryService.ListPublic(c.Request.Context(), params)
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

// ListMine handles listing gallery images for the current user.
// GET /api/v1/gallery/mine
func (h *GalleryHandler) ListMine(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	page, pageSize := response.ParsePagination(c)
	params := pagination.PaginationParams{Page: page, PageSize: pageSize}

	images, result, err := h.galleryService.ListByUser(c.Request.Context(), subject.UserID, params)
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

// Create handles creating a gallery image record for the current user.
// POST /api/v1/gallery
func (h *GalleryHandler) Create(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	var req CreateGalleryImageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body")
		return
	}

	image, err := h.galleryService.Create(c.Request.Context(), subject.UserID, service.GalleryCreateInput{
		ImageURL:          req.ImageURL,
		ThumbnailURL:      req.ThumbnailURL,
		ReferenceImageURL: req.ReferenceImageURL,
		Prompt:            req.Prompt,
		Model:             req.Model,
		Width:             req.Width,
		Height:            req.Height,
		IsPublic:          false,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Created(c, dto.GalleryImageFromService(image))
}

// Submit handles submitting a gallery image for inspiration review.
// POST /api/v1/gallery/submit
func (h *GalleryHandler) Submit(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	var req SubmitGalleryImageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body")
		return
	}

	image, err := h.galleryService.SubmitByImageURL(c.Request.Context(), subject.UserID, req.ImageURL)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, dto.GalleryImageFromService(image))
}

// UpdateVisibility handles toggling public visibility for a user's image.
// PATCH /api/v1/gallery/:id/visibility
func (h *GalleryHandler) UpdateVisibility(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	imageID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || imageID <= 0 {
		response.BadRequest(c, "Invalid image ID")
		return
	}

	var req UpdateGalleryVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body")
		return
	}

	if req.IsPublic {
		response.BadRequest(c, "Public submissions require admin review")
		return
	}

	if err := h.galleryService.UpdateVisibility(c.Request.Context(), subject.UserID, imageID, req.IsPublic); err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, gin.H{"message": "updated"})
}

// WithdrawSubmission handles withdrawing a submission from inspiration review.
// DELETE /api/v1/gallery/:id/submission
func (h *GalleryHandler) WithdrawSubmission(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}

	imageID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || imageID <= 0 {
		response.BadRequest(c, "Invalid image ID")
		return
	}

	image, err := h.galleryService.WithdrawSubmission(c.Request.Context(), subject.UserID, imageID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, dto.GalleryImageFromService(image))
}
