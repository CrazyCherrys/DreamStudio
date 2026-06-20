'use client';

import { apiRequest } from '@/lib/auth';
import type { AssetItem } from '@/lib/assets';

export type ImageTaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout'
  | 'canceled';

export interface PublicTaskAsset {
  id: string;
  kind: string;
  filename: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  download_url: string;
  created_at: string;
}

export interface PublicTaskAttempt {
  id: string;
  attempt_no: number;
  status: ImageTaskStatus;
  started_at: string;
  finished_at: string | null;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  is_retryable: boolean;
  created_at: string;
}

export interface ImageTask {
  id: string;
  model_record_id: string;
  model_id: string;
  endpoint_type: string;
  prompt_summary: string;
  negative_prompt_summary: string | null;
  sanitized_parameter_snapshot: Record<string, unknown>;
  reference_asset_ids: string[];
  status: ImageTaskStatus;
  error_code: string | null;
  error_message: string | null;
  client_request_id: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  result_assets: PublicTaskAsset[];
  attempts?: PublicTaskAttempt[];
}

export interface ImageTaskListResponse {
  items: ImageTask[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface CreateImageTaskPayload {
  model_record_id: string;
  prompt: string;
  negative_prompt?: string | null;
  parameters: Record<string, string | number | boolean | null>;
  reference_asset_ids: string[];
  client_request_id: string;
}

export function createImageTask(payload: CreateImageTaskPayload, csrfToken: string) {
  return apiRequest<{ item: ImageTask }>('/api/v1/image-tasks', {
    method: 'POST',
    csrfToken,
    body: JSON.stringify(payload),
  });
}

export interface FetchImageTasksOptions {
  status?: ImageTaskStatus | 'all';
  modelRecordId?: string;
  page?: number;
  pageSize?: number;
}

export function fetchImageTasks(
  statusOrOptions?: ImageTaskStatus | 'all' | FetchImageTasksOptions,
) {
  const params = new URLSearchParams();
  const options =
    typeof statusOrOptions === 'object' && statusOrOptions !== null
      ? statusOrOptions
      : { status: statusOrOptions };
  const { status, modelRecordId, page, pageSize } = options;
  if (status && status !== 'all') {
    params.set('status', status);
  }
  if (modelRecordId) {
    params.set('model_record_id', modelRecordId);
  }
  if (page) {
    params.set('page', String(page));
  }
  if (pageSize) {
    params.set('page_size', String(pageSize));
  }
  const query = params.toString();
  return apiRequest<ImageTaskListResponse>(`/api/v1/image-tasks${query ? `?${query}` : ''}`, {
    cache: 'no-store',
  });
}

export function fetchImageTask(taskId: string) {
  return apiRequest<{ item: ImageTask }>(`/api/v1/image-tasks/${taskId}`, {
    cache: 'no-store',
  });
}

export function cancelImageTask(taskId: string, csrfToken: string) {
  return apiRequest<{ item: ImageTask }>(`/api/v1/image-tasks/${taskId}/cancel`, {
    method: 'POST',
    csrfToken,
  });
}

export function retryImageTask(taskId: string, csrfToken: string) {
  return apiRequest<{ item: ImageTask }>(`/api/v1/image-tasks/${taskId}/retry`, {
    method: 'POST',
    csrfToken,
  });
}

export function deleteImageTask(taskId: string, csrfToken: string) {
  return apiRequest<{ deleted: boolean; item: ImageTask }>(`/api/v1/image-tasks/${taskId}`, {
    method: 'DELETE',
    csrfToken,
  });
}

export function taskStatusLabel(status: ImageTaskStatus) {
  switch (status) {
    case 'pending':
      return '排队中';
    case 'running':
      return '生成中';
    case 'succeeded':
      return '已完成';
    case 'failed':
      return '失败';
    case 'timeout':
      return '超时';
    case 'canceled':
      return '已取消';
  }
}

export function taskStatusTone(status: ImageTaskStatus) {
  if (status === 'succeeded') {
    return 'text-[var(--ds-success)]';
  }
  if (status === 'failed' || status === 'timeout' || status === 'canceled') {
    return 'text-[var(--ds-danger)]';
  }
  return 'text-[var(--ds-brand)]';
}

export function assetToTaskAsset(asset: AssetItem): PublicTaskAsset {
  return {
    id: asset.id,
    kind: asset.kind,
    filename: asset.filename,
    mime_type: asset.mime_type,
    width: asset.width,
    height: asset.height,
    download_url: asset.download_url,
    created_at: asset.created_at,
  };
}
