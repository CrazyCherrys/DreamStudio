package routes

import (
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/gin-gonic/gin"
)

// RegisterStorageRoutes registers storage routes (local file serving).
func RegisterStorageRoutes(v1 *gin.RouterGroup, h *handler.Handlers) {
	storage := v1.Group("/storage")
	{
		storage.GET("/*path", h.Storage.ServeLocal)
	}
}
