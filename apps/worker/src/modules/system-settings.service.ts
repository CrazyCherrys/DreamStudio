import { Injectable } from '@nestjs/common';

import {
  DEFAULT_SYSTEM_SETTINGS,
  SYSTEM_SETTING_DEFINITIONS_BY_KEY,
  type SystemSettings,
} from '@dreamstudio/config';
import { prisma } from '@dreamstudio/db';

@Injectable()
export class WorkerSystemSettingsService {
  async getNumber(key: keyof SystemSettings, fallback?: number): Promise<number> {
    const definition = SYSTEM_SETTING_DEFINITIONS_BY_KEY.get(key);
    if (!definition || definition.kind !== 'integer') {
      throw new Error(`Unknown integer system setting: ${key}`);
    }

    const setting = await prisma.systemSetting.findUnique({
      where: {
        key,
      },
    });
    const value = setting?.value;
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }

    return fallback ?? (DEFAULT_SYSTEM_SETTINGS[key] as number);
  }
}
