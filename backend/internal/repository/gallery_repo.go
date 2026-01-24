package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/pagination"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/lib/pq"
)

type galleryRepository struct {
	sql sqlExecutor
}

func NewGalleryRepository(sqlDB *sql.DB) service.GalleryRepository {
	return &galleryRepository{sql: sqlDB}
}

func (r *galleryRepository) Create(ctx context.Context, image *service.GalleryImage) error {
	if image == nil {
		return nil
	}

	const insertQuery = `
		INSERT INTO gallery_images (
			user_id,
			image_url,
			thumbnail_url,
			reference_image_url,
			prompt,
			model,
			width,
			height,
			is_public,
			submission_status,
			submitted_at,
			reviewed_at,
			reviewed_by,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`

	var createdAt time.Time
	var updatedAt time.Time
	submissionStatus := image.SubmissionStatus
	if submissionStatus == "" {
		submissionStatus = service.GallerySubmissionNone
	}
	args := []any{
		image.UserID,
		image.ImageURL,
		image.ThumbnailURL,
		image.ReferenceImageURL,
		image.Prompt,
		image.Model,
		image.Width,
		image.Height,
		image.IsPublic,
		submissionStatus,
		image.SubmittedAt,
		image.ReviewedAt,
		image.ReviewedBy,
	}

	if err := scanSingleRow(ctx, r.sql, insertQuery, args, &image.ID, &createdAt, &updatedAt); err != nil {
		return err
	}

	image.CreatedAt = createdAt
	image.UpdatedAt = updatedAt
	return nil
}

