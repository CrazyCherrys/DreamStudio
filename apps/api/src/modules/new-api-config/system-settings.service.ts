import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  DEFAULT_SYSTEM_SETTINGS,
  SYSTEM_SETTING_DEFINITIONS,
  SYSTEM_SETTING_DEFINITIONS_BY_KEY,
  type SystemSettingDefinition,
  type SystemSettings,
} from '@dreamstudio/config';
import { prisma } from '@dreamstudio/db';

import { apiError, validationFailed } from '../auth/auth.errors';
import type { SystemSettingsBody } from './new-api-config.types';

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
    ) as unknown as SystemSettings;
  }

  async getBoolean(key: keyof SystemSettings, fallback: boolean): Promise<boolean> {
    const value = await this.getSettingValue(key);
    return typeof value === 'boolean' ? value : fallback;
  }

  async getNumber(key: keyof SystemSettings, fallback: number): Promise<number> {
    const value = await this.getSettingValue(key);
    return typeof value === 'number' ? value : fallback;
  }

  async getString(key: keyof SystemSettings, fallback = ''): Promise<string> {
    const value = await this.getSettingValue(key);
    return typeof value === 'string' ? value : fallback;
  }

  async updateSettings(body: SystemSettingsBody, actorUserId: string) {
    const parsed = this.validatePatch(body);
    await this.ensureDefaults();

    for (const [key, value] of Object.entries(parsed)) {
      const definition = SYSTEM_SETTING_DEFINITIONS_BY_KEY.get(key as keyof SystemSettings);
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

  private async getSettingValue(key: keyof SystemSettings) {
    const definition = SYSTEM_SETTING_DEFINITIONS_BY_KEY.get(key);
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
  ): Partial<Record<keyof SystemSettings, unknown>> {
    const parsed: Partial<Record<keyof SystemSettings, unknown>> = {};
    const details: Array<{ field: string; message: string }> = [];

    for (const [key, rawValue] of Object.entries(body)) {
      const definition = SYSTEM_SETTING_DEFINITIONS_BY_KEY.get(key as keyof SystemSettings);
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

  private parseValue(definition: SystemSettingDefinition, rawValue: unknown) {
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

  private normalizeStoredValue(definition: SystemSettingDefinition, value: unknown) {
    if (definition.kind === 'boolean') {
      return typeof value === 'boolean'
        ? value
        : (DEFAULT_SYSTEM_SETTINGS[definition.key] as boolean);
    }

    if (definition.kind === 'integer') {
      return typeof value === 'number' && Number.isInteger(value)
        ? value
        : (DEFAULT_SYSTEM_SETTINGS[definition.key] as number);
    }

    return typeof value === 'string' ? value : (DEFAULT_SYSTEM_SETTINGS[definition.key] as string);
  }
}
