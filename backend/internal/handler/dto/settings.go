package dto

// SystemSettings represents the admin settings API response payload.
type SystemSettings struct {
	RegistrationEnabled bool `json:"registration_enabled"`
	EmailVerifyEnabled  bool `json:"email_verify_enabled"`
	PromoCodeEnabled    bool `json:"promo_code_enabled"`

	SMTPHost               string `json:"smtp_host"`
	SMTPPort               int    `json:"smtp_port"`
	SMTPUsername           string `json:"smtp_username"`
	SMTPPasswordConfigured bool   `json:"smtp_password_configured"`
	SMTPFrom               string `json:"smtp_from_email"`
	SMTPFromName           string `json:"smtp_from_name"`
	SMTPUseTLS             bool   `json:"smtp_use_tls"`

	TurnstileEnabled             bool   `json:"turnstile_enabled"`
	TurnstileSiteKey             string `json:"turnstile_site_key"`
	TurnstileSecretKeyConfigured bool   `json:"turnstile_secret_key_configured"`

	LinuxDoConnectEnabled                bool   `json:"linuxdo_connect_enabled"`
	LinuxDoConnectClientID               string `json:"linuxdo_connect_client_id"`
	LinuxDoConnectClientSecretConfigured bool   `json:"linuxdo_connect_client_secret_configured"`
	LinuxDoConnectRedirectURL            string `json:"linuxdo_connect_redirect_url"`

	SiteName            string `json:"site_name"`
	SiteLogo            string `json:"site_logo"`
	SiteSubtitle        string `json:"site_subtitle"`
	APIBaseURL          string `json:"api_base_url"`
	ContactInfo         string `json:"contact_info"`
	DocURL              string `json:"doc_url"`
	HomeContent         string `json:"home_content"`
	HideCcsImportButton bool   `json:"hide_ccs_import_button"`
	UserCustomKeyEnabled bool  `json:"user_custom_key_enabled"`

	StorageS3Enabled             bool   `json:"storage_s3_enabled"`
	StorageS3Endpoint            string `json:"storage_s3_endpoint"`
	StorageS3Region              string `json:"storage_s3_region"`
	StorageS3Bucket              string `json:"storage_s3_bucket"`
	StorageS3AccessKeyConfigured bool   `json:"storage_s3_access_key_configured"`
	StorageS3SecretKeyConfigured bool   `json:"storage_s3_secret_key_configured"`
	StorageS3PublicURL           string `json:"storage_s3_public_url"`
	StorageS3UseSSL              bool   `json:"storage_s3_use_ssl"`
	StorageS3PathStyle           bool   `json:"storage_s3_path_style"`

	DefaultConcurrency int     `json:"default_concurrency"`
	DefaultBalance     float64 `json:"default_balance"`

	// Model fallback configuration
	EnableModelFallback      bool   `json:"enable_model_fallback"`
	FallbackModelAnthropic   string `json:"fallback_model_anthropic"`
	FallbackModelOpenAI      string `json:"fallback_model_openai"`
	FallbackModelGemini      string `json:"fallback_model_gemini"`
	FallbackModelAntigravity string `json:"fallback_model_antigravity"`

	// Identity patch configuration (Claude -> Gemini)
	EnableIdentityPatch bool   `json:"enable_identity_patch"`
	IdentityPatchPrompt string `json:"identity_patch_prompt"`

	PromptOptimizeModel  string `json:"prompt_optimize_model"`
	PromptOptimizePrompt string `json:"prompt_optimize_prompt"`

	// Ops monitoring (vNext)
	OpsMonitoringEnabled         bool   `json:"ops_monitoring_enabled"`
	OpsRealtimeMonitoringEnabled bool   `json:"ops_realtime_monitoring_enabled"`
	OpsQueryModeDefault          string `json:"ops_query_mode_default"`
	OpsMetricsIntervalSeconds    int    `json:"ops_metrics_interval_seconds"`
}

type PublicSettings struct {
	RegistrationEnabled bool   `json:"registration_enabled"`
	EmailVerifyEnabled  bool   `json:"email_verify_enabled"`
	PromoCodeEnabled    bool   `json:"promo_code_enabled"`
	TurnstileEnabled    bool   `json:"turnstile_enabled"`
	TurnstileSiteKey    string `json:"turnstile_site_key"`
	SiteName            string `json:"site_name"`
	SiteLogo            string `json:"site_logo"`
	SiteSubtitle        string `json:"site_subtitle"`
	APIBaseURL          string `json:"api_base_url"`
	ContactInfo         string `json:"contact_info"`
	DocURL              string `json:"doc_url"`
	HomeContent         string `json:"home_content"`
	HideCcsImportButton bool   `json:"hide_ccs_import_button"`
	UserCustomKeyEnabled bool  `json:"user_custom_key_enabled"`
	LinuxDoOAuthEnabled bool   `json:"linuxdo_oauth_enabled"`
	Version             string `json:"version"`
}

// StreamTimeoutSettings 流超时处理配置 DTO
type StreamTimeoutSettings struct {
	Enabled                bool   `json:"enabled"`
	Action                 string `json:"action"`
	TempUnschedMinutes     int    `json:"temp_unsched_minutes"`
	ThresholdCount         int    `json:"threshold_count"`
	ThresholdWindowMinutes int    `json:"threshold_window_minutes"`
}

// GenerationTimeoutSettings 生成超时配置 DTO
type GenerationTimeoutSettings struct {
	ImageTimeoutSeconds int `json:"image_timeout_seconds"`
	VideoTimeoutSeconds int `json:"video_timeout_seconds"`
}
