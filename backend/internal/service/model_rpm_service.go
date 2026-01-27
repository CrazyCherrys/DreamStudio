package service

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"
)

// ModelRPMCache tracks per-model request counts in a rolling window.
type ModelRPMCache interface {
	Acquire(ctx context.Context, userID int64, modelID string, rpm int, requestID string) (bool, time.Duration, error)
}

// ModelRPMAcquireResult represents the result of acquiring a RPM slot.
type ModelRPMAcquireResult struct {
	Acquired   bool
	RetryAfter time.Duration
}

// ModelRPMService enforces per-model RPM limits for users.
type ModelRPMService struct {
	cache          ModelRPMCache
	settingService *SettingService
}

// NewModelRPMService creates a new ModelRPMService.
func NewModelRPMService(cache ModelRPMCache, settingService *SettingService) *ModelRPMService {
	return &ModelRPMService{
		cache:          cache,
		settingService: settingService,
	}
}

// ResolveLimit returns the RPM limit for a user/model pair.
func (s *ModelRPMService) ResolveLimit(ctx context.Context, userID int64, modelID string) (rpm int, enabled bool, err error) {
	if userID <= 0 {
		return 0, false, fmt.Errorf("invalid user id")
	}

	trimmedModel := strings.TrimSpace(modelID)
	if trimmedModel == "" {
		return 0, false, nil
	}

	if s.settingService == nil {
		return 0, false, nil
	}

	items, err := s.settingService.GetUserModelSettings(ctx, userID)
	if err != nil {
		return 0, false, err
	}

	for _, item := range items {
		if item.ModelID != trimmedModel {
			continue
		}
		rpm = normalizeRPM(item.RPM)
		enabled = normalizeRPMEnabled(item.RPMEnabled, rpm)
		return rpm, enabled, nil
	}

	return 0, false, nil
}

// Acquire attempts to consume a RPM slot.
func (s *ModelRPMService) Acquire(ctx context.Context, userID int64, modelID string, rpm int) (*ModelRPMAcquireResult, error) {
	if rpm <= 0 || s.cache == nil {
		return &ModelRPMAcquireResult{Acquired: true}, nil
	}

	requestID := generateRequestID()
	acquired, retryAfter, err := s.cache.Acquire(ctx, userID, modelID, rpm, requestID)
	if err != nil {
		log.Printf("Warning: model RPM cache acquire failed for user %d model %s: %v", userID, modelID, err)
		return &ModelRPMAcquireResult{Acquired: true}, nil
	}

	return &ModelRPMAcquireResult{
		Acquired:   acquired,
		RetryAfter: retryAfter,
	}, nil
}
