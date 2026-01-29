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

type imageTaskRepository struct {
	sql sqlExecutor
}

func NewImageTaskRepository(sqlDB *sql.DB) service.ImageTaskRepository {
	return &imageTaskRepository{sql: sqlDB}
}

func (r *imageTaskRepository) Create(ctx context.Context, task *service.ImageGenerationTask) error {
	if task == nil {
		return nil
	}

	const insertQuery = `
		INSERT INTO image_generation_tasks (
			user_id,
			model_id,
			prompt,
			resolution,
			aspect_ratio,
			reference_image,
			count,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`

	args := []any{
		task.UserID,
		task.ModelID,
		task.Prompt,
		task.Resolution,
		task.AspectRatio,
		task.ReferenceImage,
		task.Count,
		task.Status,
	}

	if err := scanSingleRow(ctx, r.sql, insertQuery, args, &task.ID, &task.CreatedAt, &task.UpdatedAt); err != nil {
		return err
	}
	return nil
}

func (r *imageTaskRepository) ListByUser(
	ctx context.Context,
	userID int64,
	params pagination.PaginationParams,
	filters service.ImageTaskFilters,
) ([]service.ImageGenerationTask, *pagination.PaginationResult, error) {
	clauses := []string{"user_id = $1", "deleted_at IS NULL"}
	args := []any{userID}
	argIndex := 2

	if filters.Status != "" {
		clauses = append(clauses, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, filters.Status)
		argIndex++
	}
	if filters.ModelID != "" {
		clauses = append(clauses, fmt.Sprintf("model_id = $%d", argIndex))
		args = append(args, filters.ModelID)
		argIndex++
	}
	if filters.StartTime != nil {
		clauses = append(clauses, fmt.Sprintf("created_at >= $%d", argIndex))
		args = append(args, *filters.StartTime)
		argIndex++
	}
	if filters.EndTime != nil {
		clauses = append(clauses, fmt.Sprintf("created_at <= $%d", argIndex))
		args = append(args, *filters.EndTime)
		argIndex++
	}

	whereClause := "WHERE " + strings.Join(clauses, " AND ")
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM image_generation_tasks
		%s
	`, whereClause)

	var total int64
	if err := scanSingleRow(ctx, r.sql, countQuery, args, &total); err != nil {
		return nil, nil, err
	}

	if total == 0 {
		return []service.ImageGenerationTask{}, paginationResultFromTotal(0, params), nil
	}

	listQuery := fmt.Sprintf(`
		SELECT
			id,
			user_id,
			model_id,
			prompt,
			resolution,
			aspect_ratio,
			reference_image,
			count,
			attempts,
			status,
			error_message,
			last_error,
			next_attempt_at,
			image_urls,
			created_at,
			updated_at,
			completed_at
		FROM image_generation_tasks
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIndex, argIndex+1)

	listArgs := append(args, params.Limit(), params.Offset())
	rows, err := r.sql.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	tasks := make([]service.ImageGenerationTask, 0, params.Limit())
	for rows.Next() {
		var task service.ImageGenerationTask
		var errorMessage sql.NullString
		var lastError sql.NullString
		var imageURLs []byte
		var completedAt sql.NullTime
		var nextAttemptAt sql.NullTime

		if err := rows.Scan(
			&task.ID,
			&task.UserID,
			&task.ModelID,
			&task.Prompt,
			&task.Resolution,
			&task.AspectRatio,
			&task.ReferenceImage,
			&task.Count,
			&task.Attempts,
			&task.Status,
			&errorMessage,
			&lastError,
			&nextAttemptAt,
			&imageURLs,
			&task.CreatedAt,
			&task.UpdatedAt,
			&completedAt,
		); err != nil {
			return nil, nil, err
		}

		task.ErrorMessage = nullStringPtr(errorMessage)
		task.LastError = nullStringPtr(lastError)
		task.ImageURLs = decodeImageURLs(imageURLs)
		if completedAt.Valid {
			task.CompletedAt = &completedAt.Time
		}
		if nextAttemptAt.Valid {
			task.NextAttemptAt = &nextAttemptAt.Time
		}

		tasks = append(tasks, task)
	}

	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	return tasks, paginationResultFromTotal(total, params), nil
}

func (r *imageTaskRepository) GetByUser(ctx context.Context, userID, taskID int64) (*service.ImageGenerationTask, error) {
	const query = `
		SELECT
			id,
			user_id,
			model_id,
			prompt,
			resolution,
			aspect_ratio,
			reference_image,
			count,
			attempts,
			status,
			error_message,
			last_error,
			next_attempt_at,
			image_urls,
			created_at,
			updated_at,
			completed_at
		FROM image_generation_tasks
		WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
	`

	var task service.ImageGenerationTask
	var errorMessage sql.NullString
	var lastError sql.NullString
	var imageURLs []byte
	var completedAt sql.NullTime
	var nextAttemptAt sql.NullTime

	if err := scanSingleRow(ctx, r.sql, query, []any{userID, taskID},
		&task.ID,
		&task.UserID,
		&task.ModelID,
		&task.Prompt,
		&task.Resolution,
		&task.AspectRatio,
		&task.ReferenceImage,
		&task.Count,
		&task.Attempts,
		&task.Status,
		&errorMessage,
		&lastError,
		&nextAttemptAt,
		&imageURLs,
		&task.CreatedAt,
		&task.UpdatedAt,
		&completedAt,
	); err != nil {
		return nil, err
	}

	task.ErrorMessage = nullStringPtr(errorMessage)
	task.LastError = nullStringPtr(lastError)
	task.ImageURLs = decodeImageURLs(imageURLs)
	if completedAt.Valid {
		task.CompletedAt = &completedAt.Time
	}
	if nextAttemptAt.Valid {
		task.NextAttemptAt = &nextAttemptAt.Time
	}

	return &task, nil
}

