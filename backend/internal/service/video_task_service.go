package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
	"github.com/Wei-Shaw/sub2api/internal/pkg/pagination"
)

const (
	VideoTaskStatusPending   = "pending"
	VideoTaskStatusRunning   = "running"
	VideoTaskStatusSucceeded = "succeeded"
	VideoTaskStatusFailed    = "failed"
)

const (
	videoTaskPollInterval        = 3 * time.Second
	videoTaskWorkerCount         = 1
	videoTaskTimeout             = 2 * time.Minute
	videoTaskStaleAfter           = 30 * time.Minute
	videoTaskStaleCheckInterval   = 1 * time.Minute
	videoTaskMaxAttempts          = 120
	videoTaskPollDelay            = 12 * time.Second
)

var ErrVideoTaskNotFound = infraerrors.NotFound("VIDEO_TASK_NOT_FOUND", "video task not found")

type VideoGenerationTask struct {
	ID            int64
	UserID        int64
	ModelID       string
	Prompt        string
	Image         string
	Duration      int
	Width         int
	Height        int
	FPS           int
	Seed          int
	Count         int
	ExternalID    *string
	Attempts      int
	Status        string
	ErrorMessage  *string
	LastError     *string
	NextAttemptAt *time.Time
	VideoURLs     []string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	CompletedAt   *time.Time
}

type VideoTaskFilters struct {
	Status    string
	ModelID   string
	StartTime *time.Time
	EndTime   *time.Time
}

type VideoTaskRepository interface {
	Create(ctx context.Context, task *VideoGenerationTask) error
	ListByUser(ctx context.Context, userID int64, params pagination.PaginationParams, filters VideoTaskFilters) ([]VideoGenerationTask, *pagination.PaginationResult, error)
	GetByUser(ctx context.Context, userID, taskID int64) (*VideoGenerationTask, error)
	MarkDeleted(ctx context.Context, userID, taskID int64) error
	ClaimNextPending(ctx context.Context, pendingStatus, runningStatus string) (*VideoGenerationTask, error)
	UpdateRetry(ctx context.Context, taskID int64, status string, nextAttemptAt time.Time, lastError *string) error
	UpdateSubmission(ctx context.Context, taskID int64, status string, externalID string, nextAttemptAt *time.Time) error
	UpdateResult(ctx context.Context, taskID int64, status string, videoURLs []string, errorMessage *string, completedAt *time.Time) error
	UpdateStatus(ctx context.Context, taskID int64, status string, errorMessage *string) error
	ResetStaleRunning(ctx context.Context, runningStatus, pendingStatus string, cutoff time.Time) error
}

type VideoTaskService struct {
	repo         VideoTaskRepository
	videoService *VideoGenerationService
	startOnce    sync.Once
	stopCh       chan struct{}
}

var videoTaskRetryBackoff = []time.Duration{
	20 * time.Second,
	45 * time.Second,
	2 * time.Minute,
}

func NewVideoTaskService(repo VideoTaskRepository, videoService *VideoGenerationService) *VideoTaskService {
	return &VideoTaskService{
		repo:         repo,
		videoService: videoService,
		stopCh:       make(chan struct{}),
	}
}

func ProvideVideoTaskWorker(taskService *VideoTaskService) *VideoTaskService {
	taskService.Start()
	return taskService
}

func (s *VideoTaskService) Start() {
	s.startOnce.Do(func() {
		if err := s.repo.ResetStaleRunning(context.Background(), VideoTaskStatusRunning, VideoTaskStatusPending, time.Now()); err != nil {
			log.Printf("video tasks: reset stale running failed: %v", err)
		}
		go s.staleResetLoop()
		for i := 0; i < videoTaskWorkerCount; i++ {
			go s.workerLoop()
		}
	})
}

func (s *VideoTaskService) Stop() {
	close(s.stopCh)
}

func (s *VideoTaskService) staleResetLoop() {
	ticker := time.NewTicker(videoTaskStaleCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			if err := s.repo.ResetStaleRunning(context.Background(), VideoTaskStatusRunning, VideoTaskStatusPending, time.Now().Add(-videoTaskStaleAfter)); err != nil {
				log.Printf("video tasks: reset stale running failed: %v", err)
			}
		}
	}
}

