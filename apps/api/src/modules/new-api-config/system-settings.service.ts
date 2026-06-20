import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { prisma } from '@dreamstudio/db';

import { apiError, validationFailed } from '../auth/auth.errors';
import type { SystemSettingsBody } from './new-api-config.types';

type SettingKind = 'url' | 'boolean' | 'integer';

interface SettingDefinition {
  key: keyof SystemSettingsBody;
  kind: SettingKind;
  defaultValue: string | boolean | number;
  description: string;
  min?: number;
  max?: number;
}

export const SYSTEM_SETTING_DEFINITIONS: readonly SettingDefinition[] = [
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
] as const;

const DEFINITIONS_BY_KEY = new Map(
  SYSTEM_SETTING_DEFINITIONS.map((setting) => [setting.key, setting]),
);

@Injectable()
export class SystemSettingsService {
  async ensureDefaults() {
    for (const definition of SYSTEM_SETTING_DEFINITIONS) {
      await prisma.systemSetting.upsert({
        where: {
          key: definition.key,
        },
        create: {
          key: definition.key,
          value: definition.defaultValue as Prisma.InputJsonValue,
          description: definition.description,
        },
        update: {
          description: definition.description,
        },
      });
    }
  }

  async getPublicSettings() {
    await this.ensureDefaults();
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: SYSTEM_SETTING_DEFINITIONS.map((definition) => definition.key),
        },
      },
    });
    const values = new Map(settings.map((setting) => [setting.key, setting.value]));

    return Object.fromEntries(
      SYSTEM_SETTING_DEFINITIONS.map((definition) => [
        definition.key,
        this.normalizeStoredValue(definition, values.get(definition.key)),
      ]),
    ) as Record<keyof SystemSettingsBody, string | boolean | number>;
  }

  async getBoolean(key: keyof SystemSettingsBody, fallback: boolean): Promise<boolean> {
    const value = await this.getSettingValue(key);
    return typeof value === 'boolean' ? value : fallback;
  }

  async getNumber(key: keyof SystemSettingsBody, fallback: number): Promise<number> {
    const value = await this.getSettingValue(key);
    return typeof value === 'number' ? value : fallback;
  }

  async getString(key: keyof SystemSettingsBody, fallback = ''): Promise<string> {
    const value = await this.getSettingValue(key);
    return typeof value === 'string' ? value : fallback;
  }

  async updateSettings(body: SystemSettingsBody, actorUserId: string) {
    const parsed = this.validatePatch(body);
    await this.ensureDefaults();

    for (const [key, value] of Object.entries(parsed)) {
      const definition = DEFINITIONS_BY_KEY.get(key as keyof SystemSettingsBody);
      await prisma.systemSetting.upsert({
        where: {
          key,
        },
        create: {
          key,
          value: value as Prisma.InputJsonValue,
          description: definition?.description,
          updatedBy: actorUserId,
        },
        update: {
          value: value as Prisma.InputJsonValue,
          description: definition?.description,
          updatedBy: actorUserId,
        },
      });
    }

    return this.getPublicSettings();
  }

  validateBaseUrl(rawValue: unknown, field = 'new_api_base_url'): string {
    const value = typeof rawValue === 'string' ? rawValue.trim().replace(/\/+$/, '') : '';
    if (!value) {
      throw validationFailed([{ field, message: 'new-api Base URL 不能为空' }]);
    }

    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
        throw new Error('Invalid URL');
      }
      return url.toString().replace(/\/+$/, '');
    } catch {
      throw validationFailed([{ field, message: '请输入有效的 http(s) URL' }]);
    }
  }

  private async getSettingValue(key: keyof SystemSettingsBody) {
    const definition = DEFINITIONS_BY_KEY.get(key);
    if (!definition) {
      throw apiError(HttpStatus.INTERNAL_SERVER_ERROR, 'internal_error', `Unknown setting: ${key}`);
    }

    const setting = await prisma.systemSetting.findUnique({
      where: {
        key,
      },
    });

    return this.normalizeStoredValue(definition, setting?.value);
  }

  private validatePatch(
    body: SystemSettingsBody,
  ): Partial<Record<keyof SystemSettingsBody, unknown>> {
    const parsed: Partial<Record<keyof SystemSettingsBody, unknown>> = {};
    const details: Array<{ field: string; message: string }> = [];

    for (const [key, rawValue] of Object.entries(body)) {
      const definition = DEFINITIONS_BY_KEY.get(key as keyof SystemSettingsBody);
      if (!definition) {
        details.push({ field: key, message: '不允许更新该设置' });
        continue;
      }

      try {
        parsed[definition.key] = this.parseValue(definition, rawValue);
      } catch (error) {
        details.push({
          field: definition.key,
          message: error instanceof Error ? error.message : '设置值无效',
        });
      }
    }

    if (Object.keys(parsed).length === 0 && details.length === 0) {
      details.push({ field: 'settings', message: '至少提交一个设置项' });
    }

    if (details.length > 0) {
      throw validationFailed(details);
    }

    return parsed;
  }

  private parseValue(definition: SettingDefinition, rawValue: unknown) {
    if (definition.kind === 'url') {
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        return '';
      }
      return this.validateBaseUrl(rawValue, definition.key);
    }

    if (definition.kind === 'boolean') {
      if (typeof rawValue !== 'boolean') {
        throw new Error('必须是布尔值');
      }
      return rawValue;
    }

    const parsed =
      typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string'
          ? Number.parseInt(rawValue, 10)
          : Number.NaN;
    if (
      !Number.isInteger(parsed) ||
      (definition.min !== undefined && parsed < definition.min) ||
      (definition.max !== undefined && parsed > definition.max)
    ) {
      throw new Error(`必须是 ${definition.min}-${definition.max} 之间的整数`);
    }

    return parsed;
  }

  private normalizeStoredValue(definition: SettingDefinition, value: unknown) {
    if (definition.kind === 'boolean') {
      return typeof value === 'boolean' ? value : definition.defaultValue;
    }

    if (definition.kind === 'integer') {
      return typeof value === 'number' && Number.isInteger(value) ? value : definition.defaultValue;
    }

    return typeof value === 'string' ? value : definition.defaultValue;
  }
}
