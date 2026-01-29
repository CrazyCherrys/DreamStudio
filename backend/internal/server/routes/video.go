package routes

import (
	"github.com/CrazyCherrys/DreamStudio/internal/handler"
	"github.com/CrazyCherrys/DreamStudio/internal/server/middleware"
	"github.com/gin-gonic/gin"
)

// RegisterVideoRoutes registers video generation routes.
func RegisterVideoRoutes(v1 *gin.RouterGroup, h *handler.Handlers, jwtAuth middleware.JWTAuthMiddleware) {
	videos := v1.Group("/videos")
	videos.Use(gin.HandlerFunc(jwtAuth))
	{
		videos.POST("/generate", h.Video.Generate)
		videos.GET("/history", h.Video.ListHistory)
		videos.GET("/history/:id", h.Video.GetHistory)
		videos.DELETE("/history/:id", h.Video.DeleteHistory)
	}
}
