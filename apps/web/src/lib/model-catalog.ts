'use client';

import { apiRequest } from '@/lib/auth';

export type ModelEndpointType =
  | 'openai_image_generations'
  | 'openai_image_edits'
  | 'gemini_generate_content';
export type ModelModality = 'chat' | 'image' | 'video';
export type ReferenceTransferMode = 'none' | 'multipart' | 'url';
export type ParameterFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'select';
export type ExecutionProfileRevisionStatus = 'draft' | 'active' | 'archived';
export type ExecutionProfileSourceKind =
  | 'manual'
  | 'openai_official'
  | 'gemini_official'
  | 'third_party_docs'
  | 'imported_json';
export type ProfileTemplateCategory = 'openai_official' | 'openai_compatible';
export type ProfileTemplateImportMode = 'template' | 'openai_compatible_copy';

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
  ui?: {
    group?: string;
    slot?: string;
    order?: number;
  };
  capability?: string;
  send_policy?: string;
  validation?: Record<string, unknown>;
  help_url?: string;
  deprecated?: boolean;
}

export type ExecutionProfileOperation =
  | 'text_to_image'
  | 'image_to_image'
  | 'image_edit'
  | 'conversational_image';

export interface PublicExecutionProfileCapabilities {
  supports_reference_image: boolean;
  max_reference_images: number;
  [key: string]: unknown;
}

export interface PublicDefaultExecutionProfile {
  id: string;
  revision_id: string;
  operation: ExecutionProfileOperation;
  adapter_key: string;
  adapter_version: string;
  reference_transfer_mode: ReferenceTransferMode;
  supports_reference_image: boolean;
  max_reference_images: number;
  parameter_schema: ParameterSchemaField[];
  default_params: Record<string, unknown>;
  capabilities: PublicExecutionProfileCapabilities;
}

export interface PublicAiModel {
  id: string;
  model_id: string;
  display_name: string;
  provider_name: string | null;
  modality: ModelModality;
  icon_url: string | null;
  description: string | null;
  endpoint_types: ModelEndpointType[];
  reference_transfer_mode: ReferenceTransferMode;
  supports_reference_image: boolean;
  is_recommended: boolean;
  is_favorite: boolean;
  default_params: Record<string, unknown>;
  parameter_schema: ParameterSchemaField[];
  default_execution_profile: PublicDefaultExecutionProfile | null;
}

