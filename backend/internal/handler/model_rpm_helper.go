package handler

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/CrazyCherrys/DreamStudio/internal/service"
	"github.com/gin-gonic/gin"
)

// ModelRPMError represents a model RPM wait error.
type ModelRPMError struct {
	IsTimeout bool
}

func (e *ModelRPMError) Error() string {
	if e.IsTimeout {
		return "timeout waiting for model RPM slot"
	}
	return "model RPM wait canceled"
}

// ModelRPMHelper provides waiting logic for model RPM limits.
type ModelRPMHelper struct {
	rpmService   *service.ModelRPMService
	pingFormat   SSEPingFormat
	pingInterval time.Duration
}

// NewModelRPMHelper creates a new ModelRPMHelper.
func NewModelRPMHelper(rpmService *service.ModelRPMService, pingFormat SSEPingFormat, pingInterval time.Duration) *ModelRPMHelper {
	if pingInterval <= 0 {
		pingInterval = defaultPingInterval
	}
	return &ModelRPMHelper{
		rpmService:   rpmService,
		pingFormat:   pingFormat,
		pingInterval: pingInterval,
	}
}

// WaitForModelRPM blocks until a RPM slot is available (or context is canceled).
func (h *ModelRPMHelper) WaitForModelRPM(c *gin.Context, userID int64, modelID string, isStream bool, streamStarted *bool) error {
	if h == nil || h.rpmService == nil {
		return nil
	}

	trimmedModel := strings.TrimSpace(modelID)
	if trimmedModel == "" {
		return nil
	}

	rpm, enabled, err := h.rpmService.ResolveLimit(c.Request.Context(), userID, trimmedModel)
	if err != nil {
		return err
	}
	if !enabled || rpm <= 0 {
		return nil
	}

	return h.waitForSlotWithPing(c, userID, trimmedModel, rpm, isStream, streamStarted)
}

func (h *ModelRPMHelper) waitForSlotWithPing(c *gin.Context, userID int64, modelID string, rpm int, isStream bool, streamStarted *bool) error {
	ctx := c.Request.Context()
	result, err := h.rpmService.Acquire(ctx, userID, modelID, rpm)
	if err != nil {
		return err
	}
	if result.Acquired {
		return nil
	}

	needPing := isStream && h.pingFormat != ""
	var flusher http.Flusher
	if needPing {
		var ok bool
		flusher, ok = c.Writer.(http.Flusher)
		if !ok {
			return fmt.Errorf("streaming not supported")
		}
	}

	var pingCh <-chan time.Time
	if needPing {
		pingTicker := time.NewTicker(h.pingInterval)
		defer pingTicker.Stop()
		pingCh = pingTicker.C
	}

	backoff := initialBackoff
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	wait := nextRPMWait(result.RetryAfter, &backoff, rng)
	timer := time.NewTimer(wait)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return &ModelRPMError{IsTimeout: ctx.Err() == context.DeadlineExceeded}

		case <-pingCh:
			started := false
			if streamStarted != nil {
				started = *streamStarted
			}
			if !started {
				c.Header("Content-Type", "text/event-stream")
				c.Header("Cache-Control", "no-cache")
				c.Header("Connection", "keep-alive")
				c.Header("X-Accel-Buffering", "no")
				if streamStarted != nil {
					*streamStarted = true
				}
			}
			if _, err := fmt.Fprint(c.Writer, string(h.pingFormat)); err != nil {
				return err
			}
			flusher.Flush()

		case <-timer.C:
			result, err = h.rpmService.Acquire(ctx, userID, modelID, rpm)
			if err != nil {
				return err
			}
			if result.Acquired {
				return nil
			}
			wait = nextRPMWait(result.RetryAfter, &backoff, rng)
			timer.Reset(wait)
		}
	}
}

func nextRPMWait(retryAfter time.Duration, backoff *time.Duration, rng *rand.Rand) time.Duration {
	if retryAfter > 0 {
		if backoff != nil {
			*backoff = initialBackoff
		}
		return jitterDuration(retryAfter, rng)
	}

	if backoff == nil {
		return initialBackoff
	}
	wait := *backoff
	*backoff = nextBackoff(*backoff, rng)
	return wait
}

func jitterDuration(base time.Duration, rng *rand.Rand) time.Duration {
	if base <= 0 || rng == nil {
		return base
	}
	jitter := 0.8 + rng.Float64()*0.4
	return time.Duration(float64(base) * jitter)
}
