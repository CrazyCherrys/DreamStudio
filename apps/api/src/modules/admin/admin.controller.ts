import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { CsrfGuard } from '../auth/csrf.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AdminService } from './admin.service';
import type {
  AdminAuditLogListQuery,
  AdminRequestLogListQuery,
  AdminResetPasswordBody,
  AdminUserListQuery,
  AdminUserStatusBody,
} from './admin.types';

@Controller('admin/users')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminUsersManagementController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  listUsers(@Query() query: AdminUserListQuery) {
    return this.adminService.listUsers(query);
  }

  @Get(':user_id')
  getUser(@Param('user_id') userId: string) {
    return this.adminService.getUser(userId);
  }

  @Patch(':user_id/status')
  @UseGuards(CsrfGuard)
  updateUserStatus(
    @Param('user_id') userId: string,
    @Body() body: AdminUserStatusBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.adminService.updateUserStatus(userId, body, request.auth!, request);
  }

  @Post(':user_id/reset-password')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  resetUserPassword(
    @Param('user_id') userId: string,
    @Body() body: AdminResetPasswordBody,
    @Req() request: AuthenticatedRequest & Request,
  ) {
    return this.adminService.resetUserPassword(userId, body, request.auth!, request);
  }
}

@Controller('admin/request-logs')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminRequestLogsController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  listRequestLogs(@Query() query: AdminRequestLogListQuery) {
    return this.adminService.listRequestLogs(query);
  }

  @Get(':log_id')
  getRequestLog(@Param('log_id') logId: string) {
    return this.adminService.getRequestLog(logId);
  }

  @Post(':log_id/reveal-prompt')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  revealPrompt(@Param('log_id') logId: string, @Req() request: AuthenticatedRequest & Request) {
    return this.adminService.revealRequestLogPrompt(logId, request.auth!, request);
  }

  @Post(':log_id/reveal-params')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  revealParams(@Param('log_id') logId: string, @Req() request: AuthenticatedRequest & Request) {
    return this.adminService.revealRequestLogParams(logId, request.auth!, request);
  }
}

@Controller('admin/audit-logs')
@UseGuards(SessionAuthGuard, SuperAdminGuard)
export class AdminAuditLogsController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  listAuditLogs(@Query() query: AdminAuditLogListQuery) {
    return this.adminService.listAuditLogs(query);
  }

  @Get(':log_id')
  getAuditLog(@Param('log_id') logId: string) {
    return this.adminService.getAuditLog(logId);
  }
}
