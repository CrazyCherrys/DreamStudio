package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/CrazyCherrys/DreamStudio/internal/pkg/pagination"
	"github.com/CrazyCherrys/DreamStudio/internal/service"
)

type redinkRepository struct {
	sql sqlExecutor
}

func NewRedInkRepository(sqlDB *sql.DB) service.RedInkRepository {
	return &redinkRepository{sql: sqlDB}
}

func (r *redinkRepository) CreateRecord(ctx context.Context, record *service.RedInkRecord, pages []service.RedInkPage) error {
	if record == nil {
		return nil
	}

	content, err := encodeRedInkContent(record.Content)
	if err != nil {
		return err
	}
	images, err := encodeStringList(record.InputImages)
	if err != nil {
		return err
	}

	const insertRecord = `
		INSERT INTO redink_records (
			user_id,
			topic,
			outline_raw,
			content_json,
			input_images,
			text_model_id,
			image_model_id,
			resolution,
			aspect_ratio,
			status,
			thumbnail_url,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`

	args := []any{
		record.UserID,
		record.Topic,
		record.OutlineRaw,
		content,
		images,
		record.TextModelID,
		record.ImageModelID,
		record.Resolution,
		record.AspectRatio,
		record.Status,
		record.ThumbnailURL,
	}

	if err := scanSingleRow(ctx, r.sql, insertRecord, args, &record.ID, &record.CreatedAt, &record.UpdatedAt); err != nil {
		return err
	}

	if len(pages) == 0 {
		return nil
	}

	if err := r.replacePages(ctx, record.ID, pages); err != nil {
		_ = r.MarkDeleted(ctx, record.UserID, record.ID)
		return err
	}
	return nil
}

func (r *redinkRepository) UpdateRecord(ctx context.Context, record *service.RedInkRecord) error {
	if record == nil {
		return nil
	}
	content, err := encodeRedInkContent(record.Content)
	if err != nil {
		return err
	}
	images, err := encodeStringList(record.InputImages)
	if err != nil {
		return err
	}

	const updateQuery = `
		UPDATE redink_records
		SET topic = $1,
			outline_raw = $2,
			content_json = $3::jsonb,
			input_images = $4::jsonb,
			text_model_id = $5,
			image_model_id = $6,
			resolution = $7,
			aspect_ratio = $8,
			status = $9,
			thumbnail_url = $10,
			updated_at = NOW()
		WHERE id = $11 AND deleted_at IS NULL
	`
	_, err = r.sql.ExecContext(ctx, updateQuery,
		record.Topic,
		record.OutlineRaw,
		content,
		images,
		record.TextModelID,
		record.ImageModelID,
		record.Resolution,
		record.AspectRatio,
		record.Status,
		record.ThumbnailURL,
		record.ID,
	)
	return err
}

func (r *redinkRepository) UpdateRecordStatus(ctx context.Context, recordID int64, status string) error {
	const updateQuery = `
		UPDATE redink_records
		SET status = $1,
			updated_at = NOW()
		WHERE id = $2 AND deleted_at IS NULL
	`
	_, err := r.sql.ExecContext(ctx, updateQuery, status, recordID)
	return err
}

func (r *redinkRepository) UpdateRecordThumbnail(ctx context.Context, recordID int64, thumbnailURL *string) error {
	const updateQuery = `
		UPDATE redink_records
		SET thumbnail_url = $1,
			updated_at = NOW()
		WHERE id = $2 AND deleted_at IS NULL
	`
	_, err := r.sql.ExecContext(ctx, updateQuery, thumbnailURL, recordID)
	return err
}

func (r *redinkRepository) UpdateRecordContent(ctx context.Context, recordID int64, content *service.RedInkContentResult) error {
	encoded, err := encodeRedInkContent(content)
	if err != nil {
		return err
	}
	const updateQuery = `
		UPDATE redink_records
		SET content_json = $1::jsonb,
			updated_at = NOW()
		WHERE id = $2 AND deleted_at IS NULL
	`
	_, err = r.sql.ExecContext(ctx, updateQuery, encoded, recordID)
	return err
}

func (r *redinkRepository) ReplacePages(ctx context.Context, recordID int64, pages []service.RedInkPage) error {
	return r.replacePages(ctx, recordID, pages)
}

