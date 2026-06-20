import { HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import {
  getActiveStorageSettingRecord,
  prepareStorageSettingsUpdate,
  resolvePreparedStorageSettings,
  resolveStorageSettings,
  sanitizeStorageError,
  saveStorageSettingsUpdate,
  serializePublicStorageSettings,
  StorageValidationError,
  testResolvedStorageSettings,
} from '@dreamstudio/storage';

import { apiError, validationFailed } from '../auth/auth.errors';
import type { SessionContext } from '../auth/auth.types';
import { AuditLogService } from '../new-api-config/audit-log.service';
import { EncryptionService } from '../new-api-config/encryption.service';
import type { StorageSettingsBody } from './storage.types';

@Injectable()
export class AdminStorageSettingsService {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getSettings() {
    return serializePublicStorageSettings(await getActiveStorageSettingRecord());
  }

  async updateSettings(body: StorageSettingsBody, session: SessionContext, request: Request) {
    const existing = await getActiveStorageSettingRecord();
    const prepared = this.prepare(body, existing, session.userId);
    const saved = await saveStorageSettingsUpdate(prepared);

    if (prepared.changedFields.length > 0) {
      await this.auditLogService.write({
        action: 'admin_update_storage_settings',
        targetType: 'storage_setting',
        targetId: saved.id,
        session,
        request,
        metadata: {
          changed_fields: prepared.changedFields,
          driver: saved.driver,
          s3_access_key: prepared.changedFields.includes('maskedS3AccessKey')
            ? '[updated]'
            : '[unchanged]',
          s3_secret_key: prepared.changedFields.includes('maskedS3SecretKey')
            ? '[updated]'
            : '[unchanged]',
        },
      });
    }

    return serializePublicStorageSettings(saved);
  }

  async testSettings(body: StorageSettingsBody, session: SessionContext, request: Request) {
    const existing = await getActiveStorageSettingRecord();
    const prepared =
      Object.keys(body).length > 0
        ? this.prepare(body, existing, session.userId)
        : {
            data: null,
            changedFields: [],
          };

    try {
      const resolved = prepared.data
        ? resolvePreparedStorageSettings(prepared.data, this.encryptionService)
        : await resolveStorageSettings(this.encryptionService);
      await testResolvedStorageSettings(resolved);
      await this.auditLogService.write({
        action: 'admin_test_storage_settings',
        targetType: 'storage_setting',
        targetId: resolved.id,
        session,
        request,
        metadata: {
          driver: resolved.driver,
          result: 'success',
        },
      });
      return {
        ok: true,
        tested_at: new Date().toISOString(),
      };
    } catch (error) {
      await this.auditLogService.write({
        action: 'admin_test_storage_settings',
        targetType: 'storage_setting',
        targetId: existing?.id ?? null,
        result: 'failed',
        session,
        request,
        metadata: {
          driver: existing?.driver ?? body.driver ?? 'local',
          result: 'failed',
          error: sanitizeStorageError(error),
        },
      });
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'storage_test_failed',
        `存储测试失败：${sanitizeStorageError(error)}`,
      );
    }
  }

  private prepare(
    body: StorageSettingsBody,
    existing: Awaited<ReturnType<typeof getActiveStorageSettingRecord>>,
    updatedBy: string,
  ) {
    try {
      return prepareStorageSettingsUpdate({
        body,
        codec: this.encryptionService,
        existing,
        updatedBy,
      });
    } catch (error) {
      if (error instanceof StorageValidationError) {
        throw validationFailed([{ field: error.field, message: error.message }]);
      }
      throw error;
    }
  }
}
