package setup

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// DefaultModelSettings 默认模型配置
// 在首次部署时自动创建，确保前端能正常显示模型名称和支持4K分辨率
const defaultModelSettingsJSON = `{
  "items": [
    {
      "model_id": "dall-e-3",
      "display_name": "DALL-E 3",
      "request_model_id": "dall-e-3",
      "request_endpoint": "openai",
      "model_type": "image",
      "resolutions": ["1K"],
      "aspect_ratios": ["1:1", "16:9", "9:16"],
      "durations": [],
      "rpm": 0,
      "rpm_enabled": false
    },
    {
      "model_id": "gemini-3.0-pro-image-preview",
      "display_name": "Gemini 3.0 Pro Image (4K)",
      "request_model_id": "gemini-3.0-pro-image-preview",
      "request_endpoint": "openai_mod",
      "model_type": "image",
      "resolutions": ["1K", "2K", "4K"],
      "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
      "durations": [],
      "rpm": 0,
      "rpm_enabled": false
    },
    {
      "model_id": "imagen-3.0-generate-001",
      "display_name": "Imagen 3.0",
      "request_model_id": "imagen-3.0-generate-001",
      "request_endpoint": "gemini",
      "model_type": "image",
      "resolutions": ["1K", "2K", "4K"],
      "aspect_ratios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
      "durations": [],
      "rpm": 0,
      "rpm_enabled": false
    },
    {
      "model_id": "veo-2.0-generate-001",
      "display_name": "Veo 2.0",
      "request_model_id": "veo-2.0-generate-001",
      "request_endpoint": "gemini",
      "model_type": "video",
      "resolutions": ["1K"],
      "aspect_ratios": ["16:9", "9:16"],
      "durations": ["8s"],
      "rpm": 0,
      "rpm_enabled": false
    }
  ]
}`

// initializeDefaultSettings 初始化默认配置数据
// 在数据库迁移完成后自动调用，确保 admin_model_settings 等配置存在
func initializeDefaultSettings(cfg *SetupConfig) error {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Database.Host, cfg.Database.Port, cfg.Database.User,
		cfg.Database.Password, cfg.Database.DBName, cfg.Database.SSLMode,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}

	defer func() {
		if err := db.Close(); err != nil {
			log.Printf("failed to close postgres connection: %v", err)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 检查 admin_model_settings 是否已存在
	var exists bool
	err = db.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM settings WHERE key = $1)",
		"admin_model_settings",
	).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check admin_model_settings existence: %w", err)
	}

	if exists {
		log.Println("admin_model_settings already exists, skipping initialization")
		return nil
	}

	// 验证 JSON 格式
	var testJSON interface{}
	if err := json.Unmarshal([]byte(defaultModelSettingsJSON), &testJSON); err != nil {
		return fmt.Errorf("invalid default model settings JSON: %w", err)
	}

	// 插入默认配置
	_, err = db.ExecContext(ctx,
		`INSERT INTO settings (key, value, created_at, updated_at)
		 VALUES ($1, $2, NOW(), NOW())`,
		"admin_model_settings",
		defaultModelSettingsJSON,
	)
	if err != nil {
		return fmt.Errorf("insert admin_model_settings: %w", err)
	}

	log.Println("✓ Default model settings initialized successfully")
	log.Println("  - DALL-E 3 (OpenAI)")
	log.Println("  - Gemini 3.0 Pro Image (4K)")
	log.Println("  - Imagen 3.0 (Gemini)")
	log.Println("  - Veo 2.0 (Video)")

	return nil
}
