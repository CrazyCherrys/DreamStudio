package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	infraerrors "github.com/CrazyCherrys/DreamStudio/internal/pkg/errors"
	"github.com/CrazyCherrys/DreamStudio/internal/pkg/pagination"
)

const (
	ImageTaskStatusPending   = "pending"
	ImageTaskStatusRunning   = "running"
	ImageTaskStatusSucceeded = "succeeded"
	ImageTaskStatusFailed    = "failed"
)

const (
	imageTaskPollInterval = 2 * time.Second
	imageTaskWorkerCount  = 2
	imageTaskTimeout      = 5 * time.Minute
	imageTaskStaleAfter   = 10 * time.Minute
	imageTaskStaleCheckInterval = 30 * time.Second
	imageTaskMaxAttempts  = 3
)

var ErrImageTaskNotFound = infraerrors.NotFound("IMAGE_TASK_NOT_FOUND", "image task not found")

type ImageGenerationTask struct {
	ID             int64
	UserID         int64
	ModelID        string
	Prompt         string
	Resolution     string
	AspectRatio    string
	ReferenceImage string
	Count          int
	Attempts       int
	Status         string
	ErrorMessage   *string
	LastError      *string
	NextAttemptAt  *time.Time
	ImageURLs      []string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	CompletedAt    *time.Time
}

type ImageTaskFilters struct {
	Status    string
	ModelID   string
	StartTime *time.Time
	EndTime   *time.Time
}

type ImageTaskRepository interface {
	Create(ctx context.Context, task *ImageGenerationTask) error
	ListByUser(ctx context.Context, userID int64, params pagination.PaginationParams, filters ImageTaskFilters) ([]ImageGenerationTask, *pagination.PaginationResult, error)
	GetByUser(ctx context.Context, userID, taskID int64) (*ImageGenerationTask, error)
	MarkDeleted(ctx context.Context, userID, taskID int64) error
	ClaimNextPending(ctx context.Context, pendingStatus, runningStatus string) (*ImageGenerationTask, error)
	UpdateRetry(ctx context.Context, taskID int64, status string, nextAttemptAt time.Time, lastError *string) error
	UpdateResult(ctx context.Context, taskID int64, status string, imageURLs []string, errorMessage *string, completedAt *time.Time) error
	UpdateStatus(ctx context.Context, taskID int64, status string, errorMessage *string) error
	ResetStaleRunning(ctx context.Context, runningStatus, pendingStatus string, cutoff time.Time) error
}

type ImageTaskService struct {
	repo           ImageTaskRepository
	imageService   *ImageGenerationService
	settingService *SettingService
	startOnce      sync.Once
	stopCh         chan struct{}

	maxAttemptsMu sync.RWMutex
	maxAttempts   int
}

var imageTaskRetryBackoff = []time.Duration{
	10 * time.Second,
	30 * time.Second,
	2 * time.Minute,
}

func NewImageTaskService(repo ImageTaskRepository, imageService *ImageGenerationService, settingService *SettingService) *ImageTaskService {
	s := &ImageTaskService{
		repo:           repo,
		imageService:   imageService,
		settingService: settingService,
		stopCh:         make(chan struct{}),
		maxAttempts:    3,
	}
	s.loadMaxAttempts()
	return s
}

func ProvideImageTaskWorker(taskService *ImageTaskService) *ImageTaskService {
	taskService.Start()
	return taskService
}

func (s *ImageTaskService) Start() {
	s.startOnce.Do(func() {
		// Requeue any running tasks from a previous process on startup.
		if err := s.repo.ResetStaleRunning(context.Background(), ImageTaskStatusRunning, ImageTaskStatusPending, time.Now()); err != nil {
			log.Printf("image tasks: reset stale running failed: %v", err)
		}
		go s.staleResetLoop()
		go s.configRefreshLoop()
		for i := 0; i < imageTaskWorkerCount; i++ {
			go s.workerLoop()
		}
	})
}

func (s *ImageTaskService) Stop() {
	close(s.stopCh)
}

