import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NewApiConfigModule } from '../new-api-config/new-api-config.module';
import {
  AdminAuditLogsController,
  AdminRequestLogsController,
  AdminUsersManagementController,
} from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, NewApiConfigModule],
  controllers: [
    AdminUsersManagementController,
    AdminRequestLogsController,
    AdminAuditLogsController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
