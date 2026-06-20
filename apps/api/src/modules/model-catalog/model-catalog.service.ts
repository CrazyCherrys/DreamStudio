import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ModelEndpointType, Prisma, ReferenceTransferMode } from '@prisma/client';

import { prisma } from '@dreamstudio/db';

import { apiError, validationFailed } from '../auth/auth.errors';
import type { SessionContext } from '../auth/auth.types';
import { AuditLogService } from '../new-api-config/audit-log.service';
import { NewApiConfigService } from '../new-api-config/new-api-config.service';
import {
  assertDefaultParams,
  normalizeParameterSchema,
  parameterSchemaToJson,
  type ParameterSchemaField,
} from './parameter-schema';
import type {
  AdminAiModel,
  AdminModelCategory,
  AiModelBody,
  ModelCategoryBody,
  ModelSyncSnapshotBody,
  ModelSyncSnapshotDetail,
  ModelSyncSnapshotSummary,
  PublicAiModel,
  PublicModelCategory,
} from './model-catalog.types';

type ValidationDetail = { field: string; message: string };
type SerializablePublicModel = {
  id: string;
  modelId: string;
  displayName: string;
  providerName: string | null;
  categoryId: string | null;
  endpointType: ModelEndpointType;
  referenceTransferMode: ReferenceTransferMode;
  supportsReferenceImage: boolean;
  isRecommended: boolean;
  defaultParams: Prisma.JsonValue;
  parameterSchema: Prisma.JsonValue;
};
type SerializableAdminCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};
type SerializableAdminModel = SerializablePublicModel & {
  isEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  category: SerializableAdminCategory | null;
};

