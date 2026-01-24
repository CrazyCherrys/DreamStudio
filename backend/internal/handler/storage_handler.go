package handler

import (
	"net/http"
	"os"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

type StorageHandler struct {
	storageService *service.StorageService
}

func NewStorageHandler(storageService *service.StorageService) *StorageHandler {
	return &StorageHandler{
		storageService: storageService,
	}
}

// ServeLocal serves local stored files.
// GET /api/v1/storage/*path
func (h *StorageHandler) ServeLocal(c *gin.Context) {
	rawPath := strings.TrimPrefix(c.Param("path"), "/")
	if rawPath == "" {
		c.Status(http.StatusNotFound)
		return
	}

	fullPath, err := h.storageService.ResolveLocalPath(rawPath)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	if _, err := os.Stat(fullPath); err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	c.File(fullPath)
}
