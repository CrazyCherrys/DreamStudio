import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Put,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { CsrfGuard } from '../auth/csrf.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuditLogService } from './audit-log.service';
import { NewApiConfigService } from './new-api-config.service';
import type {
  NewApiConfigBody,
  NewApiConfigTestBody,
  SystemSettingsBody,
} from './new-api-config.types';
import { SystemSettingsService } from './system-settings.service';

@Controller('me/new-api-config')
@UseGuards(SessionAuthGuard)
export class OwnNewApiConfigController {
  constructor(private readonly newApiConfigService: NewApiConfigService) {}

  @Get()
  getOwnConfig(@Req() request: AuthenticatedRequest) {
    return this.newApiConfigService.getOwnConfig(request.auth!);
  }

  @Put()
  @UseGuards(CsrfGuard)
  saveOwnConfig(@Body() body: NewApiConfigBody, @Req() request: AuthenticatedRequest & Request) {
    return this.newApiConfigService.saveOwnConfig(body, request.auth!, request);
  }

  @Post('test')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  testOwnConfig(@Body() body: NewApiConfigTestBody, @Req() request: AuthenticatedRequest) {
    return this.newApiConfigService.testOwnConfig(body, request.auth!);
  }
}

@Controller('admin/system-settings')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminSystemSettingsController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  @Get()
  getSettings() {
    return this.systemSettingsService.getPublicSettings();
  }

  @Patch()
  @UseGuards(CsrfGuard)
  async updateSettings(@Body() body: SystemSettingsBody, @Req() request: AuthenticatedRequest) {
    const before = await this.systemSettingsService.getPublicSettings();
    const settings = await this.systemSettingsService.updateSettings(body, request.auth!.userId);
    const changedKeys = Object.keys(body).filter(
      (key) =>
        before[key as keyof SystemSettingsBody] !== settings[key as keyof SystemSettingsBody],
    );

    for (const key of changedKeys) {
      await this.auditLogService.write({
        action: `admin_update_system_setting:${key}`,
        targetType: 'system_setting',
        targetId: null,
        session: request.auth!,
        request,
        metadata: {
          key,
        },
      });
    }

    return settings;
  }
}

@Controller('admin/users')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminUsersController {
  constructor(private readonly newApiConfigService: NewApiConfigService) {}

  @Put(':user_id/new-api-config')
  @UseGuards(CsrfGuard)
  saveUserConfig(
    @Param('user_id') userId: string,
    @Body() body: NewApiConfigBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.newApiConfigService.saveUserConfigByAdmin(userId, body, request.auth!, request);
  }

  @Delete(':user_id/new-api-config')
  @UseGuards(CsrfGuard)
  deleteUserConfig(
    @Param('user_id') userId: string,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.newApiConfigService.deleteUserConfigByAdmin(userId, request.auth!, request);
  }
}