func (s *ImageTaskService) staleResetLoop() {
	ticker := time.NewTicker(imageTaskStaleCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			if err := s.repo.ResetStaleRunning(context.Background(), ImageTaskStatusRunning, ImageTaskStatusPending, time.Now().Add(-imageTaskStaleAfter)); err != nil {
				log.Printf("image tasks: reset stale running failed: %v", err)
			}
		}
	}
}

func (s *ImageTaskService) configRefreshLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.loadMaxAttempts()
		}
	}
}

func (s *ImageTaskService) loadMaxAttempts() {
	ctx := context.Background()
	value, err := s.settingService.GetValue(ctx, SettingKeyImageMaxRetryAttempts)
	if err != nil {
		return
	}
	if attempts, err := strconv.Atoi(value); err == nil && attempts >= 0 && attempts <= 10 {
		s.maxAttemptsMu.Lock()
		s.maxAttempts = attempts
		s.maxAttemptsMu.Unlock()
	}
}

func (s *ImageTaskService) getMaxAttempts() int {
	s.maxAttemptsMu.RLock()
	defer s.maxAttemptsMu.RUnlock()
	return s.maxAttempts
}

func (s *ImageTaskService) CreateTask(ctx context.Context, input ImageGenerationInput) (*ImageGenerationTask, error) {
	if input.UserID <= 0 {
		return nil, ErrImageGenerationInvalid
	}
	modelID := strings.TrimSpace(input.ModelID)
	prompt := strings.TrimSpace(input.Prompt)
	if modelID == "" || prompt == "" {
		return nil, ErrImageGenerationInvalid
	}

	task := &ImageGenerationTask{
		UserID:         input.UserID,
		ModelID:        modelID,
		Prompt:         prompt,
		Resolution:     strings.TrimSpace(input.Resolution),
		AspectRatio:    strings.TrimSpace(input.AspectRatio),
		ReferenceImage: strings.TrimSpace(input.ReferenceImage),
		Count:          normalizeTaskCount(input.Count),
		Status:         ImageTaskStatusPending,
	}

	if err := s.repo.Create(ctx, task); err != nil {
		return nil, fmt.Errorf("create image task: %w", err)
	}
	return task, nil
}

func (s *ImageTaskService) ListByUser(ctx context.Context, userID int64, params pagination.PaginationParams, filters ImageTaskFilters) ([]ImageGenerationTask, *pagination.PaginationResult, error) {
	if userID <= 0 {
		return nil, nil, ErrImageGenerationInvalid
	}
	tasks, result, err := s.repo.ListByUser(ctx, userID, params, filters)
	if err != nil {
		return nil, nil, infraerrors.ServiceUnavailable("IMAGE_HISTORY_FAILED", "failed to load image history").WithCause(err)
	}
	return tasks, result, nil
}

func (s *ImageTaskService) GetByUser(ctx context.Context, userID, taskID int64) (*ImageGenerationTask, error) {
	if userID <= 0 || taskID <= 0 {
		return nil, ErrImageGenerationInvalid
	}
	task, err := s.repo.GetByUser(ctx, userID, taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrImageTaskNotFound
		}
		return nil, infraerrors.ServiceUnavailable("IMAGE_TASK_FAILED", "failed to load image task").WithCause(err)
	}
	if task == nil {
		return nil, ErrImageTaskNotFound
	}
	return task, nil
}

func (s *ImageTaskService) DeleteByUser(ctx context.Context, userID, taskID int64) (*ImageGenerationTask, error) {
	task, err := s.GetByUser(ctx, userID, taskID)
	if err != nil {
		return nil, err
	}
	if err := s.repo.MarkDeleted(ctx, userID, taskID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrImageTaskNotFound
		}
		return nil, infraerrors.ServiceUnavailable("IMAGE_TASK_DELETE_FAILED", "failed to delete image task").WithCause(err)
	}
	return task, nil
}

