'use client';

import { apiRequest } from '@/lib/auth';
import type { NewApiConfigStatus, UserRole, UserStatus } from '@/lib/auth';

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AdminUserListItem {
  id: string;
  username: string;
  display_name: string | null;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
  disabled_at: string | null;
  deleted_at: string | null;
  new_api_config_status: NewApiConfigStatus;
  masked_api_key: string | null;
  active_session_count: number;
}

export interface AdminUserList {
  items: AdminUserListItem[];
  pagination: Pagination;
}

export interface AdminUserDetail {
  item: AdminUserListItem & {
    updated_at: string;
    new_api_config: {
      configured: boolean;
      status: NewApiConfigStatus;
      masked_api_key: string | null;
      uses_custom_base_url: boolean;
      base_url_host: string | null;
      last_tested_at: string | null;
      last_test_error: string | null;
    };
    session_summary: {
      active_count: number;
      recent: Array<{
        id: string;
        ip_address: string | null;
        user_agent_summary: string | null;
        expires_at: string;
        revoked_at: string | null;
        created_at: string;
      }>;
    };
    activity_summary: {
      image_task_count: number;
      request_log_count: number;
    };
  };
}

export interface RequestLogListItem {
  id: string;
  user: {
    id: string;
    username: string;
    display_name: string | null;
  } | null;
  task: {
    id: string;
    status: string;
    client_request_id?: string | null;
    created_at?: string;
    completed_at?: string | null;
  } | null;
  model_id: string;
  endpoint_type: string;
  adapter_key: string | null;
  adapter_version: string | null;
  execution_profile_id: string | null;
  execution_profile_revision_id: string | null;
  status: 'succeeded' | 'failed' | 'timeout' | 'canceled';
  http_status: number | null;
  duration_ms: number | null;
  new_api_base_url_host: string;
  prompt_summary: string | null;
  sanitized_params: unknown;
  resolved_request_sanitized: unknown;
  upstream_response_summary: unknown;
  profile_error_hint: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  expires_at: string;
}

export interface RequestLogDetail {
  item: RequestLogListItem & {
    attempt: {
      id: string;
      attempt_no: number;
      status: string;
      http_status: number | null;
      error_code: string | null;
      error_message: string | null;
    } | null;
    has_prompt: boolean;
    has_params: boolean;
  };
}

export interface RequestLogList {
  items: RequestLogListItem[];
  pagination: Pagination;
}

export interface AuditLogListItem {
  id: string;
  actor: {
    id: string;
    username: string;
    display_name: string | null;
  } | null;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  result: 'success' | 'failed';
  ip: string | null;
  user_agent_summary: string | null;
  metadata: unknown;
  created_at: string;
  expires_at: string;
}

export interface AuditLogList {
  items: AuditLogListItem[];
  pagination: Pagination;
}

export interface AuditLogDetail {
  item: AuditLogListItem;
}

export function fetchAdminUsers(params: URLSearchParams) {
  return apiRequest<AdminUserList>(`/api/v1/admin/users?${params}`, {
    cache: 'no-store',
  });
}

export function fetchAdminUser(userId: string) {
  return apiRequest<AdminUserDetail>(`/api/v1/admin/users/${userId}`, {
    cache: 'no-store',
  });
}

export function updateAdminUserStatus(userId: string, status: UserStatus, csrfToken: string) {
  return apiRequest<{ item: AdminUserListItem }>(`/api/v1/admin/users/${userId}/status`, {
    method: 'PATCH',
    csrfToken,
    body: JSON.stringify({ status }),
  });
}

export function resetAdminUserPassword(userId: string, newPassword: string, csrfToken: string) {
  return apiRequest<{ reset: boolean; user_id: string }>(
    `/api/v1/admin/users/${userId}/reset-password`,
    {
      method: 'POST',
      csrfToken,
      body: JSON.stringify({ new_password: newPassword }),
    },
  );
}

export function fetchRequestLogs(params: URLSearchParams) {
  return apiRequest<RequestLogList>(`/api/v1/admin/request-logs?${params}`, {
    cache: 'no-store',
  });
}

export function fetchRequestLog(logId: string) {
  return apiRequest<RequestLogDetail>(`/api/v1/admin/request-logs/${logId}`, {
    cache: 'no-store',
  });
}

export function revealRequestLogPrompt(logId: string, csrfToken: string) {
  return apiRequest<{ log_id: string; prompt: string }>(
    `/api/v1/admin/request-logs/${logId}/reveal-prompt`,
    {
      method: 'POST',
      csrfToken,
      body: JSON.stringify({}),
    },
  );
}

export function revealRequestLogParams(logId: string, csrfToken: string) {
  return apiRequest<{ log_id: string; params: unknown }>(
    `/api/v1/admin/request-logs/${logId}/reveal-params`,
    {
      method: 'POST',
      csrfToken,
      body: JSON.stringify({}),
    },
  );
}

export function fetchAuditLogs(params: URLSearchParams) {
  return apiRequest<AuditLogList>(`/api/v1/admin/audit-logs?${params}`, {
    cache: 'no-store',
  });
}

export function fetchAuditLog(logId: string) {
  return apiRequest<AuditLogDetail>(`/api/v1/admin/audit-logs/${logId}`, {
    cache: 'no-store',
  });
}

export function statusLabel(status: string) {
  switch (status) {
    case 'active':
      return '启用';
    case 'disabled':
      return '禁用';
    case 'deleted':
      return '已删除';
    case 'succeeded':
      return '成功';
    case 'failed':
      return '失败';
    case 'timeout':
      return '超时';
    case 'canceled':
      return '已取消';
    case 'valid':
      return '有效';
    case 'invalid':
      return '异常';
    case 'untested':
      return '未测试';
    case 'missing':
      return '未配置';
    default:
      return status;
  }
}

export function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    admin_enable_user: '启用用户',
    admin_disable_user: '禁用用户',
    admin_soft_delete_user: '软删除用户',
    admin_reset_user_password: '重置密码',
    admin_reveal_request_log_prompt: '查看完整 Prompt',
    admin_reveal_request_log_params: '查看完整参数',
    admin_update_system_setting: '更新系统设置',
    admin_update_storage_settings: '更新存储设置',
    admin_test_storage_settings: '测试存储设置',
    admin_set_user_new_api_key: '代用户保存密钥',
    admin_delete_user_new_api_key: '清空用户密钥',
    user_set_new_api_key: '用户保存密钥',
  };
  return labels[action] ?? action.replaceAll('_', ' ');
}

export function targetTypeLabel(targetType: string) {
  const labels: Record<string, string> = {
    user: '用户',
    request_log: '请求日志',
    system_setting: '系统设置',
    storage_setting: '存储设置',
    user_new_api_config: '用户密钥配置',
    model_category: '模型分类',
    ai_model: '模型',
    model_sync_snapshot: '模型候选快照',
  };
  return labels[targetType] ?? targetType;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '未记录';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function stringifyPreview(value: unknown) {
  if (value === null || value === undefined) {
    return '无';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}