func (r *galleryRepository) ListPublic(ctx context.Context, params pagination.PaginationParams) ([]service.GalleryImage, *pagination.PaginationResult, error) {
	const countQuery = `
		SELECT COUNT(*)
		FROM gallery_images
		WHERE is_public = TRUE AND submission_status = $1
	`

	var total int64
	if err := scanSingleRow(ctx, r.sql, countQuery, []any{service.GallerySubmissionApproved}, &total); err != nil {
		return nil, nil, err
	}

	if total == 0 {
		return []service.GalleryImage{}, paginationResultFromTotal(0, params), nil
	}

	const listQuery = `
		SELECT
			id,
			user_id,
			image_url,
			thumbnail_url,
			reference_image_url,
			prompt,
			model,
			width,
			height,
			is_public,
			submission_status,
			submitted_at,
			reviewed_at,
			reviewed_by,
			created_at,
			updated_at
		FROM gallery_images
		WHERE is_public = TRUE AND submission_status = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.sql.QueryContext(ctx, listQuery, service.GallerySubmissionApproved, params.Limit(), params.Offset())
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	images := make([]service.GalleryImage, 0, params.Limit())
	for rows.Next() {
		var image service.GalleryImage
		var thumbnailURL sql.NullString
		var referenceImageURL sql.NullString
		var prompt sql.NullString
		var model sql.NullString
		var width sql.NullInt64
		var height sql.NullInt64
		var submissionStatus string
		var submittedAt sql.NullTime
		var reviewedAt sql.NullTime
		var reviewedBy sql.NullInt64

		if err := rows.Scan(
			&image.ID,
			&image.UserID,
			&image.ImageURL,
			&thumbnailURL,
			&referenceImageURL,
			&prompt,
			&model,
			&width,
			&height,
			&image.IsPublic,
			&submissionStatus,
			&submittedAt,
			&reviewedAt,
			&reviewedBy,
			&image.CreatedAt,
			&image.UpdatedAt,
		); err != nil {
			return nil, nil, err
		}

		image.ThumbnailURL = nullStringPtr(thumbnailURL)
		image.ReferenceImageURL = nullStringPtr(referenceImageURL)
		image.Prompt = nullStringPtr(prompt)
		image.Model = nullStringPtr(model)
		image.Width = nullIntPtr(width)
		image.Height = nullIntPtr(height)
		image.SubmissionStatus = submissionStatus
		image.SubmittedAt = nullTimePtr(submittedAt)
		image.ReviewedAt = nullTimePtr(reviewedAt)
		image.ReviewedBy = nullInt64Ptr(reviewedBy)

		images = append(images, image)
	}

	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	return images, paginationResultFromTotal(total, params), nil
}

func (r *galleryRepository) ListByUser(
	ctx context.Context,
	userID int64,
	params pagination.PaginationParams,
) ([]service.GalleryImage, *pagination.PaginationResult, error) {
	const countQuery = `
		SELECT COUNT(*)
		FROM gallery_images
		WHERE user_id = $1
	`

	var total int64
	if err := scanSingleRow(ctx, r.sql, countQuery, []any{userID}, &total); err != nil {
		return nil, nil, err
	}

	if total == 0 {
		return []service.GalleryImage{}, paginationResultFromTotal(0, params), nil
	}

	const listQuery = `
		SELECT
			id,
			user_id,
			image_url,
			thumbnail_url,
			reference_image_url,
			prompt,
			model,
			width,
			height,
			is_public,
			submission_status,
			submitted_at,
			reviewed_at,
			reviewed_by,
			created_at,
			updated_at
		FROM gallery_images
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.sql.QueryContext(ctx, listQuery, userID, params.Limit(), params.Offset())
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	images := make([]service.GalleryImage, 0, params.Limit())
	for rows.Next() {
		var image service.GalleryImage
		var thumbnailURL sql.NullString
		var referenceImageURL sql.NullString
		var prompt sql.NullString
		var model sql.NullString
		var width sql.NullInt64
		var height sql.NullInt64
		var submissionStatus string
		var submittedAt sql.NullTime
		var reviewedAt sql.NullTime
		var reviewedBy sql.NullInt64

		if err := rows.Scan(
			&image.ID,
			&image.UserID,
			&image.ImageURL,
			&thumbnailURL,
			&referenceImageURL,
			&prompt,
			&model,
			&width,
			&height,
			&image.IsPublic,
			&submissionStatus,
			&submittedAt,
			&reviewedAt,
			&reviewedBy,
			&image.CreatedAt,
			&image.UpdatedAt,
		); err != nil {
			return nil, nil, err
		}

		image.ThumbnailURL = nullStringPtr(thumbnailURL)
		image.ReferenceImageURL = nullStringPtr(referenceImageURL)
		image.Prompt = nullStringPtr(prompt)
		image.Model = nullStringPtr(model)
		image.Width = nullIntPtr(width)
		image.Height = nullIntPtr(height)
		image.SubmissionStatus = submissionStatus
		image.SubmittedAt = nullTimePtr(submittedAt)
		image.ReviewedAt = nullTimePtr(reviewedAt)
		image.ReviewedBy = nullInt64Ptr(reviewedBy)

		images = append(images, image)
	}

	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	return images, paginationResultFromTotal(total, params), nil
}

