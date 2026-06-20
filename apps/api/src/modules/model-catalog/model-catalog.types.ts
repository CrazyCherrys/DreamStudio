import type { ModelEndpointType, NewApiConfigStatus, ReferenceTransferMode } from '@prisma/client';

import type { ParameterSchemaField } from './parameter-schema';

export interface ModelCategoryBody {
  name?: unknown;
  slug?: unknown;
  icon?: unknown;
  sort_order?: unknown;
  is_enabled?: unknown;
}

export interface AiModelBody {
  category_id?: unknown;
  model_id?: unknown;
  display_name?: unknown;
  provider_name?: unknown;
  endpoint_type?: unknown;
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
  default_params: unknown;
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

export interface SavedConfigForSnapshot {
  status: NewApiConfigStatus | 'missing';
}
