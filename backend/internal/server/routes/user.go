package routes

import (
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"

	"github.com/gin-gonic/gin"
)

// RegisterUserRoutes 注册用户相关路由（需要认证）
func RegisterUserRoutes(
	v1 *gin.RouterGroup,
	h *handler.Handlers,
	jwtAuth middleware.JWTAuthMiddleware,
) {
	authenticated := v1.Group("")
	authenticated.Use(gin.HandlerFunc(jwtAuth))
	{
		// 用户接口
		user := authenticated.Group("/user")
		{
			user.GET("/profile", h.User.GetProfile)
			user.PUT("/password", h.User.ChangePassword)
			user.PUT("", h.User.UpdateProfile)
			user.GET("/api-settings", h.UserAPISettings.GetAPISettings)
			user.PUT("/api-settings", h.UserAPISettings.UpdateAPISettings)
			user.GET("/model-settings", middleware.AdminOnly(), h.UserModel.GetModelSettings)
			user.PUT("/model-settings", middleware.AdminOnly(), h.UserModel.UpdateModelSettings)
			user.GET("/newapi/models", middleware.AdminOnly(), h.UserModel.ListNewAPIModels)
		}

		// 用户可用分组（非管理员接口）
		groups := authenticated.Group("/groups")
		{
			groups.GET("/available", h.APIKey.GetAvailableGroups)
		}
	}
}
