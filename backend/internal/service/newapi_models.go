package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type NewAPIModel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func FetchNewAPIModels(ctx context.Context, baseURL, accessKey string, client *http.Client) ([]NewAPIModel, error) {
	trimmedBaseURL := strings.TrimSpace(baseURL)
	if trimmedBaseURL == "" {
		return nil, errors.New("newapi base url is empty")
	}

	authHeader := strings.TrimSpace(accessKey)
	if authHeader == "" {
		return nil, errors.New("newapi access key is empty")
	}

	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}

	modelsURL, err := buildNewAPIModelsURL(trimmedBaseURL)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, modelsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create newapi request: %w", err)
	}

	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		authHeader = "Bearer " + authHeader
	}

	req.Header.Set("Authorization", authHeader)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request newapi models: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read newapi response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("newapi models request failed: %s", formatNewAPIError(resp.StatusCode, body))
	}

	models, err := parseNewAPIModels(body)
	if err != nil {
		return nil, err
	}

	return models, nil
}

func buildNewAPIModelsURL(baseURL string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "" {
		return "", errors.New("newapi base url is empty")
	}
	if strings.HasSuffix(trimmed, "/v1") {
		return trimmed + "/models", nil
	}
	if strings.HasSuffix(trimmed, "/api") {
		return trimmed + "/models", nil
	}
	return trimmed + "/v1/models", nil
}

func formatNewAPIError(statusCode int, body []byte) string {
	if len(body) == 0 {
		return fmt.Sprintf("status %d", statusCode)
	}
	message := strings.TrimSpace(string(body))
	if len(message) > 240 {
		message = message[:240] + "..."
	}
	return fmt.Sprintf("status %d: %s", statusCode, message)
}

func parseNewAPIModels(body []byte) ([]NewAPIModel, error) {
	items, err := extractModelList(body)
	if err != nil {
		return nil, fmt.Errorf("parse newapi models: %w", err)
	}

	models := make([]NewAPIModel, 0, len(items))
	seen := make(map[string]struct{}, len(items))

	for _, item := range items {
		switch value := item.(type) {
		case string:
			id := strings.TrimSpace(value)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			models = append(models, NewAPIModel{ID: id, Name: id})
		case map[string]any:
			id := pickString(value, "id", "model", "name")
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			name := pickString(value, "display_name", "name")
			if name == "" {
				name = id
			}
			models = append(models, NewAPIModel{ID: id, Name: name})
		}
	}

	return models, nil
}

func extractModelList(body []byte) ([]any, error) {
	var list []any
	if err := json.Unmarshal(body, &list); err == nil {
		return list, nil
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	if data, ok := payload["data"]; ok {
		if list, ok := data.([]any); ok {
			return list, nil
		}
		if nested, ok := data.(map[string]any); ok {
			if list, ok := nested["data"].([]any); ok {
				return list, nil
			}
		}
	}

	if data, ok := payload["models"]; ok {
		if list, ok := data.([]any); ok {
			return list, nil
		}
	}

	return nil, errors.New("missing model list")
}

func pickString(input map[string]any, keys ...string) string {
	for _, key := range keys {
		if raw, ok := input[key]; ok {
			if value, ok := raw.(string); ok {
				value = strings.TrimSpace(value)
				if value != "" {
					return value
				}
			}
		}
	}
	return ""
}
