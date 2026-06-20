'use client';

import { apiRequest } from '@/lib/auth';
import type { NewApiConfigStatus } from '@/lib/auth';

export interface PublicNewApiConfig {
  configured: boolean;
  new_api_base_url: string | null;
  uses_custom_base_url: boolean;
  masked_api_key: string | null;
  status: NewApiConfigStatus;
  last_tested_at: string | null;
  last_test_error: string | null;
  allow_custom_base_url: boolean;
  default_new_api_base_url: string | null;
}

export interface ConnectionTestResult {
  ok: boolean;
  status: 'valid' | 'invalid';
  model_count: number | null;
  tested_at: string;
  error: string | null;
}

export interface SystemSettings {
  default_new_api_base_url: string;
  allow_user_custom_new_api_base_url: boolean;
  registration_enabled: boolean;
  image_task_timeout_seconds: number;
  image_task_max_attempts: number;
  image_task_retry_backoff_seconds: number;
  per_user_running_task_limit: number;
  global_running_task_limit: number;
  request_log_retention_hours: number;
  audit_log_retention_hours: number;
}

export interface AdminUserListItem {
  id: string;
  username: string;
  display_name: string | null;
  role: 'user' | 'super_admin';
  status: 'active' | 'disabled' | 'deleted';
  last_login_at: string | null;
  new_api_config_status: NewApiConfigStatus;
  masked_api_key: string | null;
}

export interface AdminUserList {
  items: AdminUserListItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export function statusLabel(status: NewApiConfigStatus) {
  switch (status) {
    case 'valid':
      return '有效';
    case 'invalid':
      return '异常';
    case 'untested':
      return '未测试';
    default:
      return '未配置';
  }
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return '未记录';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function fetchOwnNewApiConfig() {
  return apiRequest<PublicNewApiConfig>('/api/v1/me/new-api-config', {
    cache: 'no-store',
  });
}
