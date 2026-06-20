import { Module } from '@nestjs/common';

import { CsrfGuard } from '../auth/csrf.guard';
import { CookieService } from '../auth/cookie.service';
import { SessionService } from '../auth/session.service';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { AuditLogService } from '../new-api-config/audit-log.service';
import { EncryptionService } from '../new-api-config/encryption.service';
import { SystemSettingsService } from '../new-api-config/system-settings.service';
import { AdminStorageSettingsService } from './admin-storage-settings.service';
import { AssetsService } from './assets.service';
import {
  AdminStorageSettingsController,
  AssetItemController,
  AssetsController,
} from './storage.controller';

@Module({
  controllers: [AssetsController, AssetItemController, AdminStorageSettingsController],
  providers: [
    AdminStorageSettingsService,
    AssetsService,
    AuditLogService,
    CookieService,
    CsrfGuard,
    EncryptionService,
    SessionService,
    SuperAdminGuard,
    SystemSettingsService,
  ],
})
export class StorageModule {}
