'use client';

import { apiRequest } from '@/lib/auth';

export type AssetKind = 'reference_image' | 'result_image';
export type StorageDriver = 'local' | 's3';

export interface AssetItem {
  id: string;
  kind: AssetKind;
  status: 'available' | 'deleted' | 'expired_cleaned';
  filename: string;
  mime_type: string;
  size_bytes: string;
  width: number | null;
  height: number | null;
  checksum: string;
  source_task_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  expires_at: string | null;
  cleaned_at: string | null;
  download_url: string;
}

export interface AssetListResponse {
  items: AssetItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface StorageSettings {
  id: string | null;
  driver: StorageDriver;
  local_input_path: string;
  local_output_path: string;
  s3_endpoint: string | null;
  s3_bucket: string | null;
  s3_region: string | null;
  s3_force_path_style: boolean;
  s3_public_base_url: string | null;
  masked_s3_access_key: string | null;
  masked_s3_secret_key: string | null;
  reference_retention_hours: number;
  result_retention_hours: number;
  updated_at: string | null;
}

export interface StorageTestResult {
  ok: boolean;
  tested_at: string;
}

export function formatAssetBytes(value: string) {
  const size = Number.parseInt(value, 10);
  if (!Number.isFinite(size) || size < 0) {
    return '-';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatAssetDate(value: string | null) {
  if (!value) {
    return '未记录';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function fetchAssets(kind: AssetKind) {
  return apiRequest<AssetListResponse>(`/api/v1/assets?kind=${kind}`, {
    cache: 'no-store',
  });
}

export function uploadReferenceImage(file: File, csrfToken: string) {
  const formData = new FormData();
  formData.set('file', file);
  return apiRequest<{ item: AssetItem }>('/api/v1/assets/reference-images', {
    method: 'POST',
    csrfToken,
    body: formData,
  });
}

export function deleteAsset(assetId: string, csrfToken: string) {
  return apiRequest<{ deleted: boolean; physical_deleted: boolean }>(`/api/v1/assets/${assetId}`, {
    method: 'DELETE',
    csrfToken,
  });
}

export function batchDeleteAssets(assetIds: string[], csrfToken: string) {
  return apiRequest<{ deleted_count: number; physical_deleted_count: number }>(
    '/api/v1/assets/batch-delete',
    {
      method: 'POST',
      csrfToken,
      body: JSON.stringify({
        asset_ids: assetIds,
      }),
    },
  );
}

export function fetchStorageSettings() {
  return apiRequest<StorageSettings>('/api/v1/admin/storage-settings', {
    cache: 'no-store',
  });
}

export function saveStorageSettings(
  settings: Partial<StorageSettings> & Record<string, unknown>,
  csrfToken: string,
) {
  return apiRequest<StorageSettings>('/api/v1/admin/storage-settings', {
    method: 'PUT',
    csrfToken,
    body: JSON.stringify(settings),
  });
}

export function testStorageSettings(
  settings: Partial<StorageSettings> & Record<string, unknown>,
  csrfToken: string,
) {
  return apiRequest<StorageTestResult>('/api/v1/admin/storage-settings/test', {
    method: 'POST',
    csrfToken,
    body: JSON.stringify(settings),
  });
}
