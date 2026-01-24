package routes

import (
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/gin-gonic/gin"
)

// RegisterImageRoutes registers image generation routes.
func RegisterImageRoutes(v1 *gin.RouterGroup, h *handler.Handlers, jwtAuth middleware.JWTAuthMiddleware) {
	images := v1.Group("/images")
	images.Use(gin.HandlerFunc(jwtAuth))
	{
		images.POST("/generate", h.Image.Generate)
		images.POST("/optimize", h.Image.OptimizePrompt)
		images.GET("/history", h.Image.ListHistory)
		images.GET("/history/:id", h.Image.GetHistory)
		images.DELETE("/history/:id", h.Image.DeleteHistory)
	}
}
