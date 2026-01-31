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

type videoTaskRepository struct {
	sql sqlExecutor
}

func NewVideoTaskRepository(sqlDB *sql.DB) service.VideoTaskRepository {
	return &videoTaskRepository{sql: sqlDB}
}

func (r *videoTaskRepository) Create(ctx context.Context, task *service.VideoGenerationTask) error {
	if task == nil {
		return nil
	}

	const insertQuery = `
		INSERT INTO video_generation_tasks (
			user_id,
			model_id,
			prompt,
			image,
			duration,
			width,
			height,
			fps,
			seed,
			count,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`

	args := []any{
		task.UserID,
		task.ModelID,
		task.Prompt,
		task.Image,
		task.Duration,
		task.Width,
		task.Height,
		task.FPS,
		task.Seed,
		task.Count,
		task.Status,
	}

	if err := scanSingleRow(ctx, r.sql, insertQuery, args, &task.ID, &task.CreatedAt, &task.UpdatedAt); err != nil {
		return err
	}
	return nil
}

func (r *videoTaskRepository) ListByUser(
	ctx context.Context,
	userID int64,
	params pagination.PaginationParams,
	filters service.VideoTaskFilters,
) ([]service.VideoGenerationTask, *pagination.PaginationResult, error) {
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
		FROM video_generation_tasks
		%s
	`, whereClause)

	var total int64
	if err := scanSingleRow(ctx, r.sql, countQuery, args, &total); err != nil {
		return nil, nil, err
	}

	if total == 0 {
		return []service.VideoGenerationTask{}, paginationResultFromTotal(0, params), nil
	}

	listQuery := fmt.Sprintf(`
		SELECT
			id,
			user_id,
			model_id,
			prompt,
			image,
			duration,
			width,
			height,
			fps,
			seed,
			count,
			external_id,
			attempts,
			status,
			error_message,
			last_error,
			next_attempt_at,
			video_urls,
			created_at,
			updated_at,
			completed_at
		FROM video_generation_tasks
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIndex, argIndex+1)

	listArgs := append(args, params.Limit(), params.Offset())
	rows, err := r.sql.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return nil, nil, err
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil {
			err = closeErr
		}
	}()

	tasks := make([]service.VideoGenerationTask, 0, params.Limit())
	for rows.Next() {
		var task service.VideoGenerationTask
		var errorMessage sql.NullString
		var lastError sql.NullString
		var externalID sql.NullString
		var videoURLs []byte
		var completedAt sql.NullTime
		var nextAttemptAt sql.NullTime

		if err := rows.Scan(
			&task.ID,
			&task.UserID,
			&task.ModelID,
			&task.Prompt,
			&task.Image,
			&task.Duration,
			&task.Width,
			&task.Height,
			&task.FPS,
			&task.Seed,
			&task.Count,
			&externalID,
			&task.Attempts,
			&task.Status,
			&errorMessage,
			&lastError,
			&nextAttemptAt,
			&videoURLs,
			&task.CreatedAt,
			&task.UpdatedAt,
			&completedAt,
		); err != nil {
			return nil, nil, err
		}

		task.ErrorMessage = nullStringPtr(errorMessage)
		task.LastError = nullStringPtr(lastError)
		task.ExternalID = nullStringPtr(externalID)
		task.VideoURLs = decodeVideoURLs(videoURLs)
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

func (r *videoTaskRepository) GetByUser(ctx context.Context, userID, taskID int64) (*service.VideoGenerationTask, error) {
	const query = `
		SELECT
			id,
			user_id,
			model_id,
			prompt,
			image,
			duration,
			width,
			height,
			fps,
			seed,
			count,
			external_id,
			attempts,
			status,
			error_message,
			last_error,
			next_attempt_at,
			video_urls,
			created_at,
			updated_at,
			completed_at
		FROM video_generation_tasks
		WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
	`

	var task service.VideoGenerationTask
	var errorMessage sql.NullString
	var lastError sql.NullString
	var externalID sql.NullString
	var videoURLs []byte
	var completedAt sql.NullTime
	var nextAttemptAt sql.NullTime

	if err := scanSingleRow(ctx, r.sql, query, []any{userID, taskID},
		&task.ID,
		&task.UserID,
		&task.ModelID,
		&task.Prompt,
		&task.Image,
		&task.Duration,
		&task.Width,
		&task.Height,
		&task.FPS,
		&task.Seed,
		&task.Count,
		&externalID,
		&task.Attempts,
		&task.Status,
		&errorMessage,
		&lastError,
		&nextAttemptAt,
		&videoURLs,
		&task.CreatedAt,
		&task.UpdatedAt,
		&completedAt,
	); err != nil {
		return nil, err
	}

	task.ErrorMessage = nullStringPtr(errorMessage)
	task.LastError = nullStringPtr(lastError)
	task.ExternalID = nullStringPtr(externalID)
	task.VideoURLs = decodeVideoURLs(videoURLs)
	if completedAt.Valid {
		task.CompletedAt = &completedAt.Time
	}
	if nextAttemptAt.Valid {
		task.NextAttemptAt = &nextAttemptAt.Time
	}

	return &task, nil
}

func (r *videoTaskRepository) MarkDeleted(ctx context.Context, userID, taskID int64) error {
	const updateQuery = `
		UPDATE video_generation_tasks
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

func (r *videoTaskRepository) ClaimNextPending(ctx context.Context, pendingStatus, runningStatus string) (*service.VideoGenerationTask, error) {
	const claimQuery = `
		WITH next_task AS (
			SELECT id
			FROM video_generation_tasks
			WHERE status IN ($1, $2)
			  AND deleted_at IS NULL
			  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
			ORDER BY created_at ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE video_generation_tasks
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
			image,
			duration,
			width,
			height,
			fps,
			seed,
			count,
			external_id,
			attempts,
			status,
			error_message,
			video_urls,
			created_at,
			updated_at,
			completed_at
	`

	var task service.VideoGenerationTask
	var errorMessage sql.NullString
	var externalID sql.NullString
	var videoURLs []byte
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
		&task.Image,
		&task.Duration,
		&task.Width,
		&task.Height,
		&task.FPS,
		&task.Seed,
		&task.Count,
		&externalID,
		&task.Attempts,
		&task.Status,
		&errorMessage,
		&videoURLs,
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
	task.ExternalID = nullStringPtr(externalID)
	task.VideoURLs = decodeVideoURLs(videoURLs)
	if completedAt.Valid {
		task.CompletedAt = &completedAt.Time
	}

	return &task, nil
}

func (r *videoTaskRepository) UpdateRetry(ctx context.Context, taskID int64, status string, nextAttemptAt time.Time, lastError *string) error {
	const updateQuery = `
		UPDATE video_generation_tasks
		SET status = $2,
			next_attempt_at = $3,
			last_error = $4,
			error_message = NULL,
			updated_at = NOW()
		WHERE id = $1
	`

	_, err := r.sql.ExecContext(ctx, updateQuery, taskID, status, nextAttemptAt, lastError)
	return err
}

func (r *videoTaskRepository) UpdateSubmission(ctx context.Context, taskID int64, status string, externalID string, nextAttemptAt *time.Time) error {
	const updateQuery = `
		UPDATE video_generation_tasks
		SET status = $2,
			external_id = $3,
			next_attempt_at = $4,
			last_error = NULL,
			updated_at = NOW()
		WHERE id = $1
	`

	_, err := r.sql.ExecContext(ctx, updateQuery, taskID, status, externalID, nextAttemptAt)
	return err
}

func (r *videoTaskRepository) UpdateResult(ctx context.Context, taskID int64, status string, videoURLs []string, errorMessage *string, completedAt *time.Time) error {
	encoded, err := encodeVideoURLs(videoURLs)
	if err != nil {
		return err
	}

	const updateQuery = `
		UPDATE video_generation_tasks
		SET status = $2,
			video_urls = $3::jsonb,
			error_message = $4,
			completed_at = $5,
			last_error = NULL,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE id = $1
	`

	_, err = r.sql.ExecContext(ctx, updateQuery, taskID, status, encoded, errorMessage, completedAt)
	return err
}

func (r *videoTaskRepository) UpdateStatus(ctx context.Context, taskID int64, status string, errorMessage *string) error {
	const updateQuery = `
		UPDATE video_generation_tasks
		SET status = $2,
			error_message = $3,
			last_error = NULL,
			next_attempt_at = NULL,
			updated_at = NOW()
		WHERE id = $1
	`

	_, err := r.sql.ExecContext(ctx, updateQuery, taskID, status, errorMessage)
	return err
}

func (r *videoTaskRepository) ResetStaleRunning(ctx context.Context, runningStatus, pendingStatus string, cutoff time.Time) error {
	const updateQuery = `
		UPDATE video_generation_tasks
		SET status = $2,
			updated_at = NOW()
		WHERE status = $1
			AND deleted_at IS NULL
			AND updated_at < $3
	`

	_, err := r.sql.ExecContext(ctx, updateQuery, runningStatus, pendingStatus, cutoff)
	return err
}

func encodeVideoURLs(urls []string) (any, error) {
	if len(urls) == 0 {
		return nil, nil
	}
	encoded, err := json.Marshal(urls)
	if err != nil {
		return nil, err
	}
	return string(encoded), nil
}

func decodeVideoURLs(value []byte) []string {
	if len(value) == 0 {
		return nil
	}
	var urls []string
	if err := json.Unmarshal(value, &urls); err != nil {
		return nil
	}
	return urls
}
