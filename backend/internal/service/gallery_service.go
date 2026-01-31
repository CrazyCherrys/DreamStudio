package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	infraerrors "github.com/CrazyCherrys/DreamStudio/internal/pkg/errors"
	"github.com/CrazyCherrys/DreamStudio/internal/pkg/pagination"
)

var (
	ErrGalleryImageNotFound = infraerrors.NotFound("GALLERY_IMAGE_NOT_FOUND", "gallery image not found")
	ErrGalleryImageInvalid  = infraerrors.BadRequest("GALLERY_IMAGE_INVALID", "invalid gallery image")
)

const (
	GallerySubmissionNone     = "none"
	GallerySubmissionPending  = "pending"
	GallerySubmissionApproved = "approved"
	GallerySubmissionRejected = "rejected"
)

type GalleryImage struct {
	ID                int64
	UserID            int64
	ImageURL          string
	ThumbnailURL      *string
	ReferenceImageURL *string
	Prompt            *string
	Model             *string
	Width             *int
	Height            *int
	IsPublic          bool
	SubmissionStatus  string
	SubmittedAt       *time.Time
	ReviewedAt        *time.Time
	ReviewedBy        *int64
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type GalleryCreateInput struct {
	ImageURL     string
	ThumbnailURL *string
	ReferenceImageURL *string
	Prompt       *string
	Model        *string
	Width        *int
	Height       *int
	IsPublic     bool
}

type GalleryRepository interface {
	Create(ctx context.Context, image *GalleryImage) error
	ListPublic(ctx context.Context, params pagination.PaginationParams) ([]GalleryImage, *pagination.PaginationResult, error)
	ListByUser(ctx context.Context, userID int64, params pagination.PaginationParams) ([]GalleryImage, *pagination.PaginationResult, error)
	ListByUserAndImageURLs(ctx context.Context, userID int64, imageURLs []string) ([]GalleryImage, error)
	UpdateVisibility(ctx context.Context, userID, imageID int64, isPublic bool) error
	GetByUserAndImageURL(ctx context.Context, userID int64, imageURL string) (*GalleryImage, error)
	DeleteByUserAndImageURLs(ctx context.Context, userID int64, imageURLs []string) error
	ListBySubmissionStatus(ctx context.Context, status string, params pagination.PaginationParams) ([]GalleryImage, *pagination.PaginationResult, error)
	UpdateSubmissionStatus(ctx context.Context, userID, imageID int64, status string, submittedAt time.Time) (*GalleryImage, error)
	UpdateReviewStatus(ctx context.Context, imageID int64, status string, reviewedAt time.Time, reviewedBy int64, isPublic bool) (*GalleryImage, error)
	ReopenSubmission(ctx context.Context, imageID int64) (*GalleryImage, error)
	ResetSubmissionStatus(ctx context.Context, userID, imageID int64) (*GalleryImage, error)
}

type GalleryService struct {
	repo GalleryRepository
}

func NewGalleryService(repo GalleryRepository) *GalleryService {
	return &GalleryService{repo: repo}
}

func (s *GalleryService) ListPublic(ctx context.Context, params pagination.PaginationParams) ([]GalleryImage, *pagination.PaginationResult, error) {
	images, result, err := s.repo.ListPublic(ctx, params)
	if err != nil {
		return nil, nil, fmt.Errorf("list public gallery images: %w", err)
	}
	return images, result, nil
}

func (s *GalleryService) ListByUser(ctx context.Context, userID int64, params pagination.PaginationParams) ([]GalleryImage, *pagination.PaginationResult, error) {
	if userID <= 0 {
		return nil, nil, ErrGalleryImageInvalid
	}
	images, result, err := s.repo.ListByUser(ctx, userID, params)
	if err != nil {
		return nil, nil, fmt.Errorf("list user gallery images: %w", err)
	}
	return images, result, nil
}

func (s *GalleryService) ListByUserAndImageURLs(ctx context.Context, userID int64, imageURLs []string) ([]GalleryImage, error) {
	if userID <= 0 {
		return nil, ErrGalleryImageInvalid
	}
	images, err := s.repo.ListByUserAndImageURLs(ctx, userID, imageURLs)
	if err != nil {
		return nil, fmt.Errorf("list gallery images by url: %w", err)
	}
	return images, nil
}

func (s *GalleryService) Create(ctx context.Context, userID int64, input GalleryCreateInput) (*GalleryImage, error) {
	if userID <= 0 {
		return nil, ErrGalleryImageInvalid
	}

	imageURL := strings.TrimSpace(input.ImageURL)
	if imageURL == "" {
		return nil, ErrGalleryImageInvalid
	}

	submissionStatus := GallerySubmissionNone
	var submittedAt *time.Time
	var reviewedAt *time.Time
	if input.IsPublic {
		submissionStatus = GallerySubmissionApproved
		now := time.Now()
		submittedAt = &now
		reviewedAt = &now
	}

	image := &GalleryImage{
		UserID:       userID,
		ImageURL:     imageURL,
		ThumbnailURL: normalizeOptionalString(input.ThumbnailURL),
		ReferenceImageURL: normalizeOptionalString(input.ReferenceImageURL),
		Prompt:       normalizeOptionalString(input.Prompt),
		Model:        normalizeOptionalString(input.Model),
		Width:        normalizePositiveInt(input.Width),
		Height:       normalizePositiveInt(input.Height),
		IsPublic:     input.IsPublic,
		SubmissionStatus: submissionStatus,
		SubmittedAt:      submittedAt,
		ReviewedAt:       reviewedAt,
	}

	if err := s.repo.Create(ctx, image); err != nil {
		return nil, fmt.Errorf("create gallery image: %w", err)
	}

	return image, nil
}

func (s *GalleryService) UpdateVisibility(ctx context.Context, userID, imageID int64, isPublic bool) error {
	if userID <= 0 || imageID <= 0 {
		return ErrGalleryImageInvalid
	}
	if err := s.repo.UpdateVisibility(ctx, userID, imageID, isPublic); err != nil {
		return fmt.Errorf("update gallery visibility: %w", err)
	}
	return nil
}

func (s *GalleryService) SubmitByImageURL(ctx context.Context, userID int64, imageURL string) (*GalleryImage, error) {
	if userID <= 0 {
		return nil, ErrGalleryImageInvalid
	}
	trimmedURL := strings.TrimSpace(imageURL)
	if trimmedURL == "" {
		return nil, ErrGalleryImageInvalid
	}

	image, err := s.repo.GetByUserAndImageURL(ctx, userID, trimmedURL)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrGalleryImageNotFound
		}
		return nil, fmt.Errorf("get gallery image: %w", err)
	}
	if image == nil {
		return nil, ErrGalleryImageNotFound
	}

	switch normalizeSubmissionStatus(image.SubmissionStatus) {
	case GallerySubmissionPending, GallerySubmissionApproved:
		return image, nil
	}

	updated, err := s.repo.UpdateSubmissionStatus(ctx, userID, image.ID, GallerySubmissionPending, time.Now())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrGalleryImageNotFound
		}
		return nil, fmt.Errorf("submit gallery image: %w", err)
	}
	return updated, nil
}

