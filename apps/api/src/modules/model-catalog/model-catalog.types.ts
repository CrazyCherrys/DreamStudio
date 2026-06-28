import type {
  ExecutionProfileRevisionStatus,
  ExecutionProfileOperation,
  ExecutionProfileSourceKind,
  ModelEndpointType,
  ModelModality,
  NewApiConfigStatus,
  ReferenceTransferMode,
} from '@prisma/client';

import type { ParameterSchemaField } from './parameter-schema';

export interface AiModelBody {
  modality?: unknown;
  model_id?: unknown;
  display_name?: unknown;
  provider_name?: unknown;
  icon_url?: unknown;
  description?: unknown;
  endpoint_types?: unknown;
  reference_transfer_mode?: unknown;
  supports_reference_image?: unknown;
  is_enabled?: unknown;
  is_recommended?: unknown;
  sort_order?: unknown;
  default_params?: unknown;
  parameter_schema?: unknown;
}

export interface ModelSyncSnapshotBody {
  new_api_base_url?: unknown;
  api_key?: unknown;
}

export interface ExecutionProfileBody {
  name?: unknown;
  operation?: unknown;
  adapter_key?: unknown;
  adapter_version?: unknown;
  transport_key?: unknown;
  upstream_model_id?: unknown;
  upstream_endpoint_path?: unknown;
  reference_transfer_mode?: unknown;
  supports_reference_image?: unknown;
  max_reference_images?: unknown;
  parameter_schema?: unknown;
  default_params?: unknown;
  request_mapping?: unknown;
  response_parser_key?: unknown;
  capabilities?: unknown;
  validation_rules?: unknown;
  is_default?: unknown;
  is_enabled?: unknown;
  sort_order?: unknown;
}

export interface ExecutionProfileRevisionBody {
  source_kind?: unknown;
  source_url?: unknown;
  source_checked_at?: unknown;
  source_summary?: unknown;
  adapter_key?: unknown;
  adapter_version?: unknown;
  transport_key?: unknown;
  upstream_model_id?: unknown;
  upstream_endpoint_path?: unknown;
  reference_transfer_mode?: unknown;
  supports_reference_image?: unknown;
  max_reference_images?: unknown;
  parameter_schema?: unknown;
  default_params?: unknown;
  request_mapping?: unknown;
  response_parser_key?: unknown;
  capabilities?: unknown;
  validation_rules?: unknown;
  change_summary?: unknown;
}

export interface ExecutionProfilePreviewBody {
  prompt?: unknown;
  parameters?: unknown;
  reference_asset_ids?: unknown;
}

export type ProfileTemplateCategory = 'gemini_official' | 'openai_official' | 'openai_compatible';
export type ProfileTemplateImportMode = 'template' | 'openai_compatible_copy';

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
  runtime_supported: boolean;
  publishable: boolean;
  blocked_reason: string | null;
  compatible_copy_allowed: boolean;
  compatible_warning: string;
}

export interface ProfileTemplateImportBody {
  mode?: unknown;
  upstream_model_id?: unknown;
}

export interface ExecutionProfileRevisionDiffResult {
  against_revision_id: string | null;
  revision_id: string;
  changes: Array<{
    field: string;
    before: unknown;
    after: unknown;
    changed: boolean;
  }>;
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
  default_params: unknown;
  parameter_schema: ParameterSchemaField[];
  default_execution_profile: PublicDefaultExecutionProfile | null;
}

export interface AdminAiModel extends PublicAiModel {
  management_summary: {
    profile_count: number;
    draft_revision_count: number;
    active_revision_count: number;
    latest_draft_profile_id: string | null;
    latest_draft_revision_id: string | null;
    has_default_active_profile: boolean;
  };
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
  default_params: unknown;
  request_mapping: unknown;
  response_parser_key: string;
  capabilities: unknown;
  validation_rules: unknown;
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
  default_params: unknown;
  request_mapping: unknown;
  response_parser_key: string;
  capabilities: unknown;
  validation_rules: unknown;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
  activated_by: string | null;
  activated_at: string | null;
  archived_at: string | null;
}

export interface ExecutionProfileLintResult {
  ok: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

export interface ExecutionProfilePreviewResult {
  adapter_key: string;
  adapter_version: string;
  transport_key: string;
  endpoint_path: string;
  content_type: string;
  body: Record<string, unknown>;
  reference_asset_ids: string[];
  runtime_supported: boolean;
  publishable: boolean;
  parser_key: string;
  publish_blockers: Array<{ field: string; message: string }>;
}

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
  default_params: unknown;
  capabilities: PublicExecutionProfileCapabilities;
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

export interface SavedConfigForSnapshot {
  status: NewApiConfigStatus | 'missing';
}
