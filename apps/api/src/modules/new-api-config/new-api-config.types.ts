import type { NewApiConfigStatus } from '@prisma/client';
import type { SystemSettings } from '@dreamstudio/config';

export interface NewApiConfigBody {
  api_key?: unknown;
  new_api_base_url?: unknown;
  test_before_save?: unknown;
}

export interface NewApiConfigTestBody {
  api_key?: unknown;
  new_api_base_url?: unknown;
}

export type SystemSettingsBody = Partial<Record<keyof SystemSettings, unknown>>;

export interface PublicNewApiConfig {
  configured: boolean;
  new_api_base_url: string | null;
  uses_custom_base_url: boolean;
  masked_api_key: string | null;
  status: NewApiConfigStatus | 'missing';
  last_tested_at: string | null;
  last_test_error: string | null;
  allow_custom_base_url: boolean;
  default_new_api_base_url: string | null;
}

export interface ConnectionTestResult {
  ok: boolean;
  status: NewApiConfigStatus;
  model_count: number | null;
  tested_at: string;
  error: string | null;
}