const SNAPSHOT_PULL_TIMEOUT_MS = 12000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ModelCatalogService {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly newApiConfigService: NewApiConfigService,
  ) {}

  async listPublicCategories(): Promise<{ items: PublicModelCategory[] }> {
    const categories = await prisma.modelCategory.findMany({
      where: {
        deletedAt: null,
        isEnabled: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      items: categories.map((category) => this.serializePublicCategory(category)),
    };
  }

  async listAdminCategories(): Promise<{ items: AdminModelCategory[] }> {
    const categories = await prisma.modelCategory.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      items: categories.map((category) => this.serializeAdminCategory(category)),
    };
  }

  async createCategory(body: ModelCategoryBody, session: SessionContext, request: Request) {
    const input = this.validateCategoryBody(body, {
      partial: false,
    }) as Prisma.ModelCategoryUncheckedCreateInput;

    try {
      const category = await prisma.modelCategory.create({
        data: input,
      });

      await this.auditLogService.write({
        action: 'admin_create_model_category',
        targetType: 'model_category',
        targetId: category.id,
        session,
        request,
        metadata: {
          slug: category.slug,
          is_enabled: category.isEnabled,
        },
      });

      return {
        item: this.serializeAdminCategory(category),
      };
    } catch (error) {
      this.rethrowKnownConflict(error, '分类 slug 已存在');
      throw error;
    }
  }

  async updateCategory(
    categoryId: string,
    body: ModelCategoryBody,
    session: SessionContext,
    request: Request,
  ) {
    this.assertUuid(categoryId, 'category_id');
    const input = this.validateCategoryBody(body, { partial: true });
    await this.assertCategoryExists(categoryId);

    try {
      const category = await prisma.modelCategory.update({
        where: {
          id: categoryId,
        },
        data: input,
      });

      await this.auditLogService.write({
        action: 'admin_update_model_category',
        targetType: 'model_category',
        targetId: category.id,
        session,
        request,
        metadata: {
          changed_fields: Object.keys(input),
          is_enabled: category.isEnabled,
        },
      });

      return {
        item: this.serializeAdminCategory(category),
      };
    } catch (error) {
      this.rethrowKnownConflict(error, '分类 slug 已存在');
      throw error;
    }
  }

  async deleteCategory(categoryId: string, session: SessionContext, request: Request) {
    this.assertUuid(categoryId, 'category_id');
    await this.assertCategoryExists(categoryId);
    const category = await prisma.modelCategory.update({
      where: {
        id: categoryId,
      },
      data: {
        isEnabled: false,
        deletedAt: new Date(),
      },
    });

    await this.auditLogService.write({
      action: 'admin_delete_model_category',
      targetType: 'model_category',
      targetId: category.id,
      session,
      request,
      metadata: {
        slug: category.slug,
      },
    });

    return {
      deleted: true,
      item: this.serializeAdminCategory(category),
    };
  }

  async listPublicModels(query: Record<string, unknown>): Promise<{ items: PublicAiModel[] }> {
    const categoryId = this.readOptionalUuid(query.category_id, 'category_id');
    const recommended = this.readOptionalBooleanString(query.recommended);
    const models = await prisma.aiModel.findMany({
      where: {
        deletedAt: null,
        isEnabled: true,
        ...(categoryId ? { categoryId } : {}),
        ...(recommended === undefined ? {} : { isRecommended: recommended }),
        ...(categoryId
          ? {
              category: {
                deletedAt: null,
                isEnabled: true,
              },
            }
          : {
              OR: [
                {
                  categoryId: null,
                },
                {
                  category: {
                    deletedAt: null,
                    isEnabled: true,
                  },
                },
              ],
            }),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      items: models.map((model) => this.serializePublicModel(model)),
    };
  }

  async getPublicModel(modelId: string): Promise<{ item: PublicAiModel }> {
    this.assertUuid(modelId, 'model_record_id');
    const model = await prisma.aiModel.findFirst({
      where: {
        id: modelId,
        deletedAt: null,
        isEnabled: true,
        OR: [
          {
            categoryId: null,
          },
          {
            category: {
              deletedAt: null,
              isEnabled: true,
            },
          },
        ],
      },
    });

    if (!model) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '模型不存在或已禁用');
    }

    return {
      item: this.serializePublicModel(model),
    };
  }

  async listAdminModels(query: Record<string, unknown>): Promise<{ items: AdminAiModel[] }> {
    const categoryId = this.readOptionalUuid(query.category_id, 'category_id');
    const endpointType = this.readOptionalEndpointType(query.endpoint_type);
    const models = await prisma.aiModel.findMany({
      where: {
        deletedAt: null,
        ...(categoryId ? { categoryId } : {}),
        ...(endpointType ? { endpointType } : {}),
      },
      include: {
        category: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      items: models.map((model) => this.serializeAdminModel(model)),
    };
  }

  async getAdminModel(modelId: string): Promise<{ item: AdminAiModel }> {
    this.assertUuid(modelId, 'model_record_id');
    const model = await prisma.aiModel.findFirst({
      where: {
        id: modelId,
        deletedAt: null,
      },
      include: {
        category: true,
      },
    });

    if (!model) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '模型不存在');
    }

    return {
      item: this.serializeAdminModel(model),
    };
  }

  async createModel(body: AiModelBody, session: SessionContext, request: Request) {
    const input = (await this.validateModelBody(body, {
      partial: false,
    })) as Prisma.AiModelUncheckedCreateInput;

    try {
      const model = await prisma.aiModel.create({
        data: input,
        include: {
          category: true,
        },
      });

      await this.auditLogService.write({
        action: 'admin_create_ai_model',
        targetType: 'ai_model',
        targetId: model.id,
        session,
        request,
        metadata: {
          model_id: model.modelId,
          endpoint_type: model.endpointType,
          is_enabled: model.isEnabled,
        },
      });

      return {
        item: this.serializeAdminModel(model),
      };
    } catch (error) {
      this.rethrowKnownConflict(error, '未软删除模型中 model_id + endpoint_type 必须唯一');
      throw error;
    }
  }

  async updateModel(
    modelRecordId: string,
    body: AiModelBody,
    session: SessionContext,
    request: Request,
  ) {
    this.assertUuid(modelRecordId, 'model_record_id');
    await this.assertModelExists(modelRecordId);
    const input = await this.validateModelBody(body, { partial: true, modelId: modelRecordId });

    try {
      const model = await prisma.aiModel.update({
        where: {
          id: modelRecordId,
        },
        data: input,
        include: {
          category: true,
        },
      });

      await this.auditLogService.write({
        action: 'admin_update_ai_model',
        targetType: 'ai_model',
        targetId: model.id,
        session,
        request,
        metadata: {
          changed_fields: Object.keys(input),
          model_id: model.modelId,
          endpoint_type: model.endpointType,
          is_enabled: model.isEnabled,
        },
      });

      return {
        item: this.serializeAdminModel(model),
      };
    } catch (error) {
      this.rethrowKnownConflict(error, '未软删除模型中 model_id + endpoint_type 必须唯一');
      throw error;
    }
  }

  async deleteModel(modelRecordId: string, session: SessionContext, request: Request) {
    this.assertUuid(modelRecordId, 'model_record_id');
    await this.assertModelExists(modelRecordId);
    const model = await prisma.aiModel.update({
      where: {
        id: modelRecordId,
      },
      data: {
        isEnabled: false,
        deletedAt: new Date(),
      },
      include: {
        category: true,
      },
    });

    await this.auditLogService.write({
      action: 'admin_delete_ai_model',
      targetType: 'ai_model',
      targetId: model.id,
      session,
      request,
      metadata: {
        model_id: model.modelId,
        endpoint_type: model.endpointType,
      },
    });

    return {
      deleted: true,
      item: this.serializeAdminModel(model),
    };
  }

  async createSnapshot(
    body: ModelSyncSnapshotBody,
    session: SessionContext,
    request: Request,
  ): Promise<{ snapshot: ModelSyncSnapshotSummary }> {
    const connection = await this.resolveSnapshotConnection(body, session);
    const rawResponse = await this.fetchModels(connection.baseUrl, connection.apiKey);
    const modelCount = this.countModels(rawResponse);
    const snapshot = await prisma.modelSyncSnapshot.create({
      data: {
        baseUrl: connection.baseUrl,
        operatorId: session.userId,
        rawResponse: rawResponse as Prisma.InputJsonValue,
        modelCount,
      },
    });

    await this.auditLogService.write({
      action: 'admin_create_model_sync_snapshot',
      targetType: 'model_sync_snapshot',
      targetId: snapshot.id,
      session,
      request,
      metadata: {
        base_url: connection.baseUrl,
        model_count: modelCount,
        auth_source: connection.authSource,
      },
    });

    return {
      snapshot: this.serializeSnapshotSummary(snapshot),
    };
  }

  async listSnapshots(): Promise<{ items: ModelSyncSnapshotSummary[] }> {
    const snapshots = await prisma.modelSyncSnapshot.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return {
      items: snapshots.map((snapshot) => this.serializeSnapshotSummary(snapshot)),
    };
  }

  async getSnapshot(snapshotId: string): Promise<{ snapshot: ModelSyncSnapshotDetail }> {
    this.assertUuid(snapshotId, 'snapshot_id');
    const snapshot = await prisma.modelSyncSnapshot.findUnique({
      where: {
        id: snapshotId,
      },
    });

    if (!snapshot) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '模型候选快照不存在');
    }

    return {
      snapshot: this.serializeSnapshotDetail(snapshot),
    };
  }

  private validateCategoryBody(body: ModelCategoryBody, options: { partial: boolean }) {
    const details: ValidationDetail[] = [];
    const input: Prisma.ModelCategoryUncheckedUpdateInput = {};

    if (!options.partial || body.name !== undefined) {
      const name = this.readString(body.name, 'name', details, { min: 1, max: 120 });
      if (name !== null) {
        input.name = name;
      }
    }

    if (!options.partial || body.slug !== undefined) {
      const slug = this.readString(body.slug, 'slug', details, { min: 1, max: 120 });
      if (slug !== null) {
        if (!SLUG_PATTERN.test(slug)) {
          details.push({
            field: 'slug',
            message: 'slug 只允许小写字母、数字和短横线，且不能以短横线开头或结尾',
          });
        }
        input.slug = slug;
      }
    }

    if (body.icon !== undefined) {
      input.icon = this.readNullableString(body.icon, 'icon', details, { max: 80 });
    }

    if (!options.partial || body.sort_order !== undefined) {
      input.sortOrder = this.readInteger(body.sort_order, 'sort_order', details, {
        fallback: 0,
        min: -100000,
        max: 100000,
      });
    }

    if (!options.partial || body.is_enabled !== undefined) {
      input.isEnabled = this.readBoolean(body.is_enabled, 'is_enabled', details, true);
    }

    if (details.length > 0) {
      throw validationFailed(details);
    }

    return input;
  }

  private async validateModelBody(
    body: AiModelBody,
    options: { partial: boolean; modelId?: string },
  ) {
    const details: ValidationDetail[] = [];
    const existing =
      options.partial && options.modelId
        ? await prisma.aiModel.findFirst({
            where: {
              id: options.modelId,
              deletedAt: null,
            },
          })
        : null;
    const input: Prisma.AiModelUncheckedUpdateInput = {};
    const rawCategoryId =
      body.category_id === undefined && options.partial ? undefined : body.category_id;

    if (rawCategoryId !== undefined) {
      input.categoryId = this.readNullableUuid(rawCategoryId, 'category_id', details);
      if (typeof input.categoryId === 'string') {
        await this.assertCategoryExists(input.categoryId);
      }
    }

    if (!options.partial || body.model_id !== undefined) {
      const modelId = this.readString(body.model_id, 'model_id', details, { min: 1, max: 240 });
      if (modelId !== null) {
        input.modelId = modelId;
      }
    }

    if (!options.partial || body.display_name !== undefined) {
      const displayName = this.readString(body.display_name, 'display_name', details, {
        min: 1,
        max: 160,
      });
      if (displayName !== null) {
        input.displayName = displayName;
      }
    }

    if (body.provider_name !== undefined) {
      input.providerName = this.readNullableString(body.provider_name, 'provider_name', details, {
        max: 120,
      });
    }

    if (!options.partial || body.endpoint_type !== undefined) {
      input.endpointType = this.readEndpointType(body.endpoint_type, details);
    }

    if (!options.partial || body.reference_transfer_mode !== undefined) {
      input.referenceTransferMode = this.readReferenceTransferMode(
        body.reference_transfer_mode,
        details,
      );
    }

    if (!options.partial || body.supports_reference_image !== undefined) {
      input.supportsReferenceImage = this.readBoolean(
        body.supports_reference_image,
        'supports_reference_image',
        details,
        false,
      );
    }

    if (!options.partial || body.is_enabled !== undefined) {
      input.isEnabled = this.readBoolean(body.is_enabled, 'is_enabled', details, true);
    }

    if (!options.partial || body.is_recommended !== undefined) {
      input.isRecommended = this.readBoolean(body.is_recommended, 'is_recommended', details, false);
    }

    if (!options.partial || body.sort_order !== undefined) {
      input.sortOrder = this.readInteger(body.sort_order, 'sort_order', details, {
        fallback: 0,
        min: -100000,
        max: 100000,
      });
    }

    let schema: ParameterSchemaField[] | null = null;
    try {
      if (!options.partial || body.parameter_schema !== undefined) {
        schema = normalizeParameterSchema(body.parameter_schema ?? []);
        input.parameterSchema = parameterSchemaToJson(schema);
      } else if (existing) {
        schema = normalizeParameterSchema(existing.parameterSchema);
      }

      if (
        !options.partial ||
        body.default_params !== undefined ||
        body.parameter_schema !== undefined
      ) {
        if (!schema && existing) {
          schema = normalizeParameterSchema(existing.parameterSchema);
        }
        const defaultParamsSource =
          body.default_params !== undefined ? body.default_params : (existing?.defaultParams ?? {});
        input.defaultParams = assertDefaultParams(schema ?? [], defaultParamsSource);
      }
    } catch (error) {
      this.throwSchemaValidationError(error);
    }

    if (details.length > 0) {
      throw validationFailed(details);
    }

    return input;
  }

  private async resolveSnapshotConnection(body: ModelSyncSnapshotBody, session: SessionContext) {
    const temporaryApiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';

    if (temporaryApiKey) {
      const baseUrl = this.validateBaseUrl(body.new_api_base_url);
      return {
        baseUrl,
        apiKey: temporaryApiKey,
        authSource: 'temporary',
      };
    }

    if (body.new_api_base_url !== undefined && String(body.new_api_base_url).trim()) {
      throw validationFailed([
        {
          field: 'new_api_base_url',
          message: '使用已保存配置时不要传临时 Base URL，避免将已保存密钥发送到临时地址',
        },
      ]);
    }

    const saved = await this.newApiConfigService.resolveSavedConnectionForUser(session.userId);
    return {
      ...saved,
      authSource: 'saved',
    };
  }

  private async fetchModels(baseUrl: string, apiKey: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SNAPSHOT_PULL_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/models`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw apiError(
          HttpStatus.BAD_GATEWAY,
          'new_api_fetch_failed',
          this.summarizeUpstreamStatus(response.status),
        );
      }

      const payload = (await response.json().catch(() => null)) as unknown;
      if (payload === null || payload === undefined) {
        throw apiError(HttpStatus.BAD_GATEWAY, 'new_api_fetch_failed', 'new-api 返回非 JSON 响应');
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw apiError(HttpStatus.GATEWAY_TIMEOUT, 'new_api_fetch_timeout', '拉取模型候选超时');
      }
      if (!(error instanceof HttpException)) {
        throw apiError(
          HttpStatus.BAD_GATEWAY,
          'new_api_fetch_failed',
          this.sanitizeUpstreamError(error),
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private countModels(payload: unknown): number {
    if (
      payload &&
      typeof payload === 'object' &&
      'data' in payload &&
      Array.isArray((payload as { data: unknown }).data)
    ) {
      return (payload as { data: unknown[] }).data.length;
    }

    if (Array.isArray(payload)) {
      return payload.length;
    }

    return 0;
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await prisma.modelCategory.findFirst({
      where: {
        id: categoryId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '模型分类不存在');
    }
  }

  private async assertModelExists(modelId: string) {
    const model = await prisma.aiModel.findFirst({
      where: {
        id: modelId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!model) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '模型不存在');
    }
  }

  private serializePublicCategory(category: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    sortOrder: number;
  }): PublicModelCategory {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      icon: category.icon,
      sort_order: category.sortOrder,
    };
  }

  private serializeAdminCategory(category: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    sortOrder: number;
    isEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): AdminModelCategory {
    return {
      ...this.serializePublicCategory(category),
      is_enabled: category.isEnabled,
      created_at: category.createdAt.toISOString(),
      updated_at: category.updatedAt.toISOString(),
      deleted_at: category.deletedAt?.toISOString() ?? null,
    };
  }

  private serializePublicModel(model: SerializablePublicModel): PublicAiModel {
    return {
      id: model.id,
      model_id: model.modelId,
      display_name: model.displayName,
      provider_name: model.providerName,
      category_id: model.categoryId,
      endpoint_type: model.endpointType,
      reference_transfer_mode: model.referenceTransferMode,
      supports_reference_image: model.supportsReferenceImage,
      is_recommended: model.isRecommended,
      default_params: model.defaultParams,
      parameter_schema: normalizeParameterSchema(model.parameterSchema),
    };
  }

  private serializeAdminModel(model: SerializableAdminModel): AdminAiModel {
    return {
      ...this.serializePublicModel(model),
      is_enabled: model.isEnabled,
      sort_order: model.sortOrder,
      created_at: model.createdAt.toISOString(),
      updated_at: model.updatedAt.toISOString(),
      deleted_at: model.deletedAt?.toISOString() ?? null,
      category: model.category ? this.serializeAdminCategory(model.category) : null,
    };
  }

  private serializeSnapshotSummary(snapshot: {
    id: string;
    baseUrl: string;
    operatorId: string;
    modelCount: number;
    createdAt: Date;
  }): ModelSyncSnapshotSummary {
    return {
      id: snapshot.id,
      base_url: snapshot.baseUrl,
      operator_id: snapshot.operatorId,
      model_count: snapshot.modelCount,
      created_at: snapshot.createdAt.toISOString(),
    };
  }

  private serializeSnapshotDetail(snapshot: {
    id: string;
    baseUrl: string;
    operatorId: string;
    modelCount: number;
    rawResponse: Prisma.JsonValue;
    createdAt: Date;
  }): ModelSyncSnapshotDetail {
    return {
      ...this.serializeSnapshotSummary(snapshot),
      raw_response: snapshot.rawResponse,
    };
  }

  private readString(
    value: unknown,
    field: string,
    details: ValidationDetail[],
    options: { min: number; max: number },
  ): string | null {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length < options.min || text.length > options.max) {
      details.push({
        field,
        message: `${field} 长度必须在 ${options.min}-${options.max} 之间`,
      });
      return null;
    }

    return text;
  }

  private readNullableString(
    value: unknown,
    field: string,
    details: ValidationDetail[],
    options: { max: number },
  ): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || text.length > options.max) {
      details.push({
        field,
        message: `${field} 长度不能超过 ${options.max}`,
      });
      return null;
    }

    return text;
  }

  private readInteger(
    value: unknown,
    field: string,
    details: ValidationDetail[],
    options: { fallback: number; min: number; max: number },
  ): number {
    const parsed =
      value === undefined
        ? options.fallback
        : typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number.parseInt(value, 10)
            : Number.NaN;

    if (!Number.isInteger(parsed) || parsed < options.min || parsed > options.max) {
      details.push({
        field,
        message: `${field} 必须是 ${options.min}-${options.max} 之间的整数`,
      });
      return options.fallback;
    }

    return parsed;
  }

  private readBoolean(
    value: unknown,
    field: string,
    details: ValidationDetail[],
    fallback: boolean,
  ): boolean {
    if (value === undefined) {
      return fallback;
    }

    if (typeof value !== 'boolean') {
      details.push({
        field,
        message: `${field} 必须是布尔值`,
      });
      return fallback;
    }

    return value;
  }

  private readNullableUuid(
    value: unknown,
    field: string,
    details: ValidationDetail[],
  ): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const text = typeof value === 'string' ? value.trim() : '';
    if (!UUID_PATTERN.test(text)) {
      details.push({
        field,
        message: `${field} 必须是 uuid`,
      });
      return null;
    }

    return text;
  }

  private readOptionalUuid(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const text = typeof value === 'string' ? value.trim() : '';
    if (!UUID_PATTERN.test(text)) {
      throw validationFailed([
        {
          field,
          message: `${field} 必须是 uuid`,
        },
      ]);
    }

    return text;
  }

  private readOptionalBooleanString(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (value === true || value === 'true') {
      return true;
    }

    if (value === false || value === 'false') {
      return false;
    }

    throw validationFailed([
      {
        field: 'recommended',
        message: 'recommended 必须是 true 或 false',
      },
    ]);
  }

  private readEndpointType(value: unknown, details: ValidationDetail[]): ModelEndpointType {
    if (value === ModelEndpointType.openai_image_generations) {
      return ModelEndpointType.openai_image_generations;
    }

    if (value === ModelEndpointType.openai_image_edits) {
      return ModelEndpointType.openai_image_edits;
    }

    if (value === ModelEndpointType.gemini_generate_content) {
      return ModelEndpointType.gemini_generate_content;
    }

    details.push({
      field: 'endpoint_type',
      message: 'endpoint_type 不受支持',
    });
    return ModelEndpointType.openai_image_generations;
  }

  private readOptionalEndpointType(value: unknown): ModelEndpointType | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const details: ValidationDetail[] = [];
    const endpointType = this.readEndpointType(value, details);
    if (details.length > 0) {
      throw validationFailed(details);
    }

    return endpointType;
  }

  private readReferenceTransferMode(
    value: unknown,
    details: ValidationDetail[],
  ): ReferenceTransferMode {
    if (value === undefined || value === null || value === '') {
      return ReferenceTransferMode.none;
    }

    if (value === ReferenceTransferMode.none) {
      return ReferenceTransferMode.none;
    }

    if (value === ReferenceTransferMode.multipart) {
      return ReferenceTransferMode.multipart;
    }

    if (value === ReferenceTransferMode.url) {
      return ReferenceTransferMode.url;
    }

    details.push({
      field: 'reference_transfer_mode',
      message: 'reference_transfer_mode 不受支持',
    });
    return ReferenceTransferMode.none;
  }

  private validateBaseUrl(value: unknown): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) {
      throw validationFailed([
        {
          field: 'new_api_base_url',
          message: '临时 api_key 必须同时传 new_api_base_url',
        },
      ]);
    }

    try {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
      url.pathname = url.pathname.replace(/\/+$/, '');
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/+$/, '');
    } catch {
      throw validationFailed([
        {
          field: 'new_api_base_url',
          message: 'new_api_base_url 必须是合法 HTTP(S) URL',
        },
      ]);
    }
  }

  private assertUuid(value: string, field: string) {
    if (!UUID_PATTERN.test(value)) {
      throw validationFailed([
        {
          field,
          message: `${field} 必须是 uuid`,
        },
      ]);
    }
  }

  private rethrowKnownConflict(error: unknown, message: string): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw apiError(HttpStatus.CONFLICT, 'conflict', message);
    }
  }

  private throwSchemaValidationError(error: unknown): never {
    if (error instanceof Error && 'details' in error) {
      throw validationFailed((error as Error & { details: ValidationDetail[] }).details);
    }

    throw error;
  }

  private summarizeUpstreamStatus(status: number) {
    if (status === 401 || status === 403) {
      return 'new-api 认证失败，请检查 API Key';
    }

    if (status === 404) {
      return 'new-api /v1/models 不存在，请检查 Base URL';
    }

    if (status === 429) {
      return 'new-api 请求受限，请稍后重试';
    }

    if (status >= 500) {
      return 'new-api 服务异常，请稍后重试';
    }

    return `new-api 返回 HTTP ${status}`;
  }

  private sanitizeUpstreamError(error: unknown) {
    if (!(error instanceof Error)) {
      return '连接 new-api 失败';
    }

    return error.message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').slice(0, 240);
  }
}
