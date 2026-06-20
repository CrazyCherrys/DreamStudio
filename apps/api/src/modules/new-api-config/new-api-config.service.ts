import { HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { NewApiConfigStatus, Prisma, UserNewApiConfig, UserStatus } from '@prisma/client';

import { prisma } from '@dreamstudio/db';

import { apiError, validationFailed } from '../auth/auth.errors';
import type { SessionContext } from '../auth/auth.types';
import { AuditLogService } from './audit-log.service';
import { EncryptionService } from './encryption.service';
import { NewApiConnectionService } from './new-api-connection.service';
import type {
  ConnectionTestResult,
  NewApiConfigBody,
  NewApiConfigTestBody,
  PublicNewApiConfig,
} from './new-api-config.types';
import { SystemSettingsService } from './system-settings.service';

@Injectable()
export class NewApiConfigService {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly connectionService: NewApiConnectionService,
    private readonly encryptionService: EncryptionService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async getAuthStatus(userId: string): Promise<NewApiConfigStatus | 'missing'> {
    const config = await prisma.userNewApiConfig.findUnique({
      where: {
        userId,
      },
      select: {
        status: true,
      },
    });

    return config?.status ?? 'missing';
  }

  async resolveSavedConnectionForUser(
    userId: string,
  ): Promise<{ baseUrl: string; apiKey: string }> {
    const config = await prisma.userNewApiConfig.findUnique({
      where: {
        userId,
      },
    });

    if (!config || config.status !== 'valid') {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'new_api_config_missing',
        '当前管理员没有可用的 new-api 配置',
      );
    }

    try {
      return {
        baseUrl: config.newApiBaseUrl,
        apiKey: this.encryptionService.decryptSecret({
          encrypted: config.encryptedApiKey,
          iv: config.keyIv,
          tag: config.keyTag,
          keyVersion: config.keyVersion,
        }),
      };
    } catch {
      throw apiError(HttpStatus.BAD_REQUEST, 'new_api_config_invalid', '已保存密钥无法解密');
    }
  }

  async getOwnConfig(session: SessionContext): Promise<PublicNewApiConfig> {
    return this.serializeConfig(
      await prisma.userNewApiConfig.findUnique({
        where: {
          userId: session.userId,
        },
      }),
    );
  }

  async saveOwnConfig(body: NewApiConfigBody, session: SessionContext, request: Request) {
    const saved = await this.saveConfigForUser({
      body,
      actorSession: session,
      request,
      targetUserId: session.userId,
      action: 'user_set_new_api_key',
      allowOmittedApiKey: true,
      audit: true,
    });

    return this.serializeConfig(saved);
  }

  async testOwnConfig(
    body: NewApiConfigTestBody,
    session: SessionContext,
  ): Promise<ConnectionTestResult> {
    const existing = await prisma.userNewApiConfig.findUnique({
      where: {
        userId: session.userId,
      },
    });
    const input = await this.resolveInput(body, existing, {
      allowOmittedApiKey: true,
      requireApiKey: !existing,
    });

    const result = await this.connectionService.testConnection(input.baseUrl, input.apiKey);
    if (existing) {
      await prisma.userNewApiConfig.update({
        where: {
          userId: session.userId,
        },
        data: {
          status: result.status,
          lastTestedAt: new Date(result.tested_at),
          lastTestError: result.error,
        },
      });
    }

    return result;
  }

  async listAdminUsers(query: {
    keyword?: unknown;
    status?: unknown;
    page?: unknown;
    page_size?: unknown;
  }) {
    const page = this.parsePositiveInt(query.page, 1, 1, 100000);
    const pageSize = this.parsePositiveInt(query.page_size, 20, 1, 100);
    const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : '';
    const status = typeof query.status === 'string' ? query.status.trim() : '';
    const where: Prisma.UserWhereInput = {
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword, mode: 'insensitive' as const } },
              { displayName: { contains: keyword, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(this.isUserStatus(status) ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          newApiConfig: true,
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
        new_api_config_status: user.newApiConfig?.status ?? 'missing',
        masked_api_key: user.newApiConfig?.maskedApiKey ?? null,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  async getAdminUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        newApiConfig: true,
      },
    });

    if (!user) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '用户不存在');
    }

    return {
      id: user.id,
      username: user.username,
      display_name: user.displayName,
      role: user.role,
      status: user.status,
      last_login_at: user.lastLoginAt?.toISOString() ?? null,
      new_api_config: await this.serializeConfig(user.newApiConfig),
    };
  }

  async saveUserConfigByAdmin(
    userId: string,
    body: NewApiConfigBody,
    session: SessionContext,
    request: Request,
  ) {
    await this.assertTargetUserConfigurable(userId);
    const saved = await this.saveConfigForUser({
      body,
      actorSession: session,
      request,
      targetUserId: userId,
      action: 'admin_set_user_new_api_key',
      allowOmittedApiKey: false,
      audit: true,
    });

    return this.serializeConfig(saved);
  }

  async deleteUserConfigByAdmin(userId: string, session: SessionContext, request: Request) {
    await this.assertTargetUserConfigurable(userId);
    await prisma.userNewApiConfig.deleteMany({
      where: {
        userId,
      },
    });
    await this.auditLogService.write({
      action: 'admin_delete_user_new_api_key',
      targetType: 'user',
      targetId: userId,
      session,
      request,
      metadata: {
        api_key: '[redacted]',
      },
    });

    return {
      deleted: true,
      new_api_config_status: 'missing',
    };
  }

  async serializeConfig(config: UserNewApiConfig | null): Promise<PublicNewApiConfig> {
    const [allowCustomBaseUrl, defaultBaseUrl] = await Promise.all([
      this.systemSettingsService.getBoolean('allow_user_custom_new_api_base_url', true),
      this.systemSettingsService.getString('default_new_api_base_url', ''),
    ]);

    return {
      configured: Boolean(config),
      new_api_base_url: config?.newApiBaseUrl ?? null,
      uses_custom_base_url: config?.usesCustomBaseUrl ?? false,
      masked_api_key: config?.maskedApiKey ?? null,
      status: config?.status ?? 'missing',
      last_tested_at: config?.lastTestedAt?.toISOString() ?? null,
      last_test_error: config?.lastTestError ?? null,
      allow_custom_base_url: allowCustomBaseUrl,
      default_new_api_base_url: defaultBaseUrl || null,
    };
  }

  private async saveConfigForUser({
    action,
    actorSession,
    allowOmittedApiKey,
    audit,
    body,
    request,
    targetUserId,
  }: {
    body: NewApiConfigBody;
    actorSession: SessionContext;
    request: Request;
    targetUserId: string;
    action: string;
    allowOmittedApiKey: boolean;
    audit: boolean;
  }) {
    const existing = await prisma.userNewApiConfig.findUnique({
      where: {
        userId: targetUserId,
      },
    });
    const input = await this.resolveInput(body, existing, {
      allowOmittedApiKey,
      requireApiKey: !existing || !allowOmittedApiKey,
    });
    const testBeforeSave = body.test_before_save !== false;
    const testResult = testBeforeSave
      ? await this.connectionService.testConnection(input.baseUrl, input.apiKey)
      : null;
    const encrypted = input.apiKeyChanged
      ? this.encryptionService.encryptSecret(input.apiKey)
      : existing
        ? {
            encrypted: existing.encryptedApiKey,
            iv: existing.keyIv,
            tag: existing.keyTag,
            keyVersion: existing.keyVersion,
          }
        : this.encryptionService.encryptSecret(input.apiKey);
    const saved = await prisma.userNewApiConfig.upsert({
      where: {
        userId: targetUserId,
      },
      create: {
        userId: targetUserId,
        newApiBaseUrl: input.baseUrl,
        usesCustomBaseUrl: input.usesCustomBaseUrl,
        encryptedApiKey: encrypted.encrypted,
        keyIv: encrypted.iv,
        keyTag: encrypted.tag,
        keyVersion: encrypted.keyVersion,
        maskedApiKey: input.apiKeyChanged
          ? this.encryptionService.maskSecret(input.apiKey)
          : (existing?.maskedApiKey ?? this.encryptionService.maskSecret(input.apiKey)),
        status: testResult?.status ?? 'untested',
        lastTestedAt: testResult ? new Date(testResult.tested_at) : null,
        lastTestError: testResult?.error ?? null,
      },
      update: {
        newApiBaseUrl: input.baseUrl,
        usesCustomBaseUrl: input.usesCustomBaseUrl,
        encryptedApiKey: encrypted.encrypted,
        keyIv: encrypted.iv,
        keyTag: encrypted.tag,
        keyVersion: encrypted.keyVersion,
        maskedApiKey: input.apiKeyChanged
          ? this.encryptionService.maskSecret(input.apiKey)
          : (existing?.maskedApiKey ?? this.encryptionService.maskSecret(input.apiKey)),
        status: testResult?.status ?? 'untested',
        lastTestedAt: testResult ? new Date(testResult.tested_at) : null,
        lastTestError: testResult?.error ?? null,
      },
    });

    if (audit) {
      await this.auditLogService.write({
        action,
        targetType: 'user_new_api_config',
        targetId: saved.id,
        session: actorSession,
        request,
        metadata: {
          target_user_id: targetUserId,
          status: saved.status,
          uses_custom_base_url: saved.usesCustomBaseUrl,
          api_key: '[redacted]',
        },
      });
    }

    return saved;
  }

  private async resolveInput(
    body: NewApiConfigBody | NewApiConfigTestBody,
    existing: UserNewApiConfig | null,
    options: { allowOmittedApiKey: boolean; requireApiKey: boolean },
  ) {
    const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
    if (options.requireApiKey && !apiKey) {
      throw validationFailed([{ field: 'api_key', message: 'API Key 不能为空' }]);
    }

    let resolvedApiKey = apiKey;
    let apiKeyChanged = Boolean(apiKey);
    if (!resolvedApiKey && existing && options.allowOmittedApiKey) {
      try {
        resolvedApiKey = this.encryptionService.decryptSecret({
          encrypted: existing.encryptedApiKey,
          iv: existing.keyIv,
          tag: existing.keyTag,
          keyVersion: existing.keyVersion,
        });
        apiKeyChanged = false;
      } catch {
        throw apiError(HttpStatus.BAD_REQUEST, 'new_api_config_invalid', '已保存密钥无法解密');
      }
    }

    this.connectionService.assertUsableSavedKey(resolvedApiKey || null);
    const baseUrl = await this.resolveBaseUrl(body.new_api_base_url, existing);

    return {
      apiKey: resolvedApiKey,
      apiKeyChanged,
      baseUrl: baseUrl.value,
      usesCustomBaseUrl: baseUrl.usesCustomBaseUrl,
    };
  }

  private async resolveBaseUrl(rawBaseUrl: unknown, existing: UserNewApiConfig | null) {
    const allowCustom = await this.systemSettingsService.getBoolean(
      'allow_user_custom_new_api_base_url',
      true,
    );
    const defaultBaseUrl = await this.systemSettingsService.getString(
      'default_new_api_base_url',
      '',
    );
    const requestedBaseUrl = typeof rawBaseUrl === 'string' ? rawBaseUrl.trim() : '';

    if (requestedBaseUrl) {
      const normalized = this.systemSettingsService.validateBaseUrl(requestedBaseUrl);
      const usesCustomBaseUrl = !defaultBaseUrl || normalized !== defaultBaseUrl;
      if (usesCustomBaseUrl && !allowCustom) {
        throw apiError(HttpStatus.FORBIDDEN, 'forbidden', '系统已关闭用户自定义 new-api Base URL');
      }
      return {
        value: normalized,
        usesCustomBaseUrl,
      };
    }

    if (existing) {
      if (existing.usesCustomBaseUrl && !allowCustom) {
        if (!defaultBaseUrl) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'new_api_config_missing',
            '默认 new-api Base URL 未配置',
          );
        }
        return {
          value: defaultBaseUrl,
          usesCustomBaseUrl: false,
        };
      }

      return {
        value: existing.newApiBaseUrl,
        usesCustomBaseUrl: existing.usesCustomBaseUrl,
      };
    }

    if (!defaultBaseUrl) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'new_api_config_missing',
        '默认 new-api Base URL 未配置',
      );
    }

    return {
      value: defaultBaseUrl,
      usesCustomBaseUrl: false,
    };
  }

  private async assertTargetUserConfigurable(userId: string) {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '目标用户不存在');
    }

    if (user.status === 'disabled') {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '目标用户已禁用');
    }

    if (user.status === 'deleted') {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '目标用户已删除');
    }
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

  private isUserStatus(value: string): value is UserStatus {
    return value === 'active' || value === 'disabled' || value === 'deleted';
  }
}