func (s *VideoTaskService) CreateTask(ctx context.Context, input VideoGenerationInput) (*VideoGenerationTask, error) {
	if input.UserID <= 0 {
		return nil, ErrVideoGenerationInvalid
	}
	modelID := strings.TrimSpace(input.ModelID)
	prompt := strings.TrimSpace(input.Prompt)
	image := strings.TrimSpace(input.Image)
	if modelID == "" || (prompt == "" && image == "") {
		return nil, ErrVideoGenerationInvalid
	}

	task := &VideoGenerationTask{
		UserID:   input.UserID,
		ModelID:  modelID,
		Prompt:   prompt,
		Image:    image,
		Duration: input.Duration,
		Width:    input.Width,
		Height:   input.Height,
		FPS:      input.FPS,
		Seed:     input.Seed,
		Count:    normalizeVideoTaskCount(input.Count),
		Status:   VideoTaskStatusPending,
	}

	if err := s.repo.Create(ctx, task); err != nil {
		return nil, fmt.Errorf("create video task: %w", err)
	}
	return task, nil
}

func (s *VideoTaskService) ListByUser(ctx context.Context, userID int64, params pagination.PaginationParams, filters VideoTaskFilters) ([]VideoGenerationTask, *pagination.PaginationResult, error) {
	if userID <= 0 {
		return nil, nil, ErrVideoGenerationInvalid
	}
	tasks, result, err := s.repo.ListByUser(ctx, userID, params, filters)
	if err != nil {
		return nil, nil, infraerrors.ServiceUnavailable("VIDEO_HISTORY_FAILED", "failed to load video history").WithCause(err)
	}
	return tasks, result, nil
}

func (s *VideoTaskService) GetByUser(ctx context.Context, userID, taskID int64) (*VideoGenerationTask, error) {
	if userID <= 0 || taskID <= 0 {
		return nil, ErrVideoGenerationInvalid
	}
	task, err := s.repo.GetByUser(ctx, userID, taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVideoTaskNotFound
		}
		return nil, infraerrors.ServiceUnavailable("VIDEO_TASK_FAILED", "failed to load video task").WithCause(err)
	}
	if task == nil {
		return nil, ErrVideoTaskNotFound
	}
	return task, nil
}

func (s *VideoTaskService) DeleteByUser(ctx context.Context, userID, taskID int64) (*VideoGenerationTask, error) {
	task, err := s.GetByUser(ctx, userID, taskID)
	if err != nil {
		return nil, err
	}
	if err := s.repo.MarkDeleted(ctx, userID, taskID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVideoTaskNotFound
		}
		return nil, infraerrors.ServiceUnavailable("VIDEO_TASK_DELETE_FAILED", "failed to delete video task").WithCause(err)
	}
	return task, nil
}

func (s *VideoTaskService) workerLoop() {
	for {
		select {
		case <-s.stopCh:
			return
		default:
		}

		task, err := s.repo.ClaimNextPending(context.Background(), VideoTaskStatusPending, VideoTaskStatusRunning)
		if err != nil {
			log.Printf("video tasks: claim pending failed: %v", err)
			time.Sleep(videoTaskPollInterval)
			continue
		}
		if task == nil {
			time.Sleep(videoTaskPollInterval)
			continue
		}

		s.processTask(task)
	}
}

func (s *VideoTaskService) processTask(task *VideoGenerationTask) {
	if task == nil {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			message := fmt.Sprintf("internal error: %v", r)
			if updateErr := s.repo.UpdateResult(context.Background(), task.ID, VideoTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
				log.Printf("video tasks: update panic status error: %v", updateErr)
			}
		}
	}()

	if task.Attempts > videoTaskMaxAttempts {
		message := "retry limit reached"
		if updateErr := s.repo.UpdateResult(context.Background(), task.ID, VideoTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
			log.Printf("video tasks: update failed status error: %v", updateErr)
		}
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), videoTaskTimeout)
	defer cancel()

	if task.ExternalID == nil || strings.TrimSpace(*task.ExternalID) == "" {
		s.submitTask(ctx, task)
		return
	}

	s.pollTask(ctx, task)
}

func (s *VideoTaskService) submitTask(ctx context.Context, task *VideoGenerationTask) {
	resp, err := s.videoService.Create(ctx, VideoGenerationInput{
		UserID:   task.UserID,
		ModelID:  task.ModelID,
		Prompt:   task.Prompt,
		Image:    task.Image,
		Duration: task.Duration,
		Width:    task.Width,
		Height:   task.Height,
		FPS:      task.FPS,
		Seed:     task.Seed,
		Count:    task.Count,
	})
	if err != nil {
		s.handleTaskError(task, err)
		return
	}

	videoID := strings.TrimSpace(resp.ID)
	if videoID == "" {
		message := "video task id missing"
		if updateErr := s.repo.UpdateResult(context.Background(), task.ID, VideoTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
			log.Printf("video tasks: update failed status error: %v", updateErr)
		}
		return
	}

	status := normalizeVideoStatus(resp.Status)
	if isVideoFailedStatus(status) {
		message := "video generation failed"
		if resp.Error != nil && strings.TrimSpace(resp.Error.Message) != "" {
			message = strings.TrimSpace(resp.Error.Message)
		}
		if updateErr := s.repo.UpdateResult(context.Background(), task.ID, VideoTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
			log.Printf("video tasks: update failed status error: %v", updateErr)
		}
		return
	}

	if isVideoSuccessStatus(status) {
		if updateErr := s.repo.UpdateSubmission(context.Background(), task.ID, VideoTaskStatusRunning, videoID, nil); updateErr != nil {
			log.Printf("video tasks: update submission status error: %v", updateErr)
		}
		s.completeTask(ctx, task, videoID)
		return
	}

	nextAttemptAt := time.Now().Add(videoTaskPollDelay)
	if updateErr := s.repo.UpdateSubmission(context.Background(), task.ID, VideoTaskStatusRunning, videoID, &nextAttemptAt); updateErr != nil {
		log.Printf("video tasks: update submission status error: %v", updateErr)
	}
}