export interface AdminAiModel extends PublicAiModel {
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AdminExecutionProfile {
  id: string;
  ai_model_id: string;
  name: string;
  operation: ExecutionProfileOperation;
  adapter_key: string;
  adapter_version: string;
  transport_key: string;
  upstream_model_id: string;
  upstream_endpoint_path: string | null;
  reference_transfer_mode: ReferenceTransferMode;
  supports_reference_image: boolean;
  max_reference_images: number;
  parameter_schema: ParameterSchemaField[];
  default_params: Record<string, unknown>;
  request_mapping: Record<string, unknown>;
  response_parser_key: string;
  capabilities: Record<string, unknown>;
  validation_rules: Record<string, unknown>;
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  revisions?: AdminExecutionProfileRevision[];
}

export interface AdminExecutionProfileRevision {
  id: string;
  execution_profile_id: string;
  revision_no: number;
  status: ExecutionProfileRevisionStatus;
  source_kind: ExecutionProfileSourceKind;
  source_url: string | null;
  source_checked_at: string | null;
  source_summary: string | null;
  adapter_key: string;
  adapter_version: string;
  transport_key: string;
  upstream_model_id: string;
  upstream_endpoint_path: string | null;
  reference_transfer_mode: ReferenceTransferMode;
  supports_reference_image: boolean;
  max_reference_images: number;
  parameter_schema: ParameterSchemaField[];
  default_params: Record<string, unknown>;
  request_mapping: Record<string, unknown>;
  response_parser_key: string;
  capabilities: Record<string, unknown>;
  validation_rules: Record<string, unknown>;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
  activated_by: string | null;
  activated_at: string | null;
  archived_at: string | null;
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

export interface AiModelPayload {
  modality: ModelModality;
  model_id: string;
  display_name: string;
  provider_name: string | null;
  icon_url: string | null;
  description: string | null;
  endpoint_types: ModelEndpointType[];
  reference_transfer_mode: ReferenceTransferMode;
  supports_reference_image: boolean;
  is_enabled: boolean;
  is_recommended: boolean;
  sort_order: number;
  default_params: Record<string, unknown>;
  parameter_schema: ParameterSchemaField[];
}

export interface ExecutionProfilePayload {
  name?: string;
  operation?: ExecutionProfileOperation;
  adapter_key?: string;
  adapter_version?: string;
  transport_key?: string;
  upstream_model_id?: string;
  upstream_endpoint_path?: string | null;
  reference_transfer_mode?: ReferenceTransferMode;
  supports_reference_image?: boolean;
  max_reference_images?: number;
  parameter_schema?: ParameterSchemaField[];
  default_params?: Record<string, unknown>;
  request_mapping?: Record<string, unknown>;
  response_parser_key?: string;
  capabilities?: Record<string, unknown>;
  validation_rules?: Record<string, unknown>;
  is_default?: boolean;
  is_enabled?: boolean;
  sort_order?: number;
}

export interface ExecutionProfileRevisionPayload {
  source_kind?: ExecutionProfileSourceKind;
  source_url?: string | null;
  source_checked_at?: string | null;
  source_summary?: string | null;
  adapter_key?: string;
  adapter_version?: string;
  transport_key?: string;
  upstream_model_id?: string;
  upstream_endpoint_path?: string | null;
  reference_transfer_mode?: ReferenceTransferMode;
  supports_reference_image?: boolean;
  max_reference_images?: number;
  parameter_schema?: ParameterSchemaField[];
  default_params?: Record<string, unknown>;
  request_mapping?: Record<string, unknown>;
  response_parser_key?: string;
  capabilities?: Record<string, unknown>;
  validation_rules?: Record<string, unknown>;
  change_summary?: string | null;
}

export interface ExecutionProfileLintResult {
  ok: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
  dry_run?: boolean;
  message?: string;
}

export interface ExecutionProfilePreviewResult {
  adapter_key: string;
  adapter_version: string;
  transport_key: string;
  endpoint_path: string;
  content_type: string;
  body: Record<string, unknown>;
  reference_asset_ids: string[];
}

export interface ProfileTemplateSummary {
  id: string;
  label: string;
  description: string;
  category: ProfileTemplateCategory;
  tags: string[];
  source_kind: ExecutionProfileSourceKind | null;
  source_url: string | null;
  source_checked_at: string | null;
  adapter_key: string;
  operation: ExecutionProfileOperation;
  compatible_copy_allowed: boolean;
  compatible_warning: string;
}

export interface ExecutionProfileRevisionDiffResult {
  revision_id: string;
  against_revision_id: string | null;
  changes: Array<{
    field: string;
    before: unknown;
    after: unknown;
    changed: boolean;
  }>;
}

export interface ModelSyncSnapshotPayload {
  new_api_base_url?: string;
  api_key?: string;
}

export function fetchPublicModels(
  query: {
    modality?: ModelModality;
    recommended?: boolean;
    favorite?: boolean;
    q?: string;
  } = {},
) {
  const params = new URLSearchParams();
  if (query.modality) {
    params.set('modality', query.modality);
  }
  if (query.recommended !== undefined) {
    params.set('recommended', String(query.recommended));
  }
  if (query.favorite !== undefined) {
    params.set('favorite', String(query.favorite));
  }
  if (query.q) {
    params.set('q', query.q);
  }

  return apiRequest<{ items: PublicAiModel[] }>(`/api/v1/models${withQuery(params)}`, {
    cache: 'no-store',
  });
}

export function favoriteModel(modelId: string, csrfToken: string) {
  return apiRequest<{ favorited: boolean }>(`/api/v1/models/${modelId}/favorite`, {
    method: 'PUT',
    csrfToken,
  });
}

export function unfavoriteModel(modelId: string, csrfToken: string) {
  return apiRequest<{ favorited: boolean }>(`/api/v1/models/${modelId}/favorite`, {
    method: 'DELETE',
    csrfToken,
  });
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

export function fetchExecutionProfiles(modelId: string) {
  return apiRequest<{ items: AdminExecutionProfile[] }>(
    `/api/v1/admin/models/${modelId}/execution-profiles`,
    {
      cache: 'no-store',
    },
  );
}

export function createExecutionProfile(
  modelId: string,
  payload: ExecutionProfilePayload,
  csrfToken: string,
) {
  return apiRequest<{ item: AdminExecutionProfile }>(
    `/api/v1/admin/models/${modelId}/execution-profiles`,
    {
      method: 'POST',
      csrfToken,
      body: JSON.stringify(payload),
    },
  );
}

export function updateExecutionProfile(
  profileId: string,
  payload: ExecutionProfilePayload,
  csrfToken: string,
) {
  return apiRequest<{ item: AdminExecutionProfile }>(
    `/api/v1/admin/execution-profiles/${profileId}`,
    {
      method: 'PATCH',
      csrfToken,
      body: JSON.stringify(payload),
    },
  );
}

export function deleteExecutionProfile(profileId: string, csrfToken: string) {
  return apiRequest<{ deleted: boolean; item: AdminExecutionProfile }>(
    `/api/v1/admin/execution-profiles/${profileId}`,
    {
      method: 'DELETE',
      csrfToken,
    },
  );
}

export function createExecutionProfileRevision(
  profileId: string,
  payload: ExecutionProfileRevisionPayload,
  csrfToken: string,
) {
  return apiRequest<{ item: AdminExecutionProfileRevision }>(
    `/api/v1/admin/execution-profiles/${profileId}/revisions`,
    {
      method: 'POST',
      csrfToken,
      body: JSON.stringify(payload),
    },
  );
}

export function fetchProfileTemplates() {
  return apiRequest<{ items: ProfileTemplateSummary[] }>('/api/v1/admin/profile-templates', {
    cache: 'no-store',
  });
}

export function importProfileTemplateRevision(
  profileId: string,
  templateId: string,
  payload: {
    mode?: ProfileTemplateImportMode;
    upstream_model_id?: string;
  },
  csrfToken: string,
) {
  return apiRequest<{ item: AdminExecutionProfileRevision; template: ProfileTemplateSummary }>(
    `/api/v1/admin/execution-profiles/${profileId}/revisions/import-template/${templateId}`,
    {
      method: 'POST',
      csrfToken,
      body: JSON.stringify(payload),
    },
  );
}

export function diffExecutionProfileRevision(revisionId: string) {
  return apiRequest<{ diff: ExecutionProfileRevisionDiffResult }>(
    `/api/v1/admin/execution-profile-revisions/${revisionId}/diff`,
    {
      cache: 'no-store',
    },
  );
}

export function updateExecutionProfileRevision(
  revisionId: string,
  payload: ExecutionProfileRevisionPayload,
  csrfToken: string,
) {
  return apiRequest<{ item: AdminExecutionProfileRevision }>(
    `/api/v1/admin/execution-profile-revisions/${revisionId}`,
    {
      method: 'PATCH',
      csrfToken,
      body: JSON.stringify(payload),
    },
  );
}

export function lintExecutionProfileRevision(revisionId: string, csrfToken: string) {
  return apiRequest<{ result: ExecutionProfileLintResult }>(
    `/api/v1/admin/execution-profile-revisions/${revisionId}/lint`,
    {
      method: 'POST',
      csrfToken,
    },
  );
}

export function previewExecutionProfileRevision(
  revisionId: string,
  payload: {
    prompt?: string;
    parameters?: Record<string, unknown>;
    reference_asset_ids?: string[];
  },
  csrfToken: string,
) {
  return apiRequest<{ preview: ExecutionProfilePreviewResult }>(
    `/api/v1/admin/execution-profile-revisions/${revisionId}/preview-request`,
    {
      method: 'POST',
      csrfToken,
      body: JSON.stringify(payload),
    },
  );
}

export function testExecutionProfileRevision(revisionId: string, csrfToken: string) {
  return apiRequest<{ result: ExecutionProfileLintResult }>(
    `/api/v1/admin/execution-profile-revisions/${revisionId}/test`,
    {
      method: 'POST',
      csrfToken,
    },
  );
}

export function activateExecutionProfileRevision(revisionId: string, csrfToken: string) {
  return apiRequest<{ item: AdminExecutionProfileRevision }>(
    `/api/v1/admin/execution-profile-revisions/${revisionId}/activate`,
    {
      method: 'POST',
      csrfToken,
    },
  );
}

export function uploadModelIcon(file: File, csrfToken: string) {
  const formData = new FormData();
  formData.set('file', file);
  return apiRequest<{ url: string }>('/api/v1/admin/model-icons', {
    method: 'POST',
    csrfToken,
    body: formData,
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

export function modalityLabel(value: ModelModality) {
  switch (value) {
    case 'chat':
      return '聊天';
    case 'video':
      return '视频';
    default:
      return '图片';
  }
}

export function endpointTypeLabel(value: ModelEndpointType) {
  switch (value) {
    case 'openai_image_edits':
      return '图片编辑';
    case 'gemini_generate_content':
      return 'Gemini';
    default:
      return '图片生成';
  }
}

export function endpointTypeShortLabel(value: ModelEndpointType) {
  switch (value) {
    case 'openai_image_edits':
      return '编辑';
    case 'gemini_generate_content':
      return 'Gemini';
    default:
      return '生成';
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