func (r *galleryRepository) ListByUserAndImageURLs(
	ctx context.Context,
	userID int64,
	imageURLs []string,
) ([]service.GalleryImage, error) {
	if len(imageURLs) == 0 {
		return []service.GalleryImage{}, nil
	}

	const query = `
		SELECT DISTINCT ON (image_url)
			id,
			user_id,
			image_url,
			thumbnail_url,
			reference_image_url,
			prompt,
			model,
			width,
			height,
			is_public,
			submission_status,
			submitted_at,
			reviewed_at,
			reviewed_by,
			created_at,
			updated_at
		FROM gallery_images
		WHERE user_id = $1 AND image_url = ANY($2)
		ORDER BY image_url, created_at DESC
	`

	rows, err := r.sql.QueryContext(ctx, query, userID, pq.Array(imageURLs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	images := make([]service.GalleryImage, 0, len(imageURLs))
	for rows.Next() {
		var image service.GalleryImage
		var thumbnailURL sql.NullString
		var referenceImageURL sql.NullString
		var prompt sql.NullString
		var model sql.NullString
		var width sql.NullInt64
		var height sql.NullInt64
		var submissionStatus string
		var submittedAt sql.NullTime
		var reviewedAt sql.NullTime
		var reviewedBy sql.NullInt64

		if err := rows.Scan(
			&image.ID,
			&image.UserID,
			&image.ImageURL,
			&thumbnailURL,
			&referenceImageURL,
			&prompt,
			&model,
			&width,
			&height,
			&image.IsPublic,
			&submissionStatus,
			&submittedAt,
			&reviewedAt,
			&reviewedBy,
			&image.CreatedAt,
			&image.UpdatedAt,
		); err != nil {
			return nil, err
		}

		image.ThumbnailURL = nullStringPtr(thumbnailURL)
		image.ReferenceImageURL = nullStringPtr(referenceImageURL)
		image.Prompt = nullStringPtr(prompt)
		image.Model = nullStringPtr(model)
		image.Width = nullIntPtr(width)
		image.Height = nullIntPtr(height)
		image.SubmissionStatus = submissionStatus
		image.SubmittedAt = nullTimePtr(submittedAt)
		image.ReviewedAt = nullTimePtr(reviewedAt)
		image.ReviewedBy = nullInt64Ptr(reviewedBy)

		images = append(images, image)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return images, nil
}

func (r *galleryRepository) GetByUserAndImageURL(ctx context.Context, userID int64, imageURL string) (*service.GalleryImage, error) {
	const query = `
		SELECT
			id,
			user_id,
			image_url,
			thumbnail_url,
			reference_image_url,
			prompt,
			model,
			width,
			height,
			is_public,
			submission_status,
			submitted_at,
			reviewed_at,
			reviewed_by,
			created_at,
			updated_at
		FROM gallery_images
		WHERE user_id = $1 AND image_url = $2
		ORDER BY created_at DESC
		LIMIT 1
	`

	var image service.GalleryImage
	var thumbnailURL sql.NullString
	var referenceImageURL sql.NullString
	var prompt sql.NullString
	var model sql.NullString
	var width sql.NullInt64
	var height sql.NullInt64
	var submissionStatus string
	var submittedAt sql.NullTime
	var reviewedAt sql.NullTime
	var reviewedBy sql.NullInt64

	if err := scanSingleRow(ctx, r.sql, query, []any{userID, imageURL},
		&image.ID,
		&image.UserID,
		&image.ImageURL,
		&thumbnailURL,
		&referenceImageURL,
		&prompt,
		&model,
		&width,
		&height,
		&image.IsPublic,
		&submissionStatus,
		&submittedAt,
		&reviewedAt,
		&reviewedBy,
		&image.CreatedAt,
		&image.UpdatedAt,
	); err != nil {
		return nil, err
	}

	image.ThumbnailURL = nullStringPtr(thumbnailURL)
	image.ReferenceImageURL = nullStringPtr(referenceImageURL)
	image.Prompt = nullStringPtr(prompt)
	image.Model = nullStringPtr(model)
	image.Width = nullIntPtr(width)
	image.Height = nullIntPtr(height)
	image.SubmissionStatus = submissionStatus
	image.SubmittedAt = nullTimePtr(submittedAt)
	image.ReviewedAt = nullTimePtr(reviewedAt)
	image.ReviewedBy = nullInt64Ptr(reviewedBy)

	return &image, nil
}

func (r *galleryRepository) DeleteByUserAndImageURLs(ctx context.Context, userID int64, imageURLs []string) error {
	if len(imageURLs) == 0 {
		return nil
	}
	const deleteQuery = `
		DELETE FROM gallery_images
		WHERE user_id = $1 AND image_url = ANY($2)
	`
	_, err := r.sql.ExecContext(ctx, deleteQuery, userID, pq.Array(imageURLs))
	return err
}

func (r *galleryRepository) ListBySubmissionStatus(
	ctx context.Context,
	status string,
	params pagination.PaginationParams,
) ([]service.GalleryImage, *pagination.PaginationResult, error) {
	if status == "" {
		const countQuery = `
			SELECT COUNT(*)
			FROM gallery_images
		`

		var total int64
		if err := scanSingleRow(ctx, r.sql, countQuery, nil, &total); err != nil {
			return nil, nil, err
		}
		if total == 0 {
			return []service.GalleryImage{}, paginationResultFromTotal(0, params), nil
		}

		const listQuery = `
			SELECT
				id,
				user_id,
				image_url,
				thumbnail_url,
				reference_image_url,
				prompt,
				model,
				width,
				height,
				is_public,
				submission_status,
				submitted_at,
				reviewed_at,
				reviewed_by,
				created_at,
				updated_at
			FROM gallery_images
			ORDER BY created_at DESC
			LIMIT $1 OFFSET $2
		`

		rows, err := r.sql.QueryContext(ctx, listQuery, params.Limit(), params.Offset())
		if err != nil {
			return nil, nil, err
		}
		defer rows.Close()

		images := make([]service.GalleryImage, 0, params.Limit())
		for rows.Next() {
			var image service.GalleryImage
			var thumbnailURL sql.NullString
			var referenceImageURL sql.NullString
			var prompt sql.NullString
			var model sql.NullString
			var width sql.NullInt64
			var height sql.NullInt64
			var submissionStatus string
			var submittedAt sql.NullTime
			var reviewedAt sql.NullTime
			var reviewedBy sql.NullInt64

			if err := rows.Scan(
				&image.ID,
				&image.UserID,
				&image.ImageURL,
				&thumbnailURL,
				&referenceImageURL,
				&prompt,
				&model,
				&width,
				&height,
				&image.IsPublic,
				&submissionStatus,
				&submittedAt,
				&reviewedAt,
				&reviewedBy,
				&image.CreatedAt,
				&image.UpdatedAt,
			); err != nil {
				return nil, nil, err
			}

			image.ThumbnailURL = nullStringPtr(thumbnailURL)
			image.ReferenceImageURL = nullStringPtr(referenceImageURL)
			image.Prompt = nullStringPtr(prompt)
			image.Model = nullStringPtr(model)
			image.Width = nullIntPtr(width)
			image.Height = nullIntPtr(height)
			image.SubmissionStatus = submissionStatus
			image.SubmittedAt = nullTimePtr(submittedAt)
			image.ReviewedAt = nullTimePtr(reviewedAt)
			image.ReviewedBy = nullInt64Ptr(reviewedBy)

			images = append(images, image)
		}

		if err := rows.Err(); err != nil {
			return nil, nil, err
		}

		return images, paginationResultFromTotal(total, params), nil
	}

	const countQuery = `
		SELECT COUNT(*)
		FROM gallery_images
		WHERE submission_status = $1
	`

	var total int64
	if err := scanSingleRow(ctx, r.sql, countQuery, []any{status}, &total); err != nil {
		return nil, nil, err
	}
	if total == 0 {
		return []service.GalleryImage{}, paginationResultFromTotal(0, params), nil
	}

	const listQuery = `
		SELECT
			id,
			user_id,
			image_url,
			thumbnail_url,
			reference_image_url,
			prompt,
			model,
			width,
			height,
			is_public,
			submission_status,
			submitted_at,
			reviewed_at,
			reviewed_by,
			created_at,
			updated_at
		FROM gallery_images
		WHERE submission_status = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.sql.QueryContext(ctx, listQuery, status, params.Limit(), params.Offset())
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	images := make([]service.GalleryImage, 0, params.Limit())
	for rows.Next() {
		var image service.GalleryImage
		var thumbnailURL sql.NullString
		var referenceImageURL sql.NullString
		var prompt sql.NullString
		var model sql.NullString
		var width sql.NullInt64
		var height sql.NullInt64
		var submissionStatus string
		var submittedAt sql.NullTime
		var reviewedAt sql.NullTime
		var reviewedBy sql.NullInt64

		if err := rows.Scan(
			&image.ID,
			&image.UserID,
			&image.ImageURL,
			&thumbnailURL,
			&referenceImageURL,
			&prompt,
			&model,
			&width,
			&height,
			&image.IsPublic,
			&submissionStatus,
			&submittedAt,
			&reviewedAt,
			&reviewedBy,
			&image.CreatedAt,
			&image.UpdatedAt,
		); err != nil {
			return nil, nil, err
		}

		image.ThumbnailURL = nullStringPtr(thumbnailURL)
		image.ReferenceImageURL = nullStringPtr(referenceImageURL)
		image.Prompt = nullStringPtr(prompt)
		image.Model = nullStringPtr(model)
		image.Width = nullIntPtr(width)
		image.Height = nullIntPtr(height)
		image.SubmissionStatus = submissionStatus
		image.SubmittedAt = nullTimePtr(submittedAt)
		image.ReviewedAt = nullTimePtr(reviewedAt)
		image.ReviewedBy = nullInt64Ptr(reviewedBy)

		images = append(images, image)
	}

	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	return images, paginationResultFromTotal(total, params), nil
}

func (r *galleryRepository) UpdateVisibility(ctx context.Context, userID, imageID int64, isPublic bool) error {
	const updateQuery = `
		UPDATE gallery_images
		SET is_public = $1, updated_at = NOW()
		WHERE id = $2 AND user_id = $3
	`

	result, err := r.sql.ExecContext(ctx, updateQuery, isPublic, imageID, userID)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if affected == 0 {
		return service.ErrGalleryImageNotFound
	}

	return nil
}

func (r *galleryRepository) UpdateSubmissionStatus(
	ctx context.Context,
	userID, imageID int64,
	status string,
	submittedAt time.Time,
) (*service.GalleryImage, error) {
	const updateQuery = `
		UPDATE gallery_images
		SET submission_status = $1,
			submitted_at = $2,
			reviewed_at = NULL,
			reviewed_by = NULL,
			is_public = FALSE,
			updated_at = NOW()
		WHERE id = $3 AND user_id = $4
		RETURNING
			id,
			user_id,
			image_url,
			thumbnail_url,
			reference_image_url,
			prompt,
			model,
			width,
			height,
			is_public,
			submission_status,
			submitted_at,
			reviewed_at,
			reviewed_by,
			created_at,
			updated_at
	`

	var image service.GalleryImage
	var thumbnailURL sql.NullString
	var referenceImageURL sql.NullString
	var prompt sql.NullString
	var model sql.NullString
	var width sql.NullInt64
	var height sql.NullInt64
	var submissionStatus string
	var submittedAtValue sql.NullTime
	var reviewedAt sql.NullTime
	var reviewedBy sql.NullInt64

	if err := scanSingleRow(ctx, r.sql, updateQuery, []any{status, submittedAt, imageID, userID},
		&image.ID,
		&image.UserID,
		&image.ImageURL,
		&thumbnailURL,
		&referenceImageURL,
		&prompt,
		&model,
		&width,
		&height,
		&image.IsPublic,
		&submissionStatus,
		&submittedAtValue,
		&reviewedAt,
		&reviewedBy,
		&image.CreatedAt,
		&image.UpdatedAt,
	); err != nil {
		return nil, err
	}

	image.ThumbnailURL = nullStringPtr(thumbnailURL)
	image.ReferenceImageURL = nullStringPtr(referenceImageURL)
	image.Prompt = nullStringPtr(prompt)
	image.Model = nullStringPtr(model)
	image.Width = nullIntPtr(width)
	image.Height = nullIntPtr(height)
	image.SubmissionStatus = submissionStatus
	image.SubmittedAt = nullTimePtr(submittedAtValue)
	image.ReviewedAt = nullTimePtr(reviewedAt)
	image.ReviewedBy = nullInt64Ptr(reviewedBy)

	return &image, nil
}

func (r *galleryRepository) ResetSubmissionStatus(ctx context.Context, userID, imageID int64) (*service.GalleryImage, error) {
	const updateQuery = `
		UPDATE gallery_images
		SET submission_status = $1,
			submitted_at = NULL,
			reviewed_at = NULL,
			reviewed_by = NULL,
			is_public = FALSE,
			updated_at = NOW()
		WHERE id = $2 AND user_id = $3
		RETURNING
			id,
			user_id,
			image_url,
			thumbnail_url,
			reference_image_url,
			prompt,
			model,
			width,
			height,
			is_public,
			submission_status,
			submitted_at,
			reviewed_at,
			reviewed_by,
			created_at,
			updated_at
	`

	var image service.GalleryImage
	var thumbnailURL sql.NullString
	var referenceImageURL sql.NullString
	var prompt sql.NullString
	var model sql.NullString
	var width sql.NullInt64
	var height sql.NullInt64
	var submissionStatus string
	var submittedAtValue sql.NullTime
	var reviewedAt sql.NullTime
	var reviewedBy sql.NullInt64

	if err := scanSingleRow(ctx, r.sql, updateQuery, []any{service.GallerySubmissionNone, imageID, userID},
		&image.ID,
		&image.UserID,
		&image.ImageURL,
		&thumbnailURL,
		&referenceImageURL,
		&prompt,
		&model,
		&width,
		&height,
		&image.IsPublic,
		&submissionStatus,
		&submittedAtValue,
		&reviewedAt,
		&reviewedBy,
		&image.CreatedAt,
		&image.UpdatedAt,
	); err != nil {
		return nil, err
	}

	image.ThumbnailURL = nullStringPtr(thumbnailURL)
	image.ReferenceImageURL = nullStringPtr(referenceImageURL)
	image.Prompt = nullStringPtr(prompt)
	image.Model = nullStringPtr(model)
	image.Width = nullIntPtr(width)
	image.Height = nullIntPtr(height)
	image.SubmissionStatus = submissionStatus
	image.SubmittedAt = nullTimePtr(submittedAtValue)
	image.ReviewedAt = nullTimePtr(reviewedAt)
	image.ReviewedBy = nullInt64Ptr(reviewedBy)

	return &image, nil
}

func (r *galleryRepository) UpdateReviewStatus(
	ctx context.Context,
	imageID int64,
	status string,
	reviewedAt time.Time,
	reviewedBy int64,
	isPublic bool,
) (*service.GalleryImage, error) {
	const updateQuery = `
		UPDATE gallery_images
		SET submission_status = $1,
			reviewed_at = $2,
			reviewed_by = $3,
			is_public = $4,
			updated_at = NOW()
		WHERE id = $5
		RETURNING
			id,
			user_id,
			image_url,
			thumbnail_url,
			reference_image_url,
			prompt,
			model,
			width,
			height,
			is_public,
			submission_status,
			submitted_at,
			reviewed_at,
			reviewed_by,
			created_at,
			updated_at
	`

	var image service.GalleryImage
	var thumbnailURL sql.NullString
	var referenceImageURL sql.NullString
	var prompt sql.NullString
	var model sql.NullString
	var width sql.NullInt64
	var height sql.NullInt64
	var submissionStatus string
	var submittedAtValue sql.NullTime
	var reviewedAtValue sql.NullTime
	var reviewedByValue sql.NullInt64

	if err := scanSingleRow(ctx, r.sql, updateQuery, []any{status, reviewedAt, reviewedBy, isPublic, imageID},
		&image.ID,
		&image.UserID,
		&image.ImageURL,
		&thumbnailURL,
		&referenceImageURL,
		&prompt,
		&model,
		&width,
		&height,
		&image.IsPublic,
		&submissionStatus,
		&submittedAtValue,
		&reviewedAtValue,
		&reviewedByValue,
		&image.CreatedAt,
		&image.UpdatedAt,
	); err != nil {
		return nil, err
	}

	image.ThumbnailURL = nullStringPtr(thumbnailURL)
	image.ReferenceImageURL = nullStringPtr(referenceImageURL)
	image.Prompt = nullStringPtr(prompt)
	image.Model = nullStringPtr(model)
	image.Width = nullIntPtr(width)
	image.Height = nullIntPtr(height)
	image.SubmissionStatus = submissionStatus
	image.SubmittedAt = nullTimePtr(submittedAtValue)
	image.ReviewedAt = nullTimePtr(reviewedAtValue)
	image.ReviewedBy = nullInt64Ptr(reviewedByValue)

	return &image, nil
}

func nullStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func nullIntPtr(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}
	out := int(value.Int64)
	return &out
}

func nullInt64Ptr(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	out := value.Int64
	return &out
}

func nullTimePtr(value sql.NullTime) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}
