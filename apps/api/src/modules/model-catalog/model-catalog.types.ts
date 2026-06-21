import type {
  ExecutionProfileOperation,
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
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
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
