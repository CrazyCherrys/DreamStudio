'use client';

import { apiRequest } from '@/lib/auth';
import type { NewApiConfigStatus } from '@/lib/auth';
import type { SystemSettings as SharedSystemSettings } from '@dreamstudio/config';

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

export type SystemSettings = SharedSystemSettings;

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
