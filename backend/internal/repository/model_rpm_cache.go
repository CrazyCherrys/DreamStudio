package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/CrazyCherrys/DreamStudio/internal/service"
	"github.com/redis/go-redis/v9"
)

const (
	modelRPMKeyPrefix = "model:rpm:"
	modelRPMWindow    = time.Minute
)

var modelRPMAcquireScript = redis.NewScript(`
	local key = KEYS[1]
	local maxRPM = tonumber(ARGV[1])
	local windowMs = tonumber(ARGV[2])
	local requestID = ARGV[3]

	local timeResult = redis.call('TIME')
	local nowMs = tonumber(timeResult[1]) * 1000 + math.floor(tonumber(timeResult[2]) / 1000)
	local cutoff = nowMs - windowMs

	redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
	local count = redis.call('ZCARD', key)

	if count < maxRPM then
		redis.call('ZADD', key, nowMs, requestID)
		redis.call('PEXPIRE', key, windowMs)
		return {1, 0}
	end

	local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
	if oldest[2] then
		local oldestTs = tonumber(oldest[2])
		local waitMs = windowMs - (nowMs - oldestTs)
		if waitMs < 0 then
			waitMs = 0
		end
		return {0, waitMs}
	end

	return {0, windowMs}
`)

type modelRPMCache struct {
	rdb *redis.Client
}

// NewModelRPMCache creates a ModelRPMCache backed by Redis.
func NewModelRPMCache(rdb *redis.Client) service.ModelRPMCache {
	return &modelRPMCache{rdb: rdb}
}

func modelRPMKey(userID int64, modelID string) string {
	trimmed := strings.TrimSpace(modelID)
	return fmt.Sprintf("%s%d:%s", modelRPMKeyPrefix, userID, trimmed)
}

func (c *modelRPMCache) Acquire(ctx context.Context, userID int64, modelID string, rpm int, requestID string) (bool, time.Duration, error) {
	if rpm <= 0 {
		return true, 0, nil
	}
	key := modelRPMKey(userID, modelID)
	windowMs := int64(modelRPMWindow / time.Millisecond)
	result, err := modelRPMAcquireScript.Run(ctx, c.rdb, []string{key}, rpm, windowMs, requestID).Result()
	if err != nil {
		return false, 0, err
	}

	values, ok := result.([]any)
	if !ok || len(values) < 2 {
		return false, 0, fmt.Errorf("unexpected model RPM response: %v", result)
	}

	acquired, ok := toInt64(values[0])
	if !ok {
		return false, 0, fmt.Errorf("invalid model RPM acquire result: %v", values[0])
	}
	waitMs, ok := toInt64(values[1])
	if !ok {
		return false, 0, fmt.Errorf("invalid model RPM wait result: %v", values[1])
	}
	if waitMs < 0 {
		waitMs = 0
	}

	return acquired == 1, time.Duration(waitMs) * time.Millisecond, nil
}

func toInt64(value any) (int64, bool) {
	switch v := value.(type) {
	case int64:
		return v, true
	case int:
		return int64(v), true
	case string:
		parsed, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}
