export interface SystemSettings {
  default_new_api_base_url: string;
  allow_user_custom_new_api_base_url: boolean;
  registration_enabled: boolean;
  image_task_timeout_seconds: number;
  image_task_max_attempts: number;
  image_task_retry_backoff_seconds: number;
  per_user_running_task_limit: number;
  global_running_task_limit: number;
  request_log_retention_hours: number;
  audit_log_retention_hours: number;
  reference_image_max_mb: number;
  result_image_max_mb: number;
}

export type SystemSettingKey = keyof SystemSettings;
export type SettingKind = 'url' | 'boolean' | 'integer';

export interface SystemSettingDefinition {
  key: SystemSettingKey;
  kind: SettingKind;
  defaultValue: SystemSettings[SystemSettingKey];
  description: string;
  min?: number;
  max?: number;
}

export const SYSTEM_SETTING_DEFINITIONS: readonly SystemSettingDefinition[] = [
  {
    key: 'default_new_api_base_url',
    kind: 'url',
    defaultValue: '',
    description: 'Default new-api base URL. Configure in admin before M2 usage.',
  },
  {
    key: 'allow_user_custom_new_api_base_url',
    kind: 'boolean',
    defaultValue: true,
    description: 'Whether users may override the default new-api base URL.',
  },
  {
    key: 'registration_enabled',
    kind: 'boolean',
    defaultValue: true,
    description: 'Whether username/password registration is open.',
  },
  {
    key: 'image_task_timeout_seconds',
    kind: 'integer',
    defaultValue: 600,
    min: 30,
    max: 7200,
    description: 'Default image task timeout in seconds.',
  },
  {
    key: 'image_task_max_attempts',
    kind: 'integer',
    defaultValue: 3,
    min: 1,
    max: 10,
    description: 'Default maximum attempts for image generation tasks.',
  },
  {
    key: 'image_task_retry_backoff_seconds',
    kind: 'integer',
    defaultValue: 5,
    min: 1,
    max: 3600,
    description: 'Default retry backoff in seconds.',
  },
  {
    key: 'per_user_running_task_limit',
    kind: 'integer',
    defaultValue: 2,
    min: 1,
    max: 100,
    description: 'Default per-user running image task limit.',
  },
  {
    key: 'global_running_task_limit',
    kind: 'integer',
    defaultValue: 10,
    min: 1,
    max: 1000,
    description: 'Default global running image task limit.',
  },
  {
    key: 'request_log_retention_hours',
    kind: 'integer',
    defaultValue: 4320,
    min: 1,
    max: 87600,
    description: 'Default request log retention, 180 days.',
  },
  {
    key: 'audit_log_retention_hours',
    kind: 'integer',
    defaultValue: 8760,
    min: 1,
    max: 87600,
    description: 'Default audit log retention, 365 days.',
  },
  {
    key: 'reference_image_max_mb',
    kind: 'integer',
    defaultValue: 10,
    min: 1,
    max: 100,
    description: 'Maximum reference image upload size in MB.',
  },
  {
    key: 'result_image_max_mb',
    kind: 'integer',
    defaultValue: 25,
    min: 1,
    max: 100,
    description: 'Maximum generated result image size in MB.',
  },
] as const;

const defaultSystemSettingsEntries = SYSTEM_SETTING_DEFINITIONS.map((definition) => [
  definition.key,
  definition.defaultValue,
] as const);

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = Object.freeze(
  Object.fromEntries(defaultSystemSettingsEntries) as unknown as SystemSettings,
);

export const SYSTEM_SETTING_DEFINITIONS_BY_KEY = new Map(
  SYSTEM_SETTING_DEFINITIONS.map((setting) => [setting.key, setting]),
);

export function megabytesToBytes(valueMb: number) {
  return valueMb * 1024 * 1024;
}