func (r *imageTaskRepository) MarkDeleted(ctx context.Context, userID, taskID int64) error {
	const updateQuery = `
		UPDATE image_generation_tasks
		SET deleted_at = NOW(),
			updated_at = NOW()
		WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
	`

	result, err := r.sql.ExecContext(ctx, updateQuery, userID, taskID)
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

func (r *imageTaskRepository) ClaimNextPending(ctx context.Context, pendingStatus, runningStatus string) (*service.ImageGenerationTask, error) {
	const claimQuery = `
		WITH next_task AS (
			SELECT id
			FROM image_generation_tasks
			WHERE status = $1
			  AND deleted_at IS NULL
			  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
			ORDER BY created_at ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE image_generation_tasks
		SET status = $2,
			attempts = attempts + 1,
			last_error = NULL,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE id IN (SELECT id FROM next_task)
		RETURNING
			id,
			user_id,
			model_id,
			prompt,
			resolution,
			aspect_ratio,
			reference_image,
			count,
			attempts,
			status,
			error_message,
			image_urls,
			created_at,
			updated_at,
			completed_at
	`

	var task service.ImageGenerationTask
	var errorMessage sql.NullString
	var imageURLs []byte
	var completedAt sql.NullTime

	err := scanSingleRow(
		ctx,
		r.sql,
		claimQuery,
		[]any{pendingStatus, runningStatus},
		&task.ID,
		&task.UserID,
		&task.ModelID,
		&task.Prompt,
		&task.Resolution,
		&task.AspectRatio,
		&task.ReferenceImage,
		&task.Count,
		&task.Attempts,
		&task.Status,
		&errorMessage,
		&imageURLs,
		&task.CreatedAt,
		&task.UpdatedAt,
		&completedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	task.ErrorMessage = nullStringPtr(errorMessage)
	task.ImageURLs = decodeImageURLs(imageURLs)
	if completedAt.Valid {
		task.CompletedAt = &completedAt.Time
	}

	return &task, nil
}

func (r *imageTaskRepository) UpdateResult(
	ctx context.Context,
	taskID int64,
	status string,
	imageURLs []string,
	errorMessage *string,
	completedAt *time.Time,
) error {
	encoded, err := encodeImageURLs(imageURLs)
	if err != nil {
		return err
	}

	const updateQuery = `
		UPDATE image_generation_tasks
		SET status = $1,
			image_urls = $2::jsonb,
			error_message = $3,
			completed_at = $4,
			last_error = NULL,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE id = $5
	`

	_, err = r.sql.ExecContext(ctx, updateQuery, status, encoded, errorMessage, completedAt, taskID)
	return err
}

func (r *imageTaskRepository) UpdateStatus(ctx context.Context, taskID int64, status string, errorMessage *string) error {
	const updateQuery = `
		UPDATE image_generation_tasks
		SET status = $1,
			error_message = $2,
			last_error = NULL,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE id = $3
	`

	_, err := r.sql.ExecContext(ctx, updateQuery, status, errorMessage, taskID)
	return err
}

func (r *imageTaskRepository) UpdateRetry(
	ctx context.Context,
	taskID int64,
	status string,
	nextAttemptAt time.Time,
	lastError *string,
) error {
	const updateQuery = `
		UPDATE image_generation_tasks
		SET status = $1,
			last_error = $2,
			next_attempt_at = $3,
			error_message = NULL,
			updated_at = NOW()
		WHERE id = $4
	`

	_, err := r.sql.ExecContext(ctx, updateQuery, status, lastError, nextAttemptAt, taskID)
	return err
}

func (r *imageTaskRepository) ResetStaleRunning(
	ctx context.Context,
	runningStatus string,
	pendingStatus string,
	cutoff time.Time,
) error {
	const updateQuery = `
		UPDATE image_generation_tasks
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

func encodeImageURLs(urls []string) (any, error) {
	if len(urls) == 0 {
		return nil, nil
	}
	encoded, err := json.Marshal(urls)
	if err != nil {
		return nil, err
	}
	return string(encoded), nil
}

func decodeImageURLs(value []byte) []string {
	if len(value) == 0 {
		return nil
	}
	var urls []string
	if err := json.Unmarshal(value, &urls); err != nil {
		return nil
	}
	return urls
}
