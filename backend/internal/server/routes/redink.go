package routes

import (
	"github.com/CrazyCherrys/DreamStudio/internal/handler"
	"github.com/CrazyCherrys/DreamStudio/internal/server/middleware"
	"github.com/gin-gonic/gin"
)

// RegisterRedInkRoutes registers RedInk routes.
func RegisterRedInkRoutes(v1 *gin.RouterGroup, h *handler.Handlers, jwtAuth middleware.JWTAuthMiddleware) {
	redink := v1.Group("/redink")
	redink.Use(gin.HandlerFunc(jwtAuth))
	{
		redink.POST("/outline", h.RedInk.GenerateOutline)
		redink.POST("/content", h.RedInk.GenerateContent)
		redink.POST("/records", h.RedInk.CreateRecord)
		redink.GET("/records", h.RedInk.ListRecords)
		redink.GET("/records/:id", h.RedInk.GetRecord)
		redink.PUT("/records/:id", h.RedInk.UpdateRecord)
		redink.DELETE("/records/:id", h.RedInk.DeleteRecord)
		redink.POST("/records/:id/generate", h.RedInk.StartGeneration)
		redink.POST("/records/:id/retry", h.RedInk.RetryPages)
	}
}