func (r *redinkRepository) ResetPages(ctx context.Context, recordID int64, pageIDs []int64) error {
	if recordID <= 0 {
		return nil
	}
	if len(pageIDs) == 0 {
		const updateAll = `
			UPDATE redink_pages
			SET status = $1,
				prompt_text = NULL,
				image_url = NULL,
				error_message = NULL,
				last_error = NULL,
				next_attempt_at = NULL,
				completed_at = NULL,
				updated_at = NOW()
			WHERE record_id = $2 AND deleted_at IS NULL
		`
		_, err := r.sql.ExecContext(ctx, updateAll, service.RedInkPageStatusPending, recordID)
		return err
	}

	placeholders := make([]string, 0, len(pageIDs))
	args := make([]any, 0, len(pageIDs)+2)
	args = append(args, service.RedInkPageStatusPending, recordID)
	for i, id := range pageIDs {
		placeholders = append(placeholders, fmt.Sprintf("$%d", i+3))
		args = append(args, id)
	}

	updateQuery := fmt.Sprintf(`
		UPDATE redink_pages
		SET status = $1,
			error_message = NULL,
			last_error = NULL,
			next_attempt_at = NULL,
			completed_at = NULL,
			updated_at = NOW()
		WHERE record_id = $2
		  AND id IN (%s)
		  AND deleted_at IS NULL
	`, strings.Join(placeholders, ","))

	_, err := r.sql.ExecContext(ctx, updateQuery, args...)
	return err
}

func (r *redinkRepository) replacePages(ctx context.Context, recordID int64, pages []service.RedInkPage) error {
	const markDeleted = `
		UPDATE redink_pages
		SET deleted_at = NOW(),
			updated_at = NOW()
		WHERE record_id = $1 AND deleted_at IS NULL
	`
	if _, err := r.sql.ExecContext(ctx, markDeleted, recordID); err != nil {
		return err
	}

	if len(pages) == 0 {
		return nil
	}

	valueStrings := make([]string, 0, len(pages))
	args := make([]any, 0, len(pages)*5+1)
	argIndex := 1

	for _, page := range pages {
		valueStrings = append(valueStrings, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,NOW(),NOW())",
			argIndex, argIndex+1, argIndex+2, argIndex+3, argIndex+4, argIndex+5, argIndex+6,
		))
		args = append(args,
			recordID,
			page.PageIndex,
			page.PageType,
			page.PageContent,
			page.PromptText,
			page.Status,
			page.Attempts,
		)
		argIndex += 7
	}

	insertQuery := fmt.Sprintf(`
		INSERT INTO redink_pages (
			record_id,
			page_index,
			page_type,
			page_content,
			prompt_text,
			status,
			attempts,
			created_at,
			updated_at
		)
		VALUES %s
	`, strings.Join(valueStrings, ","))

	_, err := r.sql.ExecContext(ctx, insertQuery, args...)
	return err
}

