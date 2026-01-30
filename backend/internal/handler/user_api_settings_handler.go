package handler

import (
	"strings"

	"github.com/CrazyCherrys/DreamStudio/internal/pkg/response"
	"github.com/CrazyCherrys/DreamStudio/internal/server/middleware"
	"github.com/CrazyCherrys/DreamStudio/internal/service"
	"github.com/gin-gonic/gin"
)

type UserAPISettingsHandler struct {
	settingService *service.SettingService
}

func NewUserAPISettingsHandler(settingService *service.SettingService) *UserAPISettingsHandler {
	return &UserAPISettingsHandler{
		settingService: settingService,
	}
}

type UserAPISettingsResponse struct {
	CustomKeyConfigured bool `json:"custom_key_configured"`
}

type UpdateUserAPISettingsRequest struct {
	CustomKey string `json:"custom_key"`
}

// GetAPISettings 获取用户自定义 API Key 状态
// GET /api/v1/user/api-settings
func (h *UserAPISettingsHandler) GetAPISettings(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}
	if !h.settingService.IsUserCustomKeyEnabled(c.Request.Context()) {
		response.ErrorFrom(c, service.ErrUserCustomAPIKeyDisabled)
		return
	}

	key, configured, err := h.settingService.GetUserCustomAPIKey(c.Request.Context(), subject.UserID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}

	response.Success(c, UserAPISettingsResponse{
		CustomKeyConfigured: configured && strings.TrimSpace(key) != "",
	})
}

// UpdateAPISettings 更新用户自定义 API Key
// PUT /api/v1/user/api-settings
func (h *UserAPISettingsHandler) UpdateAPISettings(c *gin.Context) {
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok || subject.UserID <= 0 {
		response.Unauthorized(c, "Unauthorized")
		return
	}

	var req UpdateUserAPISettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	if err := h.settingService.UpdateUserCustomAPIKey(c.Request.Context(), subject.UserID, req.CustomKey); err != nil {
		response.ErrorFrom(c, err)
		return
	}

	configured := strings.TrimSpace(req.CustomKey) != ""
	response.Success(c, UserAPISettingsResponse{
		CustomKeyConfigured: configured,
	})
}
