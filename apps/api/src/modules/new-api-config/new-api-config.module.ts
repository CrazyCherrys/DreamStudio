import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditLogService } from './audit-log.service';
import {
  AdminSystemSettingsController,
  AdminUsersController,
  OwnNewApiConfigController,
} from './new-api-config.controller';
import { EncryptionService } from './encryption.service';
import { NewApiConfigService } from './new-api-config.service';
import { NewApiConnectionService } from './new-api-connection.service';
import { SystemSettingsService } from './system-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [OwnNewApiConfigController, AdminSystemSettingsController, AdminUsersController],
  providers: [
    AuditLogService,
    EncryptionService,
    NewApiConfigService,
    NewApiConnectionService,
    SystemSettingsService,
  ],
  exports: [AuditLogService, EncryptionService, NewApiConfigService, SystemSettingsService],
})
export class NewApiConfigModule {}
