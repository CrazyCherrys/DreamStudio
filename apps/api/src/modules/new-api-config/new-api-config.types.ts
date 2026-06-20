import type { NewApiConfigStatus } from '@prisma/client';

export interface NewApiConfigBody {
  api_key?: unknown;
  new_api_base_url?: unknown;
  test_before_save?: unknown;
}

export interface NewApiConfigTestBody {
  api_key?: unknown;
  new_api_base_url?: unknown;
}

export interface SystemSettingsBody {
  default_new_api_base_url?: unknown;
  allow_user_custom_new_api_base_url?: unknown;
  registration_enabled?: unknown;
  image_task_timeout_seconds?: unknown;
  image_task_max_attempts?: unknown;
  image_task_retry_backoff_seconds?: unknown;
  per_user_running_task_limit?: unknown;
  global_running_task_limit?: unknown;
  request_log_retention_hours?: unknown;
  audit_log_retention_hours?: unknown;
}

export interface PublicNewApiConfig {
  configured: boolean;
  new_api_base_url: string | null;
  uses_custom_base_url: boolean;
  masked_api_key: string | null;
  status: NewApiConfigStatus | 'missing';
  last_tested_at: string | null;
  last_test_error: string | null;
  allow_custom_base_url: boolean;
  default_new_api_base_url: string | null;
}

export interface ConnectionTestResult {
  ok: boolean;
  status: NewApiConfigStatus;
  model_count: number | null;
  tested_at: string;
  error: string | null;
}
