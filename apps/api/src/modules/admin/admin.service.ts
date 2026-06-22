import { HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  Prisma,
  type AuditLog,
  type AuditResult,
  type RequestLog,
  type RequestLogStatus,
  type UserStatus,
} from '@prisma/client';

import { prisma } from '@dreamstudio/db';

import { apiError, validationFailed } from '../auth/auth.errors';
import { PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import type { SessionContext } from '../auth/auth.types';
import { AuditLogService } from '../new-api-config/audit-log.service';
import { EncryptionService } from '../new-api-config/encryption.service';
import type {
  AdminAuditLogListQuery,
  AdminRequestLogListQuery,
  AdminResetPasswordBody,
  AdminUserListQuery,
  AdminUserStatusBody,
} from './admin.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 100;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;
const SENSITIVE_KEY_PATTERN =
  /(api[_-]?key|authorization|secret|token|password|credential|access[_-]?key|secret[_-]?key)/i;
const URL_KEY_PATTERN = /(url|uri|endpoint|base[_-]?url|path|object[_-]?key|bucket)/i;

@Injectable()
export class AdminService {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly encryptionService: EncryptionService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async listUsers(query: AdminUserListQuery) {
    const page = this.parsePositiveInt(query.page, 1, 1, 100000);
    const pageSize = this.parsePositiveInt(query.page_size, 20, 1, MAX_PAGE_SIZE);
    const keyword = this.readOptionalString(query.keyword);
    const status = this.readOptionalUserStatus(query.status);
    const where: Prisma.UserWhereInput = {
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword, mode: 'insensitive' } },
              { displayName: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          newApiConfig: true,
          _count: {
            select: {
              sessions: {
                where: {
                  revokedAt: null,
                  expiresAt: {
                    gt: new Date(),
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: items.map((user) => ({
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        role: user.role,
        status: user.status,
        last_login_at: user.lastLoginAt?.toISOString() ?? null,
        created_at: user.createdAt.toISOString(),
        disabled_at: user.disabledAt?.toISOString() ?? null,
        deleted_at: user.deletedAt?.toISOString() ?? null,
        new_api_config_status: user.newApiConfig?.status ?? 'missing',
        masked_api_key: user.newApiConfig?.maskedApiKey ?? null,
        active_session_count: user._count.sessions,
      })),
      pagination: this.pagination(page, pageSize, total),
    };
  }

  async getUser(userId: string) {
    this.assertUuid(userId, 'user_id');
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        newApiConfig: true,
        sessions: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
        },
        _count: {
          select: {
            imageTasks: true,
            requestLogs: true,
          },
        },
      },
    });

    if (!user) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '用户不存在');
    }

    const activeSessionCount = user.sessions.filter(
      (session) => !session.revokedAt && session.expiresAt > new Date(),
    ).length;

    return {
      item: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        role: user.role,
        status: user.status,
        last_login_at: user.lastLoginAt?.toISOString() ?? null,
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString(),
        disabled_at: user.disabledAt?.toISOString() ?? null,
        deleted_at: user.deletedAt?.toISOString() ?? null,
        new_api_config: {
          configured: Boolean(user.newApiConfig),
          status: user.newApiConfig?.status ?? 'missing',
          masked_api_key: user.newApiConfig?.maskedApiKey ?? null,
          uses_custom_base_url: user.newApiConfig?.usesCustomBaseUrl ?? false,
          base_url_host: user.newApiConfig ? this.safeHost(user.newApiConfig.newApiBaseUrl) : null,
          last_tested_at: user.newApiConfig?.lastTestedAt?.toISOString() ?? null,
          last_test_error: user.newApiConfig?.lastTestError ?? null,
        },
        session_summary: {
          active_count: activeSessionCount,
          recent: user.sessions.slice(0, 5).map((session) => ({
            id: session.id,
            ip_address: session.ipAddress,
            user_agent_summary: summarizeUserAgent(session.userAgent),
            expires_at: session.expiresAt.toISOString(),
            revoked_at: session.revokedAt?.toISOString() ?? null,
            created_at: session.createdAt.toISOString(),
          })),
        },
        activity_summary: {
          image_task_count: user._count.imageTasks,
          request_log_count: user._count.requestLogs,
        },
      },
    };
  }

  async updateUserStatus(
    userId: string,
    body: AdminUserStatusBody,
    session: SessionContext,
    request: Request,
  ) {
    this.assertUuid(userId, 'user_id');
    const status = this.readRequiredUserStatus(body.status);
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '用户不存在');
    }

    const now = new Date();
    const updated = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        status,
        disabledAt: status === 'disabled' ? (user.disabledAt ?? now) : null,
        deletedAt: status === 'deleted' ? (user.deletedAt ?? now) : null,
      },
    });

    if (status === 'disabled' || status === 'deleted') {
      await this.sessionService.revokeUserSessions(userId);
    }

    await this.auditLogService.write({
      action:
        status === 'active'
          ? 'admin_enable_user'
          : status === 'disabled'
            ? 'admin_disable_user'
            : 'admin_soft_delete_user',
      targetType: 'user',
      targetId: userId,
      session,
      request,
      metadata: {
        previous_status: user.status,
        next_status: status,
      },
    });

    return {
      item: {
        id: updated.id,
        username: updated.username,
        display_name: updated.displayName,
        role: updated.role,
        status: updated.status,
        last_login_at: updated.lastLoginAt?.toISOString() ?? null,
        disabled_at: updated.disabledAt?.toISOString() ?? null,
        deleted_at: updated.deletedAt?.toISOString() ?? null,
      },
    };
  }

  async resetUserPassword(
    userId: string,
    body: AdminResetPasswordBody,
    session: SessionContext,
    request: Request,
  ) {
    this.assertUuid(userId, 'user_id');
    const newPassword = this.readPassword(body.new_password);
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '用户不存在');
    }

    const passwordHash = await this.passwordService.hashPassword(newPassword);
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
      },
    });
    await this.sessionService.revokeUserSessions(userId);
    await this.auditLogService.write({
      action: 'admin_reset_user_password',
      targetType: 'user',
      targetId: userId,
      session,
      request,
      metadata: {
        target_username: user.username,
        password: '[redacted]',
      },
    });

    return {
      reset: true,
      user_id: userId,
    };
  }

  async listRequestLogs(query: AdminRequestLogListQuery) {
    const page = this.parsePositiveInt(query.page, 1, 1, 100000);
    const pageSize = this.parsePositiveInt(query.page_size, 20, 1, MAX_PAGE_SIZE);
    const status = this.readOptionalRequestLogStatus(query.status);
    const modelId = this.readOptionalString(query.model_id);
    const keyword = this.readOptionalString(query.keyword);
    const userId = this.readOptionalUuid(query.user_id, 'user_id');
    const dateRange = this.readDateRange(query.date_from, query.date_to);
    const where: Prisma.RequestLogWhereInput = {
      ...(status ? { status } : {}),
      ...(modelId ? { modelId: { contains: modelId, mode: 'insensitive' } } : {}),
      ...(userId ? { userId } : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
      ...(keyword
        ? {
            OR: [
              { promptSummary: { contains: keyword, mode: 'insensitive' } },
              { modelId: { contains: keyword, mode: 'insensitive' } },
              { errorCode: { contains: keyword, mode: 'insensitive' } },
              { errorMessage: { contains: keyword, mode: 'insensitive' } },
              { user: { username: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.requestLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
          task: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.requestLog.count({ where }),
    ]);

    return {
      items: items.map((log) => this.serializeRequestLogSummary(log)),
      pagination: this.pagination(page, pageSize, total),
    };
  }

  async getRequestLog(logId: string) {
    this.assertUuid(logId, 'log_id');
    const log = await prisma.requestLog.findUnique({
      where: {
        id: logId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        task: {
          select: {
            id: true,
            status: true,
            clientRequestId: true,
            createdAt: true,
            completedAt: true,
          },
        },
        attempt: {
          select: {
            id: true,
            attemptNo: true,
            status: true,
            httpStatus: true,
            errorCode: true,
            errorMessage: true,
          },
        },
      },
    });

    if (!log) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '请求日志不存在');
    }

    return {
      item: this.serializeRequestLogDetail(log),
    };
  }

  async revealRequestLogPrompt(logId: string, session: SessionContext, request: Request) {
    return this.revealRequestLogSecret(logId, 'prompt', session, request);
  }

  async revealRequestLogParams(logId: string, session: SessionContext, request: Request) {
    return this.revealRequestLogSecret(logId, 'params', session, request);
  }

  async listAuditLogs(query: AdminAuditLogListQuery) {
    const page = this.parsePositiveInt(query.page, 1, 1, 100000);
    const pageSize = this.parsePositiveInt(query.page_size, 20, 1, MAX_PAGE_SIZE);
    const actorUserId = this.readOptionalUuid(query.actor_user_id, 'actor_user_id');
    const action = this.readOptionalString(query.action);
    const targetType = this.readOptionalString(query.target_type);
    const result = this.readOptionalAuditResult(query.result);
    const dateRange = this.readDateRange(query.date_from, query.date_to);
    const where: Prisma.AuditLogWhereInput = {
      ...(actorUserId ? { actorUserId } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
      ...(targetType ? { targetType: { contains: targetType, mode: 'insensitive' } } : {}),
      ...(result ? { result } : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((log) => this.serializeAuditLog(log)),
      pagination: this.pagination(page, pageSize, total),
    };
  }

  async getAuditLog(logId: string) {
    this.assertUuid(logId, 'log_id');
    const log = await prisma.auditLog.findUnique({
      where: {
        id: logId,
      },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    if (!log) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '审计日志不存在');
    }

    return {
      item: this.serializeAuditLog(log),
    };
  }

  private async revealRequestLogSecret(
    logId: string,
    kind: 'prompt' | 'params',
    session: SessionContext,
    request: Request,
  ) {
    this.assertUuid(logId, 'log_id');
    const log = await prisma.requestLog.findUnique({
      where: {
        id: logId,
      },
      select: {
        id: true,
        encryptedPrompt: true,
        promptIv: true,
        promptTag: true,
        encryptedParams: true,
        paramsIv: true,
        paramsTag: true,
      },
    });

    if (!log) {
      await this.auditLogService.write({
        action:
          kind === 'prompt' ? 'admin_reveal_request_log_prompt' : 'admin_reveal_request_log_params',
        targetType: 'request_log',
        targetId: null,
        result: 'failed',
        session,
        request,
        metadata: {
          requested_log_id: logId,
          reason: 'not_found',
        },
      });
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '请求日志不存在');
    }

    try {
      const value =
        kind === 'prompt' ? this.decryptRequestLogPrompt(log) : this.decryptRequestLogParams(log);
      await this.auditLogService.write({
        action:
          kind === 'prompt' ? 'admin_reveal_request_log_prompt' : 'admin_reveal_request_log_params',
        targetType: 'request_log',
        targetId: log.id,
        session,
        request,
        metadata: {
          revealed: kind,
        },
      });

      return kind === 'prompt'
        ? {
            log_id: log.id,
            prompt: value,
          }
        : {
            log_id: log.id,
            params: value,
          };
    } catch {
      await this.auditLogService.write({
        action:
          kind === 'prompt' ? 'admin_reveal_request_log_prompt' : 'admin_reveal_request_log_params',
        targetType: 'request_log',
        targetId: log.id,
        result: 'failed',
        session,
        request,
        metadata: {
          revealed: kind,
          reason: 'decrypt_failed_or_missing',
        },
      });
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'request_log_secret_unavailable',
        kind === 'prompt' ? '完整 Prompt 不可用或无法解密' : '完整参数不可用或无法解密',
      );
    }
  }

  private decryptRequestLogPrompt(log: {
    encryptedPrompt: string | null;
    promptIv: string | null;
    promptTag: string | null;
  }) {
    if (!log.encryptedPrompt || !log.promptIv || !log.promptTag) {
      throw new Error('prompt unavailable');
    }

    return this.encryptionService.decryptSecret({
      encrypted: log.encryptedPrompt,
      iv: log.promptIv,
      tag: log.promptTag,
      keyVersion: 1,
    });
  }

  private decryptRequestLogParams(log: {
    encryptedParams: string | null;
    paramsIv: string | null;
    paramsTag: string | null;
  }) {
    if (!log.encryptedParams || !log.paramsIv || !log.paramsTag) {
      throw new Error('params unavailable');
    }

    const decrypted = this.encryptionService.decryptSecret({
      encrypted: log.encryptedParams,
      iv: log.paramsIv,
      tag: log.paramsTag,
      keyVersion: 1,
    });
    try {
      return sanitizeJson(JSON.parse(decrypted));
    } catch {
      return '[invalid-json]';
    }
  }

  private serializeRequestLogSummary(
    log: RequestLog & {
      user?: { id: string; username: string; displayName: string | null };
      task?: { id: string; status: string };
    },
  ) {
    return {
      id: log.id,
      user: log.user
        ? {
            id: log.user.id,
            username: log.user.username,
            display_name: log.user.displayName,
          }
        : null,
      task: log.task
        ? {
            id: log.task.id,
            status: log.task.status,
          }
        : null,
      model_id: log.modelId,
      endpoint_type: log.endpointType,
      adapter_key: log.adapterKey,
      adapter_version: log.adapterVersion,
      execution_profile_id: log.executionProfileId,
      execution_profile_revision_id: log.executionProfileRevisionId,
      status: log.status,
      http_status: log.httpStatus,
      duration_ms: log.durationMs,
      new_api_base_url_host: log.newApiBaseUrlHost,
      prompt_summary: log.promptSummary,
      sanitized_params: sanitizeJson(log.sanitizedParams),
      resolved_request_sanitized: sanitizeJson(log.resolvedRequestSanitized),
      upstream_response_summary: sanitizeJson(log.upstreamResponseSummary),
      profile_error_hint: sanitizeText(log.profileErrorHint),
      error_code: log.errorCode,
      error_message: sanitizeText(log.errorMessage),
      created_at: log.createdAt.toISOString(),
      expires_at: log.expiresAt.toISOString(),
    };
  }

  private serializeRequestLogDetail(
    log: RequestLog & {
      user?: { id: string; username: string; displayName: string | null };
      task?: {
        id: string;
        status: string;
        clientRequestId: string | null;
        createdAt: Date;
        completedAt: Date | null;
      };
      attempt?: {
        id: string;
        attemptNo: number;
        status: string;
        httpStatus: number | null;
        errorCode: string | null;
        errorMessage: string | null;
      } | null;
    },
  ) {
    return {
      ...this.serializeRequestLogSummary(log),
      task: log.task
        ? {
            id: log.task.id,
            status: log.task.status,
            client_request_id: log.task.clientRequestId,
            created_at: log.task.createdAt.toISOString(),
            completed_at: log.task.completedAt?.toISOString() ?? null,
          }
        : null,
      attempt: log.attempt
        ? {
            id: log.attempt.id,
            attempt_no: log.attempt.attemptNo,
            status: log.attempt.status,
            http_status: log.attempt.httpStatus,
            error_code: log.attempt.errorCode,
            error_message: sanitizeText(log.attempt.errorMessage),
          }
        : null,
      has_prompt: Boolean(log.encryptedPrompt && log.promptIv && log.promptTag),
      has_params: Boolean(log.encryptedParams && log.paramsIv && log.paramsTag),
    };
  }

  private serializeAuditLog(
    log: AuditLog & {
      actor?: { id: string; username: string; displayName: string | null } | null;
    },
  ) {
    return {
      id: log.id,
      actor: log.actor
        ? {
            id: log.actor.id,
            username: log.actor.username,
            display_name: log.actor.displayName,
          }
        : null,
      actor_user_id: log.actorUserId,
      action: log.action,
      target_type: log.targetType,
      target_id: log.targetId,
      result: log.result,
      ip: log.ipAddress,
      user_agent_summary: summarizeUserAgent(log.userAgent),
      metadata: sanitizeJson(log.metadata),
      created_at: log.createdAt.toISOString(),
      expires_at: log.expiresAt.toISOString(),
    };
  }

  private readRequiredUserStatus(value: unknown): UserStatus {
    if (value === 'active' || value === 'disabled' || value === 'deleted') {
      return value;
    }
    throw validationFailed([
      {
        field: 'status',
        message: '状态必须是 active、disabled 或 deleted',
      },
    ]);
  }

  private readOptionalUserStatus(value: unknown): UserStatus | undefined {
    if (!value) {
      return undefined;
    }
    return this.readRequiredUserStatus(value);
  }

  private readOptionalRequestLogStatus(value: unknown): RequestLogStatus | undefined {
    if (!value) {
      return undefined;
    }
    if (
      value === 'succeeded' ||
      value === 'failed' ||
      value === 'timeout' ||
      value === 'canceled'
    ) {
      return value;
    }
    throw validationFailed([
      {
        field: 'status',
        message: '状态必须是 succeeded、failed、timeout 或 canceled',
      },
    ]);
  }

  private readOptionalAuditResult(value: unknown): AuditResult | undefined {
    if (!value) {
      return undefined;
    }
    if (value === 'success' || value === 'failed') {
      return value;
    }
    throw validationFailed([
      {
        field: 'result',
        message: '结果必须是 success 或 failed',
      },
    ]);
  }

  private readOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private readOptionalUuid(value: unknown, field: string) {
    if (!value) {
      return undefined;
    }
    this.assertUuid(value, field);
    return value;
  }

  private readPassword(value: unknown) {
    const password = typeof value === 'string' ? value : '';
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      throw validationFailed([
        {
          field: 'new_password',
          message: `密码需为 ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} 位`,
        },
      ]);
    }
    return password;
  }

  private readDateRange(from: unknown, to: unknown): Prisma.DateTimeFilter | undefined {
    const range: Prisma.DateTimeFilter = {};
    if (typeof from === 'string' && from.trim()) {
      range.gte = this.parseDate(from, 'date_from');
    }
    if (typeof to === 'string' && to.trim()) {
      range.lte = this.parseDate(to, 'date_to');
    }
    return Object.keys(range).length > 0 ? range : undefined;
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw validationFailed([{ field, message: '时间格式错误' }]);
    }
    return date;
  }

  private parsePositiveInt(rawValue: unknown, fallback: number, min: number, max: number) {
    const parsed =
      typeof rawValue === 'string'
        ? Number.parseInt(rawValue, 10)
        : typeof rawValue === 'number'
          ? rawValue
          : fallback;

    if (!Number.isInteger(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  private pagination(page: number, pageSize: number, total: number) {
    return {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    };
  }

  private assertUuid(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw validationFailed([{ field, message: 'ID 格式错误' }]);
    }
  }

  private safeHost(value: string) {
    try {
      return new URL(value).host;
    } catch {
      return null;
    }
  }
}

function summarizeUserAgent(value: string | null) {
  if (!value) {
    return null;
  }
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function sanitizeText(value: string | null) {
  if (!value) {
    return value;
  }
  return redactSensitiveText(value);
}

function sanitizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item));
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = '[redacted]';
        continue;
      }
      if (URL_KEY_PATTERN.test(key) && typeof nestedValue === 'string') {
        sanitized[key] = sanitizeUrlLikeValue(nestedValue);
        continue;
      }
      sanitized[key] = sanitizeJson(nestedValue);
    }
    return sanitized;
  }

  if (typeof value === 'string') {
    return redactSensitiveText(value);
  }

  return value;
}

function sanitizeUrlLikeValue(value: string) {
  if (isLikelyLocalPath(value)) {
    return '[redacted-path]';
  }

  try {
    const parsed = new URL(value);
    return parsed.host;
  } catch {
    return redactSensitiveText(value);
  }
}

function isLikelyLocalPath(value: string) {
  return (
    value.startsWith('/') ||
    /^[a-zA-Z]:\\/.test(value) ||
    value.startsWith('file://') ||
    value.startsWith('\\\\')
  );
}

function redactSensitiveText(value: string) {
  if (isLikelyLocalPath(value)) {
    return '[redacted-path]';
  }

  let redacted = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
  redacted = redacted.replace(/sk-[A-Za-z0-9._-]{6,}/g, 'sk-[redacted]');
  redacted = redacted.replace(
    /(api[_-]?key|authorization|secret|token|password)=([^&\s]+)/gi,
    '$1=[redacted]',
  );
  return redacted;
}
