package handler

import (
	"net/http"
	"time"

	"github.com/CrazyCherrys/DreamStudio/internal/service"
	"github.com/gin-gonic/gin"
)

type HealthHandler struct {
	storageService *service.StorageService
}

func NewHealthHandler(storageService *service.StorageService) *HealthHandler {
	return &HealthHandler{storageService: storageService}
}

func (h *HealthHandler) Check(c *gin.Context) {
	storage := service.StorageHealth{
		Backend: "unknown",
		Ready:   false,
		Error:   "storage service not configured",
	}
	if h != nil && h.storageService != nil {
		storage = h.storageService.CheckHealth(c.Request.Context())
	}
	publicStorage := service.StorageHealth{
		Backend: storage.Backend,
		Ready:   storage.Ready,
	}
	if !storage.Ready {
		publicStorage.Error = "storage not ready"
	}
	status := "ok"
	if !storage.Ready {
		status = "degraded"
	}
	c.JSON(http.StatusOK, gin.H{
		"status":    status,
		"storage":   publicStorage,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
