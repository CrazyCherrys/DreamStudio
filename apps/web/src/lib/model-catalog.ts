'use client';

import { apiRequest } from '@/lib/auth';

export type ModelEndpointType =
  | 'openai_image_generations'
  | 'openai_image_edits'
  | 'gemini_generate_content';
export type ReferenceTransferMode = 'none' | 'multipart' | 'url';
export type ParameterFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'select';

export interface ParameterSchemaOption {
  label: string;
  value: string | number | boolean;
}

export interface ParameterSchemaField {
  key: string;
  label: string;
  type: ParameterFieldType;
  description?: string;
  required: boolean;
  default?: string | number | boolean | null;
  min?: number;
  max?: number;
  options?: ParameterSchemaOption[];
  placeholder?: string;
}

export interface PublicModelCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
}

export interface AdminModelCategory extends PublicModelCategory {
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PublicAiModel {
  id: string;
  model_id: string;
  display_name: string;
  provider_name: string | null;
  category_id: string | null;
  endpoint_type: ModelEndpointType;
  reference_transfer_mode: ReferenceTransferMode;
  supports_reference_image: boolean;
  is_recommended: boolean;
  default_params: Record<string, unknown>;
  parameter_schema: ParameterSchemaField[];
}

export interface AdminAiModel extends PublicAiModel {
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  category: AdminModelCategory | null;
}

export interface ModelSyncSnapshotSummary {
  id: string;
  base_url: string;
  operator_id: string;
  model_count: number;
  created_at: string;
}

export interface ModelSyncSnapshotDetail extends ModelSyncSnapshotSummary {
  raw_response: unknown;
}

export interface ModelCategoryPayload {
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_enabled: boolean;
}

export interface AiModelPayload {
  category_id: string | null;
  model_id: string;
  display_name: string;
  provider_name: string | null;
  endpoint_type: ModelEndpointType;
  reference_transfer_mode: ReferenceTransferMode;
  supports_reference_image: boolean;
  is_enabled: boolean;
  is_recommended: boolean;
  sort_order: number;
  default_params: Record<string, unknown>;
  parameter_schema: ParameterSchemaField[];
}

export interface ModelSyncSnapshotPayload {
  new_api_base_url?: string;
  api_key?: string;
}

export function fetchPublicCategories() {
  return apiRequest<{ items: PublicModelCategory[] }>('/api/v1/model-categories', {
    cache: 'no-store',
  });
}

export function fetchPublicModels(query: { category_id?: string; recommended?: boolean } = {}) {
  const params = new URLSearchParams();
  if (query.category_id) {
    params.set('category_id', query.category_id);
  }
  if (query.recommended !== undefined) {
    params.set('recommended', String(query.recommended));
  }

  return apiRequest<{ items: PublicAiModel[] }>(`/api/v1/models${withQuery(params)}`, {
    cache: 'no-store',
  });
}

export function fetchAdminCategories() {
  return apiRequest<{ items: AdminModelCategory[] }>('/api/v1/admin/model-categories', {
    cache: 'no-store',
  });
}

export function createAdminCategory(payload: ModelCategoryPayload, csrfToken: string) {
  return apiRequest<{ item: AdminModelCategory }>('/api/v1/admin/model-categories', {
    method: 'POST',
    csrfToken,
    body: JSON.stringify(payload),
  });
}

export function updateAdminCategory(
  categoryId: string,
  payload: Partial<ModelCategoryPayload>,
  csrfToken: string,
) {
  return apiRequest<{ item: AdminModelCategory }>(`/api/v1/admin/model-categories/${categoryId}`, {
    method: 'PATCH',
    csrfToken,
    body: JSON.stringify(payload),
  });
}

export function deleteAdminCategory(categoryId: string, csrfToken: string) {
  return apiRequest<{ deleted: boolean; item: AdminModelCategory }>(
    `/api/v1/admin/model-categories/${categoryId}`,
    {
      method: 'DELETE',
      csrfToken,
    },
  );
}

export function fetchAdminModels() {
  return apiRequest<{ items: AdminAiModel[] }>('/api/v1/admin/models', {
    cache: 'no-store',
  });
}

export function createAdminModel(payload: AiModelPayload, csrfToken: string) {
  return apiRequest<{ item: AdminAiModel }>('/api/v1/admin/models', {
    method: 'POST',
    csrfToken,
    body: JSON.stringify(payload),
  });
}

export function updateAdminModel(
  modelId: string,
  payload: Partial<AiModelPayload>,
  csrfToken: string,
) {
  return apiRequest<{ item: AdminAiModel }>(`/api/v1/admin/models/${modelId}`, {
    method: 'PATCH',
    csrfToken,
    body: JSON.stringify(payload),
  });
}

export function deleteAdminModel(modelId: string, csrfToken: string) {
  return apiRequest<{ deleted: boolean; item: AdminAiModel }>(`/api/v1/admin/models/${modelId}`, {
    method: 'DELETE',
    csrfToken,
  });
}

export function createModelSyncSnapshot(payload: ModelSyncSnapshotPayload, csrfToken: string) {
  return apiRequest<{ snapshot: ModelSyncSnapshotSummary }>('/api/v1/admin/model-sync-snapshots', {
    method: 'POST',
    csrfToken,
    body: JSON.stringify(payload),
  });
}

export function fetchModelSyncSnapshots() {
  return apiRequest<{ items: ModelSyncSnapshotSummary[] }>('/api/v1/admin/model-sync-snapshots', {
    cache: 'no-store',
  });
}

export function fetchModelSyncSnapshot(snapshotId: string) {
  return apiRequest<{ snapshot: ModelSyncSnapshotDetail }>(
    `/api/v1/admin/model-sync-snapshots/${snapshotId}`,
    {
      cache: 'no-store',
    },
  );
}

export function endpointTypeLabel(value: ModelEndpointType) {
  switch (value) {
    case 'openai_image_edits':
      return 'OpenAI 图片编辑';
    case 'gemini_generate_content':
      return 'Gemini generateContent';
    default:
      return 'OpenAI 图片生成';
  }
}

export function transferModeLabel(value: ReferenceTransferMode) {
  switch (value) {
    case 'multipart':
      return 'multipart';
    case 'url':
      return 'URL';
    default:
      return '无需参考图';
  }
}

export function emptySchemaField(): ParameterSchemaField {
  return {
    key: `param_${Date.now().toString(36)}`,
    label: '新参数',
    type: 'string',
    required: false,
  };
}

function withQuery(params: URLSearchParams) {
  const query = params.toString();
  return query ? `?${query}` : '';
}
