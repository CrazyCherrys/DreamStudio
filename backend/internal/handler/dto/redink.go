package dto

import (
	"time"

	"github.com/CrazyCherrys/DreamStudio/internal/service"
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

type RedInkPage struct {
	ID           int64      `json:"id"`
	PageIndex    int        `json:"page_index"`
	PageType     string     `json:"page_type"`
	PageContent  string     `json:"page_content"`
	PromptText   *string    `json:"prompt_text,omitempty"`
	ImageURL     *string    `json:"image_url,omitempty"`
	Status       string     `json:"status"`
	Attempts     int        `json:"attempts"`
	ErrorMessage *string    `json:"error_message,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

type RedInkRecord struct {
	ID             int64              `json:"id"`
	Topic          string             `json:"topic"`
	OutlineRaw     string             `json:"outline_raw"`
	Content        *RedInkContentResult `json:"content,omitempty"`
	InputImages    []string           `json:"input_images,omitempty"`
	TextModelID    string             `json:"text_model_id,omitempty"`
	ImageModelID   string             `json:"image_model_id,omitempty"`
	Resolution     string             `json:"resolution,omitempty"`
	AspectRatio    string             `json:"aspect_ratio,omitempty"`
	Status         string             `json:"status"`
	ThumbnailURL   *string            `json:"thumbnail_url,omitempty"`
	TotalPages     int                `json:"total_pages,omitempty"`
	CompletedPages int                `json:"completed_pages,omitempty"`
	FailedPages    int                `json:"failed_pages,omitempty"`
	CreatedAt      time.Time          `json:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at"`
}

type RedInkRecordDetail struct {
	RedInkRecord
	Pages []RedInkPage `json:"pages"`
}

func RedInkOutlinePageFromService(page service.RedInkOutlinePage) RedInkOutlinePage {
	return RedInkOutlinePage{
		Index:   page.Index,
		Type:    page.Type,
		Content: page.Content,
	}
}

func RedInkContentFromService(content *service.RedInkContentResult) *RedInkContentResult {
	if content == nil {
		return nil
	}
	return &RedInkContentResult{
		Titles:      content.Titles,
		Copywriting: content.Copywriting,
		Tags:        content.Tags,
	}
}

func RedInkPageFromService(page *service.RedInkPage) *RedInkPage {
	if page == nil {
		return nil
	}
	return &RedInkPage{
		ID:           page.ID,
		PageIndex:    page.PageIndex,
		PageType:     page.PageType,
		PageContent:  page.PageContent,
		PromptText:   page.PromptText,
		ImageURL:     page.ImageURL,
		Status:       page.Status,
		Attempts:     page.Attempts,
		ErrorMessage: page.ErrorMessage,
		CreatedAt:    page.CreatedAt,
		UpdatedAt:    page.UpdatedAt,
		CompletedAt:  page.CompletedAt,
	}
}

func RedInkRecordSummaryFromService(summary *service.RedInkRecordSummary) *RedInkRecord {
	if summary == nil {
		return nil
	}
	record := summary.Record
	return &RedInkRecord{
		ID:             record.ID,
		Topic:          record.Topic,
		OutlineRaw:     record.OutlineRaw,
		Content:        RedInkContentFromService(record.Content),
		InputImages:    record.InputImages,
		TextModelID:    record.TextModelID,
		ImageModelID:   record.ImageModelID,
		Resolution:     record.Resolution,
		AspectRatio:    record.AspectRatio,
		Status:         record.Status,
		ThumbnailURL:   record.ThumbnailURL,
		TotalPages:     summary.TotalPages,
		CompletedPages: summary.CompletedPages,
		FailedPages:    summary.FailedPages,
		CreatedAt:      record.CreatedAt,
		UpdatedAt:      record.UpdatedAt,
	}
}

func RedInkRecordDetailFromService(record *service.RedInkRecord, pages []service.RedInkPage) *RedInkRecordDetail {
	if record == nil {
		return nil
	}
	out := RedInkRecordDetail{
		RedInkRecord: RedInkRecord{
			ID:           record.ID,
			Topic:        record.Topic,
			OutlineRaw:   record.OutlineRaw,
			Content:      RedInkContentFromService(record.Content),
			InputImages:  record.InputImages,
			TextModelID:  record.TextModelID,
			ImageModelID: record.ImageModelID,
			Resolution:   record.Resolution,
			AspectRatio:  record.AspectRatio,
			Status:       record.Status,
			ThumbnailURL: record.ThumbnailURL,
			CreatedAt:    record.CreatedAt,
			UpdatedAt:    record.UpdatedAt,
		},
		Pages: make([]RedInkPage, 0, len(pages)),
	}

	for i := range pages {
		if mapped := RedInkPageFromService(&pages[i]); mapped != nil {
			out.Pages = append(out.Pages, *mapped)
		}
	}
	return &out
}