func (s *GalleryService) WithdrawSubmission(ctx context.Context, userID, imageID int64) (*GalleryImage, error) {
	if userID <= 0 || imageID <= 0 {
		return nil, ErrGalleryImageInvalid
	}
	image, err := s.repo.ResetSubmissionStatus(ctx, userID, imageID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrGalleryImageNotFound
		}
		return nil, fmt.Errorf("withdraw gallery submission: %w", err)
	}
	return image, nil
}

func (s *GalleryService) ListSubmissions(ctx context.Context, status string, params pagination.PaginationParams) ([]GalleryImage, *pagination.PaginationResult, error) {
	normalized := normalizeSubmissionStatus(status)
	if normalized != "" && !isKnownSubmissionStatus(normalized) && normalized != "all" {
		return nil, nil, ErrGalleryImageInvalid
	}
	if normalized == "all" {
		normalized = ""
	}
	images, result, err := s.repo.ListBySubmissionStatus(ctx, normalized, params)
	if err != nil {
		return nil, nil, fmt.Errorf("list gallery submissions: %w", err)
	}
	return images, result, nil
}

func (s *GalleryService) ReviewSubmission(ctx context.Context, imageID, reviewerID int64, status string) (*GalleryImage, error) {
	if imageID <= 0 || reviewerID <= 0 {
		return nil, ErrGalleryImageInvalid
	}
	normalized := normalizeSubmissionStatus(status)
	if normalized != GallerySubmissionApproved && normalized != GallerySubmissionRejected {
		return nil, ErrGalleryImageInvalid
	}

	updated, err := s.repo.UpdateReviewStatus(ctx, imageID, normalized, time.Now(), reviewerID, normalized == GallerySubmissionApproved)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrGalleryImageNotFound
		}
		return nil, fmt.Errorf("review gallery submission: %w", err)
	}
	return updated, nil
}

func (s *GalleryService) ReopenSubmission(ctx context.Context, imageID int64) (*GalleryImage, error) {
	if imageID <= 0 {
		return nil, ErrGalleryImageInvalid
	}

	updated, err := s.repo.ReopenSubmission(ctx, imageID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrGalleryImageNotFound
		}
		return nil, fmt.Errorf("reopen gallery submission: %w", err)
	}
	return updated, nil
}

func (s *GalleryService) DeleteByUserAndImageURLs(ctx context.Context, userID int64, imageURLs []string) error {
	if userID <= 0 {
		return ErrGalleryImageInvalid
	}
	if err := s.repo.DeleteByUserAndImageURLs(ctx, userID, imageURLs); err != nil {
		return fmt.Errorf("delete gallery images: %w", err)
	}
	return nil
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizePositiveInt(value *int) *int {
	if value == nil || *value <= 0 {
		return nil
	}
	return value
}

func normalizeSubmissionStatus(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func isKnownSubmissionStatus(value string) bool {
	switch value {
	case GallerySubmissionNone, GallerySubmissionPending, GallerySubmissionApproved, GallerySubmissionRejected:
		return true
	default:
		return false
	}
}