func (s *ImageTaskService) workerLoop() {
	for {
		select {
		case <-s.stopCh:
			return
		default:
		}

		task, err := s.repo.ClaimNextPending(context.Background(), ImageTaskStatusPending, ImageTaskStatusRunning)
		if err != nil {
			log.Printf("image tasks: claim pending failed: %v", err)
			time.Sleep(imageTaskPollInterval)
			continue
		}
		if task == nil {
			time.Sleep(imageTaskPollInterval)
			continue
		}

		s.processTask(task)
	}
}

func (s *ImageTaskService) processTask(task *ImageGenerationTask) {
	if task == nil {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			message := fmt.Sprintf("internal error: %v", r)
			if updateErr := s.repo.UpdateResult(context.Background(), task.ID, ImageTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
				log.Printf("image tasks: update panic status error: %v", updateErr)
			}
		}
	}()

	maxAttempts := s.getMaxAttempts()
	if task.Attempts > maxAttempts {
		message := "retry limit reached"
		if updateErr := s.repo.UpdateResult(context.Background(), task.ID, ImageTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
			log.Printf("image tasks: update failed status error: %v", updateErr)
		}
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), imageTaskTimeout)
	defer cancel()

	result, err := s.imageService.Generate(ctx, ImageGenerationInput{
		UserID:         task.UserID,
		ModelID:        task.ModelID,
		Prompt:         task.Prompt,
		Resolution:     task.Resolution,
		AspectRatio:    task.AspectRatio,
		ReferenceImage: task.ReferenceImage,
		Count:          task.Count,
	})
	if err != nil {
		message := sanitizeTaskError(err)
		if isRetryableImageError(err) && task.Attempts < maxAttempts {
			nextAttemptAt := time.Now().Add(pickImageTaskRetryDelay(task.Attempts))
			if updateErr := s.repo.UpdateRetry(context.Background(), task.ID, ImageTaskStatusPending, nextAttemptAt, &message); updateErr != nil {
				log.Printf("image tasks: update retry status error: %v", updateErr)
			}
			return
		}
		if updateErr := s.repo.UpdateResult(context.Background(), task.ID, ImageTaskStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
			log.Printf("image tasks: update failed status error: %v", updateErr)
		}
		return
	}

	imageURLs := extractImageURLs(result)
	completedAt := time.Now()
	if updateErr := s.repo.UpdateResult(context.Background(), task.ID, ImageTaskStatusSucceeded, imageURLs, nil, &completedAt); updateErr != nil {
		log.Printf("image tasks: update success status error: %v", updateErr)
		message := "failed to persist image result"
		if err := s.repo.UpdateStatus(context.Background(), task.ID, ImageTaskStatusFailed, &message); err != nil {
			log.Printf("image tasks: update failed fallback error: %v", err)
		}
	}
}

func normalizeTaskCount(count int) int {
	if count <= 0 {
		return 1
	}
	if count > 4 {
		return 4
	}
	return count
}

func extractImageURLs(result *ImageGenerationResult) []string {
	if result == nil || len(result.Images) == 0 {
		return nil
	}
	urls := make([]string, 0, len(result.Images))
	for _, image := range result.Images {
		if image.URL != "" {
			urls = append(urls, image.URL)
			continue
		}
		if image.Base64 == "" {
			continue
		}
		mimeType := image.MimeType
		if mimeType == "" {
			mimeType = defaultImageMimeType
		}
		urls = append(urls, "data:"+mimeType+";base64,"+image.Base64)
	}
	return urls
}

func sanitizeTaskError(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.TrimSpace(err.Error())
	if len(msg) > 240 {
		return msg[:240] + "..."
	}
	return msg
}

func timePtr(t time.Time) *time.Time {
	return &t
}

func isRetryableImageError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		if netErr.Timeout() || netErr.Temporary() {
			return true
		}
	}
	if infraerrors.IsGatewayTimeout(err) {
		return true
	}
	return false
}

func pickImageTaskRetryDelay(attempt int) time.Duration {
	if attempt <= 0 {
		return imageTaskRetryBackoff[0]
	}
	idx := attempt - 1
	if idx >= len(imageTaskRetryBackoff) {
		idx = len(imageTaskRetryBackoff) - 1
	}
	return imageTaskRetryBackoff[idx]
}
