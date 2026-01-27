package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

const (
	redinkTaskPollInterval       = 2 * time.Second
	redinkTaskWorkerCount        = 2
	redinkTaskTimeout            = 5 * time.Minute
	redinkTaskStaleAfter         = 10 * time.Minute
	redinkTaskStaleCheckInterval = 30 * time.Second
	redinkTaskMaxAttempts        = 3
)

type RedInkTaskService struct {
	repo           RedInkRepository
	imageService   *ImageGenerationService
	settingService *SettingService
	startOnce      sync.Once
	stopCh         chan struct{}
}

func NewRedInkTaskService(repo RedInkRepository, imageService *ImageGenerationService, settingService *SettingService) *RedInkTaskService {
	return &RedInkTaskService{
		repo:           repo,
		imageService:   imageService,
		settingService: settingService,
		stopCh:         make(chan struct{}),
	}
}

func ProvideRedInkWorker(taskService *RedInkTaskService) *RedInkTaskService {
	taskService.Start()
	return taskService
}

func (s *RedInkTaskService) Start() {
	s.startOnce.Do(func() {
		if err := s.repo.ResetStaleRunning(context.Background(), RedInkPageStatusRunning, RedInkPageStatusPending, time.Now()); err != nil {
			log.Printf("redink tasks: reset stale running failed: %v", err)
		}
		go s.staleResetLoop()

		workerCount := 1
		if s.settingService != nil {
			if settings, err := s.settingService.GetRedInkSettings(context.Background()); err != nil {
				log.Printf("redink tasks: load settings failed: %v", err)
			} else if settings.HighConcurrency {
				workerCount = redinkTaskWorkerCount
			}
		}

		for i := 0; i < workerCount; i++ {
			go s.workerLoop()
		}
	})
}

func (s *RedInkTaskService) Stop() {
	close(s.stopCh)
}

func (s *RedInkTaskService) staleResetLoop() {
	ticker := time.NewTicker(redinkTaskStaleCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			if err := s.repo.ResetStaleRunning(context.Background(), RedInkPageStatusRunning, RedInkPageStatusPending, time.Now().Add(-redinkTaskStaleAfter)); err != nil {
				log.Printf("redink tasks: reset stale running failed: %v", err)
			}
		}
	}
}

func (s *RedInkTaskService) workerLoop() {
	for {
		select {
		case <-s.stopCh:
			return
		default:
		}

		task, err := s.repo.ClaimNextPendingPage(context.Background(), RedInkPageStatusPending, RedInkPageStatusRunning)
		if err != nil {
			log.Printf("redink tasks: claim pending failed: %v", err)
			time.Sleep(redinkTaskPollInterval)
			continue
		}
		if task == nil {
			time.Sleep(redinkTaskPollInterval)
			continue
		}

		s.processTask(task)
	}
}

func (s *RedInkTaskService) processTask(task *RedInkPageTask) {
	if task == nil {
		return
	}

	page := task.Page
	record := task.Record

	defer func() {
		if r := recover(); r != nil {
			message := fmt.Sprintf("internal error: %v", r)
			if updateErr := s.repo.UpdatePageResult(context.Background(), page.ID, RedInkPageStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
				log.Printf("redink tasks: update panic status error: %v", updateErr)
			}
		}
	}()

	if page.Attempts > redinkTaskMaxAttempts {
		message := "retry limit reached"
		if updateErr := s.repo.UpdatePageResult(context.Background(), page.ID, RedInkPageStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
			log.Printf("redink tasks: update failed status error: %v", updateErr)
		}
		s.refreshRecordStatus(record.ID)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), redinkTaskTimeout)
	defer cancel()

	settings, err := s.settingService.GetRedInkSettings(ctx)
	if err != nil {
		s.handleTaskError(page, record, err)
		return
	}

	modelID := strings.TrimSpace(record.ImageModelID)
	if modelID == "" {
		modelID = settings.ImageModelID
	}
	if modelID == "" {
		s.handleTaskError(page, record, errors.New("image model is not configured"))
		return
	}

	resolution := strings.TrimSpace(record.Resolution)
	if resolution == "" {
		resolution = settings.Resolution
	}
	aspectRatio := strings.TrimSpace(record.AspectRatio)
	if aspectRatio == "" {
		aspectRatio = settings.AspectRatio
	}

	prompt := buildRedInkImagePrompt(settings, record, page)
	if prompt != "" {
		if err := s.repo.UpdatePagePrompt(ctx, page.ID, prompt); err != nil {
			log.Printf("redink tasks: update prompt failed: %v", err)
		}
	}

	reference := selectRedInkReferenceImage(record, page)
	result, err := s.imageService.Generate(ctx, ImageGenerationInput{
		UserID:         record.UserID,
		ModelID:        modelID,
		Prompt:         prompt,
		Resolution:     resolution,
		AspectRatio:    aspectRatio,
		ReferenceImage: reference,
		Count:          1,
	})
	if err != nil {
		s.handleTaskError(page, record, err)
		return
	}

	urls := extractImageURLs(result)
	if len(urls) == 0 {
		s.handleTaskError(page, record, errors.New("no image returned"))
		return
	}

	imageURL := strings.TrimSpace(urls[0])
	completedAt := time.Now()
	if updateErr := s.repo.UpdatePageResult(ctx, page.ID, RedInkPageStatusSucceeded, &imageURL, nil, &completedAt); updateErr != nil {
		log.Printf("redink tasks: update page success error: %v", updateErr)
		message := "failed to persist image result"
		_ = s.repo.UpdatePageResult(ctx, page.ID, RedInkPageStatusFailed, nil, &message, timePtr(time.Now()))
		s.refreshRecordStatus(record.ID)
		return
	}

	if page.PageType == RedInkPageTypeCover && imageURL != "" {
		if record.ThumbnailURL == nil || strings.TrimSpace(*record.ThumbnailURL) == "" {
			if err := s.repo.UpdateRecordThumbnail(ctx, record.ID, &imageURL); err != nil {
				log.Printf("redink tasks: update thumbnail error: %v", err)
			}
		}
	}

	s.refreshRecordStatus(record.ID)
}