func (s *VideoTaskService) pollTask(ctx context.Context, task *VideoGenerationTask) {
	videoID := strings.TrimSpace(*task.ExternalID)
	if videoID == "" {
		message := "video task id missing"
		if updateErr := s.repo.UpdateResult(context.Background(), task.ID, VideoTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
			log.Printf("video tasks: update failed status error: %v", updateErr)
		}
		return
	}

	resp, err := s.videoService.GetStatus(ctx, videoID)
	if err != nil {
		s.handleTaskError(task, err)
		return
	}

	status := normalizeVideoStatus(resp.Status)
	if isVideoSuccessStatus(status) {
		s.completeTask(ctx, task, videoID)
		return
	}
	if isVideoFailedStatus(status) {
		message := "video generation failed"
		if updateErr := s.repo.UpdateResult(context.Background(), task.ID, VideoTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
			log.Printf("video tasks: update failed status error: %v", updateErr)
		}
		return
	}

	nextAttemptAt := time.Now().Add(videoTaskPollDelay)
	if updateErr := s.repo.UpdateRetry(context.Background(), task.ID, VideoTaskStatusRunning, nextAttemptAt, nil); updateErr != nil {
		log.Printf("video tasks: update retry status error: %v", updateErr)
	}
}

func (s *VideoTaskService) completeTask(ctx context.Context, task *VideoGenerationTask, videoID string) {
	url, err := s.videoService.StoreContent(ctx, videoID)
	if err != nil {
		s.handleTaskError(task, err)
		return
	}

	completedAt := time.Now()
	if updateErr := s.repo.UpdateResult(context.Background(), task.ID, VideoTaskStatusSucceeded, []string{url}, nil, &completedAt); updateErr != nil {
		log.Printf("video tasks: update success status error: %v", updateErr)
		message := "failed to persist video result"
		if err := s.repo.UpdateStatus(context.Background(), task.ID, VideoTaskStatusFailed, &message); err != nil {
			log.Printf("video tasks: update failed fallback error: %v", err)
		}
	}
}

func (s *VideoTaskService) handleTaskError(task *VideoGenerationTask, err error) {
	message := sanitizeTaskError(err)
	if isRetryableImageError(err) && task.Attempts < videoTaskMaxAttempts {
		nextAttemptAt := time.Now().Add(pickVideoTaskRetryDelay(task.Attempts))
		if updateErr := s.repo.UpdateRetry(context.Background(), task.ID, VideoTaskStatusPending, nextAttemptAt, &message); updateErr != nil {
			log.Printf("video tasks: update retry status error: %v", updateErr)
		}
		return
	}
	if updateErr := s.repo.UpdateResult(context.Background(), task.ID, VideoTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
		log.Printf("video tasks: update failed status error: %v", updateErr)
	}
}

func normalizeVideoTaskCount(count int) int {
	if count <= 0 {
		return 1
	}
	if count > 4 {
		return 4
	}
	return count
}

func normalizeVideoStatus(status string) string {
	return strings.ToLower(strings.TrimSpace(status))
}

func isVideoSuccessStatus(status string) bool {
	switch normalizeVideoStatus(status) {
	case VideoTaskStatusSucceeded, "success", "completed", "done":
		return true
	default:
		return false
	}
}

func isVideoFailedStatus(status string) bool {
	switch normalizeVideoStatus(status) {
	case VideoTaskStatusFailed, "error", "canceled", "cancelled":
		return true
	default:
		return false
	}
}

func pickVideoTaskRetryDelay(attempt int) time.Duration {
	if attempt <= 0 {
		return videoTaskRetryBackoff[0]
	}
	idx := attempt - 1
	if idx >= len(videoTaskRetryBackoff) {
		idx = len(videoTaskRetryBackoff) - 1
	}
	return videoTaskRetryBackoff[idx]
}
