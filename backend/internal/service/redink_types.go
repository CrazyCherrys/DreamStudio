package service

import (
	"context"
	"time"

	"github.com/CrazyCherrys/DreamStudio/internal/pkg/pagination"
)

const (
	RedInkRecordStatusDraft      = "draft"
	RedInkRecordStatusGenerating = "generating"
	RedInkRecordStatusPartial    = "partial"
	RedInkRecordStatusCompleted  = "completed"
	RedInkRecordStatusError      = "error"
)

const (
	RedInkPageStatusPending   = "pending"
	RedInkPageStatusRunning   = "running"
	RedInkPageStatusSucceeded = "succeeded"
	RedInkPageStatusFailed    = "failed"
)

const (
	RedInkPageTypeCover   = "cover"
	RedInkPageTypeContent = "content"
	RedInkPageTypeSummary = "summary"
)

type RedInkOutlinePage struct {
	Index   int    `json:"index"`
	Type    string `json:"type"`
	Content string `json:"content"`
}

type RedInkContentResult struct {
	Titles      []string `json:"titles"`
	Copywriting string   `json:"copywriting"`
	Tags        []string `json:"tags"`
}

type RedInkRecord struct {
	ID           int64
	UserID       int64
	Topic        string
	OutlineRaw   string
	Content      *RedInkContentResult
	InputImages  []string
	TextModelID  string
	ImageModelID string
	Resolution   string
	AspectRatio  string
	Status       string
	ThumbnailURL *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type RedInkPage struct {
	ID            int64
	RecordID      int64
	PageIndex     int
	PageType      string
	PageContent   string
	PromptText    *string
	ImageURL      *string
	Status        string
	Attempts      int
	ErrorMessage  *string
	LastError     *string
	NextAttemptAt *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
	CompletedAt   *time.Time
}

type RedInkPageTask struct {
	Page   RedInkPage
	Record RedInkRecord
}

type RedInkRecordSummary struct {
	Record         RedInkRecord
	TotalPages     int
	CompletedPages int
	FailedPages    int
}

type RedInkRecordFilters struct {
	Status    string
	StartTime *time.Time
	EndTime   *time.Time
}

type RedInkPageStatusCounts struct {
	Total     int
	Pending   int
	Running   int
	Succeeded int
	Failed    int
}

type RedInkRepository interface {
	CreateRecord(ctx context.Context, record *RedInkRecord, pages []RedInkPage) error
	UpdateRecord(ctx context.Context, record *RedInkRecord) error
	UpdateRecordStatus(ctx context.Context, recordID int64, status string) error
	UpdateRecordThumbnail(ctx context.Context, recordID int64, thumbnailURL *string) error
	UpdateRecordContent(ctx context.Context, recordID int64, content *RedInkContentResult) error
	ReplacePages(ctx context.Context, recordID int64, pages []RedInkPage) error
	ResetPages(ctx context.Context, recordID int64, pageIDs []int64) error
	ListByUser(ctx context.Context, userID int64, params pagination.PaginationParams, filters RedInkRecordFilters) ([]RedInkRecordSummary, *pagination.PaginationResult, error)
	GetByUser(ctx context.Context, userID int64, recordID int64) (*RedInkRecord, []RedInkPage, error)
	MarkDeleted(ctx context.Context, userID int64, recordID int64) error
	ClaimNextPendingPage(ctx context.Context, pendingStatus, runningStatus string) (*RedInkPageTask, error)
	UpdatePageResult(ctx context.Context, pageID int64, status string, imageURL *string, errorMessage *string, completedAt *time.Time) error
	UpdatePagePrompt(ctx context.Context, pageID int64, promptText string) error
	UpdatePageRetry(ctx context.Context, pageID int64, status string, nextAttemptAt time.Time, lastError *string) error
	ResetStaleRunning(ctx context.Context, runningStatus, pendingStatus string, cutoff time.Time) error
	GetPageStatusCounts(ctx context.Context, recordID int64) (RedInkPageStatusCounts, error)
}
