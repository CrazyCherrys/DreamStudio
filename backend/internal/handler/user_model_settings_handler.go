package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/CrazyCherrys/DreamStudio/internal/pkg/response"
	"github.com/CrazyCherrys/DreamStudio/internal/server/middleware"
	"github.com/CrazyCherrys/DreamStudio/internal/service"
	"github.com/gin-gonic/gin"
)

type UserModelSettingsHandler struct {
	settingService *service.SettingService
	httpClient     *http.Client
}

func NewUserModelSettingsHandler(settingService *service.SettingService) *UserModelSettingsHandler {
	return &UserModelSettingsHandler{
		settingService: settingService,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

type UserModelSettingsResponse struct {
	Items []service.UserModelSetting `json:"items"`
}

type UpdateUserModelSettingsRequest struct {
	Items []service.UserModelSetting `json:"items"`
}

// GetModelSettings 获取用户模型设置
// GET /api/v1/user/model-settings
func (h *UserModelSettingsHandler) GetModelSettings(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	items, err := h.settingService.GetUserModelSettings(c.Request.Context(), subject.UserID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, UserModelSettingsResponse{Items: items})
}

// UpdateModelSettings 更新用户模型设置（仅管理员）
// PUT /api/v1/user/model-settings
func (h *UserModelSettingsHandler) UpdateModelSettings(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	// 检查管理员权限
	role, ok := middleware.GetUserRoleFromContext(c)
	if !ok || role != "admin" {
		response.Forbidden(c, "仅管理员可以修改模型配置")
		return
	}

	var req UpdateUserModelSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	items, err := h.settingService.UpdateUserModelSettings(c.Request.Context(), subject.UserID, req.Items)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, UserModelSettingsResponse{Items: items})
}

// ListNewAPIModels 获取 NewAPI 模型列表（仅管理员）
// GET /api/v1/user/newapi/models
func (h *UserModelSettingsHandler) ListNewAPIModels(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	// 检查管理员权限
	role, ok := middleware.GetUserRoleFromContext(c)
	if !ok || role != "admin" {
		response.Forbidden(c, "仅管理员可以查看 NewAPI 模型列表")
		return
	}

	settings, err := h.settingService.GetNewAPISettings(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	if strings.TrimSpace(settings.BaseURL) == "" {
		response.BadRequest(c, "NewAPI Base URL is required")
		return
	}

	accessKey, err := h.settingService.ResolveUserNewAPIAccessKey(c.Request.Context(), subject.UserID, settings)
	if err != nil {
		if errors.Is(err, service.ErrUserCustomAPIKeyMissing) {
			response.BadRequest(c, "请先配置自定义 API Key，或联系管理员配置系统密钥")
			return
		}
		response.ErrorFrom(c, err)
		return
	}

	models, err := service.FetchNewAPIModels(
		c.Request.Context(),
		settings.BaseURL,
		accessKey,
		h.httpClient,
	)
	if err != nil {
		response.Error(c, http.StatusBadGateway, fmt.Sprintf("无法从 NewAPI 服务加载模型列表: %v", err))
		return
	}

	response.Success(c, models)
}
