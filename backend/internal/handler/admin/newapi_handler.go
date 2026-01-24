package admin

import (
	"net/http"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

type NewAPIHandler struct {
	settingService *service.SettingService
	httpClient     *http.Client
}

func NewNewAPIHandler(settingService *service.SettingService) *NewAPIHandler {
	return &NewAPIHandler{
		settingService: settingService,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

type NewAPISettingsResponse struct {
	BaseURL             string `json:"base_url"`
	AccessKeyConfigured bool   `json:"access_key_configured"`
	DefaultModel        string `json:"default_model"`
}

type UpdateNewAPISettingsRequest struct {
	BaseURL      *string `json:"base_url"`
	AccessKey    *string `json:"access_key"`
	DefaultModel *string `json:"default_model"`
}

// GetSettings 获取 NewAPI 设置
// GET /api/v1/admin/newapi/settings
func (h *NewAPIHandler) GetSettings(c *gin.Context) {
	settings, err := h.settingService.GetNewAPISettings(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, NewAPISettingsResponse{
		BaseURL:             settings.BaseURL,
		AccessKeyConfigured: settings.AccessKeyConfigured,
		DefaultModel:        settings.DefaultModel,
	})
}

// UpdateSettings 更新 NewAPI 设置
// PUT /api/v1/admin/newapi/settings
func (h *NewAPIHandler) UpdateSettings(c *gin.Context) {
	var req UpdateNewAPISettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	req.BaseURL = normalizeOptionalString(req.BaseURL)
	req.AccessKey = normalizeOptionalString(req.AccessKey)
	req.DefaultModel = normalizeOptionalString(req.DefaultModel)

	if req.BaseURL != nil && *req.BaseURL != "" {
		if err := config.ValidateAbsoluteHTTPURL(*req.BaseURL); err != nil {
			response.BadRequest(c, "NewAPI Base URL must be an absolute http(s) URL")
			return
		}
	}

	settings, err := h.settingService.UpdateNewAPISettings(c.Request.Context(), service.UpdateNewAPISettingsInput{
		BaseURL:      req.BaseURL,
		AccessKey:    req.AccessKey,
		DefaultModel: req.DefaultModel,
	})
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, NewAPISettingsResponse{
		BaseURL:             settings.BaseURL,
		AccessKeyConfigured: settings.AccessKeyConfigured,
		DefaultModel:        settings.DefaultModel,
	})
}

// ListModels 获取 NewAPI 可用模型列表
// GET /api/v1/admin/newapi/models
func (h *NewAPIHandler) ListModels(c *gin.Context) {
	settings, err := h.settingService.GetNewAPISettings(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	if strings.TrimSpace(settings.BaseURL) == "" {
		response.BadRequest(c, "NewAPI Base URL is required")
		return
	}
	if !settings.AccessKeyConfigured {
		response.BadRequest(c, "NewAPI access key is not configured")
		return
	}

	models, err := service.FetchNewAPIModels(c.Request.Context(), settings.BaseURL, settings.AccessKey, h.httpClient)
	if err != nil {
		response.Error(c, http.StatusBadGateway, err.Error())
		return
	}

	response.Success(c, models)
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	return &trimmed
}