func (s *RedInkTaskService) handleTaskError(page RedInkPage, record RedInkRecord, err error) {
	message := sanitizeTaskError(err)
	if isRetryableImageError(err) && page.Attempts < redinkTaskMaxAttempts {
		nextAttemptAt := time.Now().Add(pickImageTaskRetryDelay(page.Attempts))
		if updateErr := s.repo.UpdatePageRetry(context.Background(), page.ID, RedInkPageStatusPending, nextAttemptAt, &message); updateErr != nil {
			log.Printf("redink tasks: update retry status error: %v", updateErr)
		}
		return
	}
	if updateErr := s.repo.UpdatePageResult(context.Background(), page.ID, RedInkPageStatusFailed, nil, &message, timePtr(time.Now())); updateErr != nil {
		log.Printf("redink tasks: update failed status error: %v", updateErr)
	}
	s.refreshRecordStatus(record.ID)
}

func (s *RedInkTaskService) refreshRecordStatus(recordID int64) {
	counts, err := s.repo.GetPageStatusCounts(context.Background(), recordID)
	if err != nil {
		log.Printf("redink tasks: get page counts failed: %v", err)
		return
	}

	status := RedInkRecordStatusGenerating
	if counts.Total > 0 && counts.Succeeded == counts.Total {
		status = RedInkRecordStatusCompleted
	} else if counts.Pending == 0 && counts.Running == 0 {
		if counts.Failed > 0 && counts.Succeeded == 0 {
			status = RedInkRecordStatusError
		} else if counts.Failed > 0 {
			status = RedInkRecordStatusPartial
		}
	} else if counts.Failed > 0 {
		status = RedInkRecordStatusPartial
	}

	if err := s.repo.UpdateRecordStatus(context.Background(), recordID, status); err != nil {
		log.Printf("redink tasks: update record status error: %v", err)
	}
}

func buildRedInkImagePrompt(settings *RedInkSettings, record RedInkRecord, page RedInkPage) string {
	if settings == nil {
		return ""
	}
	prompt := settings.ImagePrompt
	if settings.UseShortPrompt && strings.TrimSpace(settings.ImagePromptShort) != "" {
		prompt = settings.ImagePromptShort
	}
	prompt = strings.ReplaceAll(prompt, "{page_content}", page.PageContent)
	prompt = strings.ReplaceAll(prompt, "{page_type}", page.PageType)
	prompt = strings.ReplaceAll(prompt, "{full_outline}", record.OutlineRaw)
	prompt = strings.ReplaceAll(prompt, "{user_topic}", record.Topic)
	return strings.TrimSpace(prompt)
}

func selectRedInkReferenceImage(record RedInkRecord, page RedInkPage) string {
	if page.PageType == RedInkPageTypeCover {
		if len(record.InputImages) > 0 {
			return record.InputImages[0]
		}
		return ""
	}
	if record.ThumbnailURL != nil {
		return strings.TrimSpace(*record.ThumbnailURL)
	}
	return ""
}
