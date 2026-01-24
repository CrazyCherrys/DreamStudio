package routes

import (
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/gin-gonic/gin"
)

// RegisterGalleryRoutes registers public and authenticated gallery routes.
func RegisterGalleryRoutes(v1 *gin.RouterGroup, h *handler.Handlers, jwtAuth middleware.JWTAuthMiddleware) {
	public := v1.Group("/gallery")
	{
		public.GET("", h.Gallery.ListPublic)
	}

	authenticated := v1.Group("/gallery")
	authenticated.Use(gin.HandlerFunc(jwtAuth))
	{
		authenticated.GET("/mine", h.Gallery.ListMine)
		authenticated.POST("", h.Gallery.Create)
		authenticated.POST("/submit", h.Gallery.Submit)
		authenticated.PATCH("/:id/visibility", h.Gallery.UpdateVisibility)
		authenticated.DELETE("/:id/submission", h.Gallery.WithdrawSubmission)
	}
}