func (r *redinkRepository) ListByUser(
	ctx context.Context,
	userID int64,
	params pagination.PaginationParams,
	filters service.RedInkRecordFilters,
) ([]service.RedInkRecordSummary, *pagination.PaginationResult, error) {
	clauses := []string{"r.user_id = $1", "r.deleted_at IS NULL"}
	args := []any{userID}
	argIndex := 2

	if filters.Status != "" {
		clauses = append(clauses, fmt.Sprintf("r.status = $%d", argIndex))
		args = append(args, filters.Status)
		argIndex++
	}
	if filters.StartTime != nil {
		clauses = append(clauses, fmt.Sprintf("r.created_at >= $%d", argIndex))
		args = append(args, *filters.StartTime)
		argIndex++
	}
	if filters.EndTime != nil {
		clauses = append(clauses, fmt.Sprintf("r.created_at <= $%d", argIndex))
		args = append(args, *filters.EndTime)
		argIndex++
	}

	whereClause := "WHERE " + strings.Join(clauses, " AND ")

	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM redink_records r
		%s
	`, whereClause)

	var total int64
	if err := scanSingleRow(ctx, r.sql, countQuery, args, &total); err != nil {
		return nil, nil, err
	}
	if total == 0 {
		return []service.RedInkRecordSummary{}, paginationResultFromTotal(0, params), nil
	}

	listQuery := fmt.Sprintf(`
		SELECT
			r.id,
			r.user_id,
			r.topic,
			r.outline_raw,
			r.content_json,
			r.input_images,
			r.text_model_id,
			r.image_model_id,
			r.resolution,
			r.aspect_ratio,
			r.status,
			r.thumbnail_url,
			r.created_at,
			r.updated_at,
			COALESCE(p.total_pages, 0) AS total_pages,
			COALESCE(p.completed_pages, 0) AS completed_pages,
			COALESCE(p.failed_pages, 0) AS failed_pages
		FROM redink_records r
		LEFT JOIN (
			SELECT
				record_id,
				COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total_pages,
				COUNT(*) FILTER (WHERE status = $%d AND deleted_at IS NULL) AS completed_pages,
				COUNT(*) FILTER (WHERE status = $%d AND deleted_at IS NULL) AS failed_pages
			FROM redink_pages
			WHERE deleted_at IS NULL
			GROUP BY record_id
		) p ON p.record_id = r.id
		%s
		ORDER BY r.created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIndex, argIndex+1, argIndex+2, argIndex+3)

	listArgs := append(args,
		service.RedInkPageStatusSucceeded,
		service.RedInkPageStatusFailed,
		params.Limit(),
		params.Offset(),
	)

	rows, err := r.sql.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	records := make([]service.RedInkRecordSummary, 0, params.Limit())
	for rows.Next() {
		var record service.RedInkRecord
		var contentValue []byte
		var imagesValue []byte
		var thumbnail sql.NullString
		var totalPages int
		var completedPages int
		var failedPages int

		if err := rows.Scan(
			&record.ID,
			&record.UserID,
			&record.Topic,
			&record.OutlineRaw,
			&contentValue,
			&imagesValue,
			&record.TextModelID,
			&record.ImageModelID,
			&record.Resolution,
			&record.AspectRatio,
			&record.Status,
			&thumbnail,
			&record.CreatedAt,
			&record.UpdatedAt,
			&totalPages,
			&completedPages,
			&failedPages,
		); err != nil {
			return nil, nil, err
		}

		record.ThumbnailURL = nullStringPtr(thumbnail)
		record.Content = decodeRedInkContent(contentValue)
		record.InputImages = decodeStringList(imagesValue)

		records = append(records, service.RedInkRecordSummary{
			Record:         record,
			TotalPages:     totalPages,
			CompletedPages: completedPages,
			FailedPages:    failedPages,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	return records, paginationResultFromTotal(total, params), nil
}

func (r *redinkRepository) GetByUser(ctx context.Context, userID int64, recordID int64) (*service.RedInkRecord, []service.RedInkPage, error) {
	const recordQuery = `
		SELECT
			id,
			user_id,
			topic,
			outline_raw,
			content_json,
			input_images,
			text_model_id,
			image_model_id,
			resolution,
			aspect_ratio,
			status,
			thumbnail_url,
			created_at,
			updated_at
		FROM redink_records
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`

	var record service.RedInkRecord
	var contentValue []byte
	var imagesValue []byte
	var thumbnail sql.NullString

	if err := scanSingleRow(ctx, r.sql, recordQuery, []any{recordID, userID},
		&record.ID,
		&record.UserID,
		&record.Topic,
		&record.OutlineRaw,
		&contentValue,
		&imagesValue,
		&record.TextModelID,
		&record.ImageModelID,
		&record.Resolution,
		&record.AspectRatio,
		&record.Status,
		&thumbnail,
		&record.CreatedAt,
		&record.UpdatedAt,
	); err != nil {
		return nil, nil, err
	}

	record.ThumbnailURL = nullStringPtr(thumbnail)
	record.Content = decodeRedInkContent(contentValue)
	record.InputImages = decodeStringList(imagesValue)

	const pagesQuery = `
		SELECT
			id,
			record_id,
			page_index,
			page_type,
			page_content,
			prompt_text,
			image_url,
			status,
			attempts,
			error_message,
			last_error,
			next_attempt_at,
			created_at,
			updated_at,
			completed_at
		FROM redink_pages
		WHERE record_id = $1 AND deleted_at IS NULL
		ORDER BY page_index ASC
	`

	rows, err := r.sql.QueryContext(ctx, pagesQuery, record.ID)
	if err != nil {
		return &record, nil, err
	}
	defer rows.Close()

	pages := make([]service.RedInkPage, 0)
	for rows.Next() {
		var page service.RedInkPage
		var prompt sql.NullString
		var image sql.NullString
		var errorMessage sql.NullString
		var lastError sql.NullString
		var nextAttempt sql.NullTime
		var completedAt sql.NullTime

		if err := rows.Scan(
			&page.ID,
			&page.RecordID,
			&page.PageIndex,
			&page.PageType,
			&page.PageContent,
			&prompt,
			&image,
			&page.Status,
			&page.Attempts,
			&errorMessage,
			&lastError,
			&nextAttempt,
			&page.CreatedAt,
			&page.UpdatedAt,
			&completedAt,
		); err != nil {
			return &record, nil, err
		}

		page.PromptText = nullStringPtr(prompt)
		page.ImageURL = nullStringPtr(image)
		page.ErrorMessage = nullStringPtr(errorMessage)
		page.LastError = nullStringPtr(lastError)
		page.NextAttemptAt = nullTimePtr(nextAttempt)
		page.CompletedAt = nullTimePtr(completedAt)
		pages = append(pages, page)
	}
	if err := rows.Err(); err != nil {
		return &record, nil, err
	}

	return &record, pages, nil
}

func (r *redinkRepository) MarkDeleted(ctx context.Context, userID int64, recordID int64) error {
	const updateQuery = `
		UPDATE redink_records
		SET deleted_at = NOW(),
			updated_at = NOW()
		WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
	`
	result, err := r.sql.ExecContext(ctx, updateQuery, userID, recordID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *redinkRepository) ClaimNextPendingPage(ctx context.Context, pendingStatus, runningStatus string) (*service.RedInkPageTask, error) {
	const claimQuery = `
		WITH next_page AS (
			SELECT p.id
			FROM redink_pages p
			JOIN redink_records r ON r.id = p.record_id
			WHERE p.status = $1
			  AND p.deleted_at IS NULL
			  AND r.deleted_at IS NULL
			  AND r.status = $2
			  AND (p.next_attempt_at IS NULL OR p.next_attempt_at <= NOW())
			  AND (
				p.page_type = $3
				OR r.thumbnail_url IS NOT NULL
			  )
			ORDER BY r.created_at ASC, p.page_index ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE redink_pages
		SET status = $4,
			attempts = attempts + 1,
			last_error = NULL,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE id IN (SELECT id FROM next_page)
		RETURNING
			id,
			record_id,
			page_index,
			page_type,
			page_content,
			prompt_text,
			image_url,
			status,
			attempts,
			error_message,
			last_error,
			next_attempt_at,
			created_at,
			updated_at,
			completed_at
	`

	var page service.RedInkPage
	var prompt sql.NullString
	var image sql.NullString
	var errorMessage sql.NullString
	var lastError sql.NullString
	var nextAttempt sql.NullTime
	var completedAt sql.NullTime

	err := scanSingleRow(ctx, r.sql, claimQuery, []any{
		pendingStatus,
		service.RedInkRecordStatusGenerating,
		service.RedInkPageTypeCover,
		runningStatus,
	},
		&page.ID,
		&page.RecordID,
		&page.PageIndex,
		&page.PageType,
		&page.PageContent,
		&prompt,
		&image,
		&page.Status,
		&page.Attempts,
		&errorMessage,
		&lastError,
		&nextAttempt,
		&page.CreatedAt,
		&page.UpdatedAt,
		&completedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	page.PromptText = nullStringPtr(prompt)
	page.ImageURL = nullStringPtr(image)
	page.ErrorMessage = nullStringPtr(errorMessage)
	page.LastError = nullStringPtr(lastError)
	page.NextAttemptAt = nullTimePtr(nextAttempt)
	page.CompletedAt = nullTimePtr(completedAt)

	record, err := r.getRecordByID(ctx, page.RecordID)
	if err != nil {
		return nil, err
	}

	return &service.RedInkPageTask{
		Page:   page,
		Record: *record,
	}, nil
}

func (r *redinkRepository) UpdatePageResult(
	ctx context.Context,
	pageID int64,
	status string,
	imageURL *string,
	errorMessage *string,
	completedAt *time.Time,
) error {
	const updateQuery = `
		UPDATE redink_pages
		SET status = $1,
			image_url = $2,
			error_message = $3,
			completed_at = $4,
			last_error = NULL,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE id = $5
	`
	_, err := r.sql.ExecContext(ctx, updateQuery, status, imageURL, errorMessage, completedAt, pageID)
	return err
}

func (r *redinkRepository) UpdatePagePrompt(ctx context.Context, pageID int64, promptText string) error {
	const updateQuery = `
		UPDATE redink_pages
		SET prompt_text = $1,
			updated_at = NOW()
		WHERE id = $2
	`
	_, err := r.sql.ExecContext(ctx, updateQuery, strings.TrimSpace(promptText), pageID)
	return err
}

func (r *redinkRepository) UpdatePageRetry(
	ctx context.Context,
	pageID int64,
	status string,
	nextAttemptAt time.Time,
	lastError *string,
) error {
	const updateQuery = `
		UPDATE redink_pages
		SET status = $1,
			last_error = $2,
			next_attempt_at = $3,
			error_message = NULL,
			updated_at = NOW()
		WHERE id = $4
	`
	_, err := r.sql.ExecContext(ctx, updateQuery, status, lastError, nextAttemptAt, pageID)
	return err
}

func (r *redinkRepository) ResetStaleRunning(ctx context.Context, runningStatus, pendingStatus string, cutoff time.Time) error {
	const updateQuery = `
		UPDATE redink_pages
		SET status = $1,
			error_message = NULL,
			last_error = NULL,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE status = $2
		  AND updated_at < $3
		  AND deleted_at IS NULL
	`
	_, err := r.sql.ExecContext(ctx, updateQuery, pendingStatus, runningStatus, cutoff)
	return err
}

func (r *redinkRepository) GetPageStatusCounts(ctx context.Context, recordID int64) (service.RedInkPageStatusCounts, error) {
	const query = `
		SELECT status, COUNT(*)
		FROM redink_pages
		WHERE record_id = $1 AND deleted_at IS NULL
		GROUP BY status
	`

	rows, err := r.sql.QueryContext(ctx, query, recordID)
	if err != nil {
		return service.RedInkPageStatusCounts{}, err
	}
	defer rows.Close()

	counts := service.RedInkPageStatusCounts{}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return counts, err
		}
		switch status {
		case service.RedInkPageStatusPending:
			counts.Pending = count
		case service.RedInkPageStatusRunning:
			counts.Running = count
		case service.RedInkPageStatusSucceeded:
			counts.Succeeded = count
		case service.RedInkPageStatusFailed:
			counts.Failed = count
		}
		counts.Total += count
	}
	if err := rows.Err(); err != nil {
		return counts, err
	}
	return counts, nil
}

func (r *redinkRepository) getRecordByID(ctx context.Context, recordID int64) (*service.RedInkRecord, error) {
	const query = `
		SELECT
			id,
			user_id,
			topic,
			outline_raw,
			content_json,
			input_images,
			text_model_id,
			image_model_id,
			resolution,
			aspect_ratio,
			status,
			thumbnail_url,
			created_at,
			updated_at
		FROM redink_records
		WHERE id = $1 AND deleted_at IS NULL
	`

	var record service.RedInkRecord
	var contentValue []byte
	var imagesValue []byte
	var thumbnail sql.NullString

	if err := scanSingleRow(ctx, r.sql, query, []any{recordID},
		&record.ID,
		&record.UserID,
		&record.Topic,
		&record.OutlineRaw,
		&contentValue,
		&imagesValue,
		&record.TextModelID,
		&record.ImageModelID,
		&record.Resolution,
		&record.AspectRatio,
		&record.Status,
		&thumbnail,
		&record.CreatedAt,
		&record.UpdatedAt,
	); err != nil {
		return nil, err
	}

	record.ThumbnailURL = nullStringPtr(thumbnail)
	record.Content = decodeRedInkContent(contentValue)
	record.InputImages = decodeStringList(imagesValue)

	return &record, nil
}

func encodeRedInkContent(content *service.RedInkContentResult) (any, error) {
	if content == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(content)
	if err != nil {
		return nil, err
	}
	return string(encoded), nil
}

func decodeRedInkContent(value []byte) *service.RedInkContentResult {
	if len(value) == 0 {
		return nil
	}
	var content service.RedInkContentResult
	if err := json.Unmarshal(value, &content); err != nil {
		return nil
	}
	return &content
}

func encodeStringList(values []string) (any, error) {
	if len(values) == 0 {
		return nil, nil
	}
	encoded, err := json.Marshal(values)
	if err != nil {
		return nil, err
	}
	return string(encoded), nil
}

func decodeStringList(value []byte) []string {
	if len(value) == 0 {
		return nil
	}
	var values []string
	if err := json.Unmarshal(value, &values); err != nil {
		return nil
	}
	return values
}
