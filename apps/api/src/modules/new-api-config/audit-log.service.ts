import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '@dreamstudio/db';

import type { SessionContext } from '../auth/auth.types';
import { SystemSettingsService } from './system-settings.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  async write({
    action,
    targetId,
    targetType,
    request,
    result = 'success',
    metadata,
    session,
  }: {
    action: string;
    targetType: string;
    targetId?: string | null;
    result?: 'success' | 'failed';
    metadata?: Prisma.InputJsonValue;
    request?: Request;
    session?: SessionContext;
  }) {
    const retentionHours = await this.systemSettingsService.getNumber(
      'audit_log_retention_hours',
      8760,
    );
    const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000);

    await prisma.auditLog.create({
      data: {
        actorUserId: session?.userId ?? null,
        action,
        targetType,
        targetId: targetId ?? null,
        result,
        ipAddress: request ? this.getClientIp(request) : undefined,
        userAgent: request?.header('user-agent'),
        metadata,
        expiresAt,
      },
    });
  }

  private getClientIp(request: Request): string | undefined {
    return request.ip ?? request.socket.remoteAddress ?? undefined;
  }
}
