import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { HttpException, HttpStatus, Injectable, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ExecutionProfileOperation,
  ExecutionProfileRevisionStatus,
  ExecutionProfileSourceKind,
  ModelEndpointType,
  ModelModality,
  Prisma,
  ReferenceTransferMode,
  type AiModel,
} from '@prisma/client';

import { loadConfig } from '@dreamstudio/config';
import { prisma } from '@dreamstudio/db';
import { DEFAULT_MAX_IMAGE_BYTES } from '@dreamstudio/storage';

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
  AdminExecutionProfile,
  AdminExecutionProfileRevision,
  AiModelBody,
  ExecutionProfileBody,
  ExecutionProfileLintResult,
  ExecutionProfilePreviewBody,
  ExecutionProfilePreviewResult,
  ExecutionProfileRevisionBody,
  ModelSyncSnapshotBody,
  ModelSyncSnapshotDetail,
  ModelSyncSnapshotSummary,
  PublicDefaultExecutionProfile,
  PublicAiModel,
} from './model-catalog.types';

type ValidationDetail = { field: string; message: string };
type SerializablePublicModel = Pick<
  AiModel,
  | 'id'
  | 'modelId'
  | 'displayName'
  | 'providerName'
  | 'modality'
  | 'iconUrl'
  | 'description'
  | 'endpointTypes'
  | 'referenceTransferMode'
  | 'supportsReferenceImage'
  | 'isRecommended'
  | 'defaultParams'
  | 'parameterSchema'
>;
type SerializableAdminModel = SerializablePublicModel &
  Pick<AiModel, 'isEnabled' | 'sortOrder' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

type FavoriteAwareModel = SerializablePublicModel & {
  favorites?: Array<{ userId: string; modelId: string }>;
  executionProfiles?: SerializableExecutionProfile[];
};

type SerializableExecutionProfile = Prisma.AiModelExecutionProfileGetPayload<{
  include: {
    revisions: true;
  };
}>;
type ExecutionProfileWithRevisions = Prisma.AiModelExecutionProfileGetPayload<{
  include: {
    revisions: true;
  };
}>;
type ExecutionProfileRevisionRecord = Prisma.AiModelExecutionProfileRevisionGetPayload<object>;

const SNAPSHOT_PULL_TIMEOUT_MS = 12000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DESCRIPTION_LENGTH = 1200;
const MAX_ICON_URL_LENGTH = 500;
const MODEL_ICON_DIR = 'model-icons';
const MODEL_ICON_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const MODEL_ICON_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};
const defaultExecutionProfileInclude = {
  where: {
    deletedAt: null,
    isEnabled: true,
  },
  include: {
    revisions: {
      where: {
        status: ExecutionProfileRevisionStatus.active,
      },
      orderBy: {
        revisionNo: 'desc',
      },
      take: 1,
    },
  },
  orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
} satisfies Prisma.AiModel$executionProfilesArgs;

@Injectable()
export class ModelCatalogService {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly newApiConfigService: NewApiConfigService,
  ) {}

  async listPublicModels(
    query: Record<string, unknown>,
    session: SessionContext,
  ): Promise<{ items: PublicAiModel[] }> {
    const modality = this.readOptionalModality(query.modality);
    const recommended = this.readOptionalBooleanString(query.recommended, 'recommended');
    const favorite = this.readOptionalBooleanString(query.favorite, 'favorite');
    const search = this.readOptionalSearch(query.q);
    const endpointType = this.readOptionalEndpointType(query.endpoint_type);
    const models = await prisma.aiModel.findMany({
      where: {
        deletedAt: null,
        isEnabled: true,
        ...(modality ? { modality } : {}),
        ...(recommended === undefined ? {} : { isRecommended: recommended }),
        ...(endpointType ? { endpointTypes: { has: endpointType } } : {}),
        ...(favorite === true
          ? {
              favorites: {
                some: {
                  userId: session.userId,
                },
              },
            }
          : favorite === false
            ? {
                favorites: {
                  none: {
                    userId: session.userId,
                  },
                },
              }
            : {}),
        ...(search
          ? {
              OR: [
                { modelId: { contains: search, mode: 'insensitive' } },
                { displayName: { contains: search, mode: 'insensitive' } },
                { providerName: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        executionProfiles: defaultExecutionProfileInclude,
        favorites: {
          where: {
            userId: session.userId,
          },
          take: 1,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const executableModels = models.filter(
      (model) => model.modality !== ModelModality.image || this.findDefaultExecutionProfile(model),
    );

    return {
      items: executableModels.map((model) => this.serializePublicModel(model)),
    };
  }

  async getPublicModel(modelId: string, session: SessionContext): Promise<{ item: PublicAiModel }> {
    this.assertUuid(modelId, 'model_record_id');
    const model = await prisma.aiModel.findFirst({
      where: {
        id: modelId,
        deletedAt: null,
        isEnabled: true,
      },
      include: {
        executionProfiles: defaultExecutionProfileInclude,
        favorites: {
          where: {
            userId: session.userId,
          },
          take: 1,
        },
      },
    });

    if (!model) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '模型不存在或已禁用');
    }
    if (model.modality === ModelModality.image && !this.findDefaultExecutionProfile(model)) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '模型没有可用执行配置');
    }

    return {
      item: this.serializePublicModel(model),
    };
  }

  async favoriteModel(modelId: string, session: SessionContext) {
    await this.assertPublicModelExists(modelId);
    await prisma.userModelFavorite.upsert({
      where: {
        userId_modelId: {
          userId: session.userId,
          modelId,
        },
      },
      create: {
        userId: session.userId,
        modelId,
      },
      update: {},
    });

    return {
      favorited: true,
    };
  }

  async unfavoriteModel(modelId: string, session: SessionContext) {
    this.assertUuid(modelId, 'model_record_id');
    await prisma.userModelFavorite.deleteMany({
      where: {
        userId: session.userId,
        modelId,
      },
    });

    return {
      favorited: false,
    };
  }

  async listAdminModels(query: Record<string, unknown>): Promise<{ items: AdminAiModel[] }> {
    const modality = this.readOptionalModality(query.modality);
    const endpointType = this.readOptionalEndpointType(query.endpoint_type);
    const search = this.readOptionalSearch(query.q);
    const models = await prisma.aiModel.findMany({
      where: {
        deletedAt: null,
        ...(modality ? { modality } : {}),
        ...(endpointType ? { endpointTypes: { has: endpointType } } : {}),
        ...(search
          ? {
              OR: [
                { modelId: { contains: search, mode: 'insensitive' } },
                { displayName: { contains: search, mode: 'insensitive' } },
                { providerName: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        executionProfiles: defaultExecutionProfileInclude,
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
        executionProfiles: defaultExecutionProfileInclude,
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

    const model = await prisma.aiModel.create({
      data: input,
    });

    await this.auditLogService.write({
      action: 'admin_create_ai_model',
      targetType: 'ai_model',
      targetId: model.id,
      session,
      request,
      metadata: {
        model_id: model.modelId,
        modality: model.modality,
        endpoint_types: model.endpointTypes,
        is_enabled: model.isEnabled,
      },
    });

    return {
      item: this.serializeAdminModel(model),
    };
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

    const model = await prisma.aiModel.update({
      where: {
        id: modelRecordId,
      },
      data: input,
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
        modality: model.modality,
        endpoint_types: model.endpointTypes,
        is_enabled: model.isEnabled,
      },
    });

    return {
      item: this.serializeAdminModel(model),
    };
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
    });

    await this.auditLogService.write({
      action: 'admin_delete_ai_model',
      targetType: 'ai_model',
      targetId: model.id,
      session,
      request,
      metadata: {
        model_id: model.modelId,
        modality: model.modality,
        endpoint_types: model.endpointTypes,
      },
    });

    return {
      deleted: true,
      item: this.serializeAdminModel(model),
    };
  }

  async listExecutionProfiles(modelRecordId: string): Promise<{ items: AdminExecutionProfile[] }> {
    this.assertUuid(modelRecordId, 'model_record_id');
    await this.assertModelExists(modelRecordId);
    const profiles = await prisma.aiModelExecutionProfile.findMany({
      where: {
        aiModelId: modelRecordId,
        deletedAt: null,
      },
      include: {
        revisions: {
          orderBy: [{ revisionNo: 'desc' }, { createdAt: 'desc' }],
        },
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      items: profiles.map((profile) => this.serializeAdminExecutionProfile(profile, true)),
    };
  }

  async createExecutionProfile(
    modelRecordId: string,
    body: ExecutionProfileBody,
    session: SessionContext,
    request: Request,
  ) {
    this.assertUuid(modelRecordId, 'model_record_id');
    await this.assertModelExists(modelRecordId);
    const input = this.validateExecutionProfileBody(body, { partial: false });
    const data = input as Prisma.AiModelExecutionProfileUncheckedCreateInput;

    const profile = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.aiModelExecutionProfile.updateMany({
          where: {
            aiModelId: modelRecordId,
            deletedAt: null,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.aiModelExecutionProfile.create({
        data: {
          ...data,
          aiModelId: modelRecordId,
        },
        include: {
          revisions: true,
        },
      });
    });

    await this.auditLogService.write({
      action: 'admin_create_execution_profile',
      targetType: 'ai_model_execution_profile',
      targetId: profile.id,
      session,
      request,
      metadata: {
        ai_model_id: modelRecordId,
        adapter_key: profile.adapterKey,
        is_default: profile.isDefault,
      },
    });

    return {
      item: this.serializeAdminExecutionProfile(profile, true),
    };
  }

  async getExecutionProfile(profileId: string) {
    const profile = await this.findExecutionProfileOrThrow(profileId, true);
    return {
      item: this.serializeAdminExecutionProfile(profile, true),
    };
  }

  async updateExecutionProfile(
    profileId: string,
    body: ExecutionProfileBody,
    session: SessionContext,
    request: Request,
  ) {
    const existing = await this.findExecutionProfileOrThrow(profileId, false);
    const input = this.validateExecutionProfileBody(body, { partial: true });
    const data = input as Prisma.AiModelExecutionProfileUncheckedUpdateInput;

    const profile = await prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.aiModelExecutionProfile.updateMany({
          where: {
            aiModelId: existing.aiModelId,
            id: {
              not: existing.id,
            },
            deletedAt: null,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.aiModelExecutionProfile.update({
        where: {
          id: existing.id,
        },
        data,
        include: {
          revisions: true,
        },
      });
    });

    await this.auditLogService.write({
      action: 'admin_update_execution_profile',
      targetType: 'ai_model_execution_profile',
      targetId: profile.id,
      session,
      request,
      metadata: {
        changed_fields: Object.keys(data),
        ai_model_id: profile.aiModelId,
      },
    });

    return {
      item: this.serializeAdminExecutionProfile(profile, true),
    };
  }

  async deleteExecutionProfile(profileId: string, session: SessionContext, request: Request) {
    const existing = await this.findExecutionProfileOrThrow(profileId, false);
    const profile = await prisma.aiModelExecutionProfile.update({
      where: {
        id: existing.id,
      },
      data: {
        isEnabled: false,
        isDefault: false,
        deletedAt: new Date(),
      },
      include: {
        revisions: true,
      },
    });

    await this.auditLogService.write({
      action: 'admin_delete_execution_profile',
      targetType: 'ai_model_execution_profile',
      targetId: profile.id,
      session,
      request,
      metadata: {
        ai_model_id: profile.aiModelId,
      },
    });

    return {
      deleted: true,
      item: this.serializeAdminExecutionProfile(profile, true),
    };
  }

  async listExecutionProfileRevisions(profileId: string) {
    this.assertUuid(profileId, 'profile_id');
    await this.findExecutionProfileOrThrow(profileId, false);
    const revisions = await prisma.aiModelExecutionProfileRevision.findMany({
      where: {
        executionProfileId: profileId,
      },
      orderBy: [{ revisionNo: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      items: revisions.map((revision) => this.serializeExecutionProfileRevision(revision)),
    };
  }

  async createExecutionProfileRevision(
    profileId: string,
    body: ExecutionProfileRevisionBody,
    session: SessionContext,
    request: Request,
  ) {
    const profile = await this.findExecutionProfileOrThrow(profileId, true);
    const latestRevisionNo = profile.revisions.reduce(
      (max, revision) => Math.max(max, revision.revisionNo),
      0,
    );
    const sourceRevision = profile.revisions.find(
      (revision) => revision.status === ExecutionProfileRevisionStatus.active,
    );
    const input = this.validateExecutionProfileRevisionBody(body, {
      partial: false,
      source: sourceRevision ?? profile,
    });
    const revision = await prisma.aiModelExecutionProfileRevision.create({
      data: {
        ...(input as Prisma.AiModelExecutionProfileRevisionUncheckedCreateInput),
        executionProfileId: profile.id,
        revisionNo: latestRevisionNo + 1,
        status: ExecutionProfileRevisionStatus.draft,
        createdBy: session.userId,
      },
    });

    await this.auditLogService.write({
      action: 'admin_create_execution_profile_revision',
      targetType: 'ai_model_execution_profile_revision',
      targetId: revision.id,
      session,
      request,
      metadata: {
        execution_profile_id: profile.id,
        revision_no: revision.revisionNo,
      },
    });

    return {
      item: this.serializeExecutionProfileRevision(revision),
    };
  }

  async updateExecutionProfileRevision(
    revisionId: string,
    body: ExecutionProfileRevisionBody,
    session: SessionContext,
    request: Request,
  ) {
    const existing = await this.findRevisionOrThrow(revisionId);
    if (existing.status !== ExecutionProfileRevisionStatus.draft) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'revision_not_editable',
        '只有 draft revision 可以编辑',
      );
    }

    const input = this.validateExecutionProfileRevisionBody(body, {
      partial: true,
      source: existing,
    });
    const revision = await prisma.aiModelExecutionProfileRevision.update({
      where: {
        id: existing.id,
      },
      data: input,
    });

    await this.auditLogService.write({
      action: 'admin_update_execution_profile_revision',
      targetType: 'ai_model_execution_profile_revision',
      targetId: revision.id,
      session,
      request,
      metadata: {
        changed_fields: Object.keys(input),
        execution_profile_id: revision.executionProfileId,
        revision_no: revision.revisionNo,
      },
    });

    return {
      item: this.serializeExecutionProfileRevision(revision),
    };
  }

  async lintExecutionProfileRevision(revisionId: string) {
    const revision = await this.findRevisionOrThrow(revisionId);
    return {
      result: this.lintRevision(revision),
    };
  }

  async previewExecutionProfileRevision(
    revisionId: string,
    body: ExecutionProfilePreviewBody,
  ): Promise<{ preview: ExecutionProfilePreviewResult }> {
    const revision = await this.findRevisionOrThrow(revisionId);
    const lint = this.lintRevision(revision);
    if (!lint.ok) {
      throw validationFailed(lint.errors);
    }
    return {
      preview: this.buildRevisionPreview(revision, body),
    };
  }

  async testExecutionProfileRevision(revisionId: string) {
    const revision = await this.findRevisionOrThrow(revisionId);
    const lint = this.lintRevision(revision);
    return {
      result: {
        ...lint,
        dry_run: true,
        message: lint.ok
          ? 'Dry-run passed: profile revision can build a sanitized request preview.'
          : 'Dry-run failed: fix lint errors before activation.',
      },
    };
  }

  async activateExecutionProfileRevision(
    revisionId: string,
    session: SessionContext,
    request: Request,
  ) {
    const existing = await this.findRevisionOrThrow(revisionId);
    const lint = this.lintRevision(existing);
    if (!lint.ok) {
      throw validationFailed(lint.errors);
    }
    const now = new Date();
    const revision = await prisma.$transaction(async (tx) => {
      await tx.aiModelExecutionProfileRevision.updateMany({
        where: {
          executionProfileId: existing.executionProfileId,
          status: ExecutionProfileRevisionStatus.active,
          id: {
            not: existing.id,
          },
        },
        data: {
          status: ExecutionProfileRevisionStatus.archived,
          archivedAt: now,
        },
      });

      const active = await tx.aiModelExecutionProfileRevision.update({
        where: {
          id: existing.id,
        },
        data: {
          status: ExecutionProfileRevisionStatus.active,
          activatedAt: now,
          activatedBy: session.userId,
          archivedAt: null,
        },
      });

      await tx.aiModelExecutionProfile.update({
        where: {
          id: existing.executionProfileId,
        },
        data: {
          adapterKey: active.adapterKey,
          adapterVersion: active.adapterVersion,
          transportKey: active.transportKey,
          upstreamModelId: active.upstreamModelId,
          upstreamEndpointPath: active.upstreamEndpointPath,
          referenceTransferMode: active.referenceTransferMode,
          supportsReferenceImage: active.supportsReferenceImage,
          maxReferenceImages: active.maxReferenceImages,
          parameterSchema: active.parameterSchema as Prisma.InputJsonValue,
          defaultParams: active.defaultParams as Prisma.InputJsonValue,
          requestMapping: active.requestMapping as Prisma.InputJsonValue,
          responseParserKey: active.responseParserKey,
          capabilities: active.capabilities as Prisma.InputJsonValue,
          validationRules: active.validationRules as Prisma.InputJsonValue,
        },
      });

      return active;
    });

    await this.auditLogService.write({
      action: 'admin_activate_execution_profile_revision',
      targetType: 'ai_model_execution_profile_revision',
      targetId: revision.id,
      session,
      request,
      metadata: {
        execution_profile_id: revision.executionProfileId,
        revision_no: revision.revisionNo,
      },
    });

    return {
      item: this.serializeExecutionProfileRevision(revision),
    };
  }

  async uploadModelIcon(
    file: Express.Multer.File | undefined,
    session: SessionContext,
    request: Request,
  ) {
    if (!file) {
      throw validationFailed([{ field: 'file', message: '请选择图标文件' }]);
    }
    if (!MODEL_ICON_MIME_TYPES.has(file.mimetype)) {
      throw validationFailed([{ field: 'file', message: '图标仅支持 JPG、PNG、WebP、GIF 或 SVG' }]);
    }
    if (file.size > DEFAULT_MAX_IMAGE_BYTES) {
      throw validationFailed([{ field: 'file', message: '图标文件不能超过 10MB' }]);
    }

    const config = loadConfig();
    const iconRoot = join(config.localStorageRoot, MODEL_ICON_DIR);
    await mkdir(iconRoot, { recursive: true });
    const extension =
      MODEL_ICON_EXTENSIONS[file.mimetype] ?? normalizeFileExtension(file.originalname);
    const digest = createHash('sha256').update(file.buffer).digest('hex').slice(0, 16);
    const filename = `${Date.now()}-${digest}-${randomUUID()}${extension}`;
    await writeFile(join(iconRoot, filename), file.buffer);

    await this.auditLogService.write({
      action: 'admin_upload_model_icon',
      targetType: 'ai_model_icon',
      targetId: null,
      session,
      request,
      metadata: {
        filename,
        mime_type: file.mimetype,
        size_bytes: file.size,
      },
    });

    return {
      url: `/api/v1/model-icons/${filename}`,
    };
  }

  async downloadModelIcon(filename: string, response: Response) {
    const safeFilename = this.readSafeIconFilename(filename);
    const path = join(loadConfig().localStorageRoot, MODEL_ICON_DIR, safeFilename);
    response.setHeader('cache-control', 'public, max-age=86400');
    response.setHeader('content-type', contentTypeFromExtension(safeFilename));
    return new StreamableFile(createReadStream(path));
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

    if (!options.partial || body.modality !== undefined) {
      input.modality = this.readModality(body.modality, details);
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

    if (body.icon_url !== undefined) {
      input.iconUrl = this.readNullableString(body.icon_url, 'icon_url', details, {
        max: MAX_ICON_URL_LENGTH,
      });
    }

    if (!options.partial || body.description !== undefined) {
      input.description = this.readNullableString(body.description, 'description', details, {
        max: MAX_DESCRIPTION_LENGTH,
      });
    }

    if (!options.partial || body.endpoint_types !== undefined) {
      input.endpointTypes = this.readEndpointTypes(body.endpoint_types, details);
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

  private validateExecutionProfileBody(
    body: ExecutionProfileBody,
    options: { partial: boolean },
  ):
    | Prisma.AiModelExecutionProfileUncheckedCreateInput
    | Prisma.AiModelExecutionProfileUncheckedUpdateInput {
    const details: ValidationDetail[] = [];
    const input: Prisma.AiModelExecutionProfileUncheckedUpdateInput = {};

    if (!options.partial || body.name !== undefined) {
      const name = this.readString(body.name, 'name', details, { min: 1, max: 160 });
      if (name !== null) {
        input.name = name;
      }
    }
    if (!options.partial || body.operation !== undefined) {
      input.operation = this.readExecutionProfileOperation(body.operation, details);
    }
    this.assignExecutionConfigInput(input, body, details, options.partial);
    if (!options.partial || body.is_default !== undefined) {
      input.isDefault = this.readBoolean(body.is_default, 'is_default', details, false);
    }
    if (!options.partial || body.is_enabled !== undefined) {
      input.isEnabled = this.readBoolean(body.is_enabled, 'is_enabled', details, true);
    }
    if (!options.partial || body.sort_order !== undefined) {
      input.sortOrder = this.readInteger(body.sort_order, 'sort_order', details, {
        fallback: 0,
        min: -100000,
        max: 100000,
      });
    }

    if (details.length > 0) {
      throw validationFailed(details);
    }

    return input;
  }

  private validateExecutionProfileRevisionBody(
    body: ExecutionProfileRevisionBody,
    options: {
      partial: boolean;
      source: ExecutionProfileRevisionRecord | ExecutionProfileWithRevisions;
    },
  ):
    | Prisma.AiModelExecutionProfileRevisionUncheckedCreateInput
    | Prisma.AiModelExecutionProfileRevisionUncheckedUpdateInput {
    const details: ValidationDetail[] = [];
    const input: Prisma.AiModelExecutionProfileRevisionUncheckedUpdateInput = {};

    if (!options.partial || body.source_kind !== undefined) {
      input.sourceKind =
        body.source_kind === undefined && !options.partial
          ? this.readSourceKind(readProfileSource(options.source, 'sourceKind'), details)
          : this.readSourceKind(body.source_kind, details);
    }
    if (!options.partial || body.source_url !== undefined) {
      input.sourceUrl =
        body.source_url === undefined && !options.partial
          ? readNullableProfileSource(options.source, 'sourceUrl')
          : this.readNullableString(body.source_url, 'source_url', details, { max: 1000 });
    }
    if (!options.partial || body.source_checked_at !== undefined) {
      input.sourceCheckedAt =
        body.source_checked_at === undefined && !options.partial
          ? readNullableProfileDate(options.source, 'sourceCheckedAt')
          : this.readNullableDate(body.source_checked_at, 'source_checked_at', details);
    }
    if (!options.partial || body.source_summary !== undefined) {
      input.sourceSummary =
        body.source_summary === undefined && !options.partial
          ? readNullableProfileSource(options.source, 'sourceSummary')
          : this.readNullableString(body.source_summary, 'source_summary', details, { max: 1200 });
    }
    this.assignExecutionConfigInput(input, body, details, options.partial, options.source);
    if (!options.partial || body.change_summary !== undefined) {
      input.changeSummary =
        body.change_summary === undefined && !options.partial
          ? null
          : this.readNullableString(body.change_summary, 'change_summary', details, { max: 1200 });
    }

    if (details.length > 0) {
      throw validationFailed(details);
    }

    return input;
  }

  private assignExecutionConfigInput(
    input:
      | Prisma.AiModelExecutionProfileUncheckedUpdateInput
      | Prisma.AiModelExecutionProfileRevisionUncheckedUpdateInput,
    body: ExecutionProfileBody | ExecutionProfileRevisionBody,
    details: ValidationDetail[],
    partial: boolean,
    source?: ExecutionProfileRevisionRecord | ExecutionProfileWithRevisions,
  ) {
    const readStringWithFallback = (
      key: keyof Pick<
        ExecutionProfileBody,
        | 'adapter_key'
        | 'adapter_version'
        | 'transport_key'
        | 'upstream_model_id'
        | 'response_parser_key'
      >,
      field: string,
      fallbackField: keyof ExecutionProfileRevisionRecord | keyof ExecutionProfileWithRevisions,
      min: number,
      max: number,
    ) => {
      if (partial && body[key] === undefined) {
        return undefined;
      }
      if (body[key] === undefined && source) {
        return String(readProfileSource(source, fallbackField));
      }
      return this.readString(body[key], field, details, { min, max }) ?? undefined;
    };

    const adapterKey = readStringWithFallback('adapter_key', 'adapter_key', 'adapterKey', 1, 120);
    if (adapterKey !== undefined) {
      input.adapterKey = adapterKey;
    }
    const adapterVersion = readStringWithFallback(
      'adapter_version',
      'adapter_version',
      'adapterVersion',
      1,
      40,
    );
    if (adapterVersion !== undefined) {
      input.adapterVersion = adapterVersion;
    }
    const transportKey = readStringWithFallback(
      'transport_key',
      'transport_key',
      'transportKey',
      1,
      80,
    );
    if (transportKey !== undefined) {
      input.transportKey = transportKey;
    }
    const upstreamModelId = readStringWithFallback(
      'upstream_model_id',
      'upstream_model_id',
      'upstreamModelId',
      1,
      240,
    );
    if (upstreamModelId !== undefined) {
      input.upstreamModelId = upstreamModelId;
    }
    if (!partial || body.upstream_endpoint_path !== undefined) {
      input.upstreamEndpointPath =
        body.upstream_endpoint_path === undefined && source
          ? readNullableProfileSource(source, 'upstreamEndpointPath')
          : this.readNullableString(
              body.upstream_endpoint_path,
              'upstream_endpoint_path',
              details,
              {
                max: 240,
              },
            );
    }
    if (!partial || body.reference_transfer_mode !== undefined) {
      input.referenceTransferMode =
        body.reference_transfer_mode === undefined && source
          ? this.readReferenceTransferMode(
              readProfileSource(source, 'referenceTransferMode'),
              details,
            )
          : this.readReferenceTransferMode(body.reference_transfer_mode, details);
    }
    if (!partial || body.supports_reference_image !== undefined) {
      input.supportsReferenceImage =
        body.supports_reference_image === undefined && source
          ? Boolean(readProfileSource(source, 'supportsReferenceImage'))
          : this.readBoolean(
              body.supports_reference_image,
              'supports_reference_image',
              details,
              false,
            );
    }
    if (!partial || body.max_reference_images !== undefined) {
      input.maxReferenceImages =
        body.max_reference_images === undefined && source
          ? Number(readProfileSource(source, 'maxReferenceImages'))
          : this.readInteger(body.max_reference_images, 'max_reference_images', details, {
              fallback: 0,
              min: 0,
              max: 64,
            });
    }
    const responseParserKey = readStringWithFallback(
      'response_parser_key',
      'response_parser_key',
      'responseParserKey',
      1,
      120,
    );
    if (responseParserKey !== undefined) {
      input.responseParserKey = responseParserKey;
    }

    const schemaSource =
      body.parameter_schema !== undefined
        ? body.parameter_schema
        : source
          ? readProfileSource(source, 'parameterSchema')
          : [];
    let schema: ParameterSchemaField[] | null = null;
    if (!partial || body.parameter_schema !== undefined) {
      try {
        schema = normalizeParameterSchema(schemaSource);
        input.parameterSchema = parameterSchemaToJson(schema);
      } catch (error) {
        this.pushSchemaValidationDetails(error, details);
      }
    } else if (source) {
      schema = normalizeParameterSchema(readProfileSource(source, 'parameterSchema'));
    }

    if (!partial || body.default_params !== undefined || body.parameter_schema !== undefined) {
      const defaultParamsSource =
        body.default_params !== undefined
          ? body.default_params
          : source
            ? readProfileSource(source, 'defaultParams')
            : {};
      try {
        input.defaultParams = assertDefaultParams(schema ?? [], defaultParamsSource);
      } catch (error) {
        this.pushSchemaValidationDetails(error, details, 'default_params');
      }
    }

    if (!partial || body.request_mapping !== undefined) {
      input.requestMapping =
        body.request_mapping === undefined && source
          ? (readProfileSource(source, 'requestMapping') as Prisma.InputJsonValue)
          : this.readJsonObject(body.request_mapping, 'request_mapping', details);
    }
    if (!partial || body.capabilities !== undefined) {
      input.capabilities =
        body.capabilities === undefined && source
          ? (readProfileSource(source, 'capabilities') as Prisma.InputJsonValue)
          : this.readJsonObject(body.capabilities, 'capabilities', details);
    }
    if (!partial || body.validation_rules !== undefined) {
      input.validationRules =
        body.validation_rules === undefined && source
          ? (readProfileSource(source, 'validationRules') as Prisma.InputJsonValue)
          : this.readJsonObject(body.validation_rules, 'validation_rules', details);
    }
  }

  private async findExecutionProfileOrThrow(
    profileId: string,
    includeRevisions: true,
  ): Promise<ExecutionProfileWithRevisions>;
  private async findExecutionProfileOrThrow(
    profileId: string,
    includeRevisions: false,
  ): Promise<Prisma.AiModelExecutionProfileGetPayload<object>>;
  private async findExecutionProfileOrThrow(profileId: string, includeRevisions: boolean) {
    this.assertUuid(profileId, 'profile_id');
    const profile = await prisma.aiModelExecutionProfile.findFirst({
      where: {
        id: profileId,
        deletedAt: null,
      },
      include: includeRevisions
        ? {
            revisions: {
              orderBy: [{ revisionNo: 'desc' }, { createdAt: 'desc' }],
            },
          }
        : undefined,
    });
    if (!profile) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '执行配置不存在');
    }
    return profile;
  }

  private async findRevisionOrThrow(revisionId: string) {
    this.assertUuid(revisionId, 'revision_id');
    const revision = await prisma.aiModelExecutionProfileRevision.findUnique({
      where: {
        id: revisionId,
      },
    });
    if (!revision) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '执行配置 revision 不存在');
    }
    return revision;
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

  private async assertPublicModelExists(modelId: string) {
    this.assertUuid(modelId, 'model_record_id');
    const model = await prisma.aiModel.findFirst({
      where: {
        id: modelId,
        deletedAt: null,
        isEnabled: true,
      },
      select: {
        id: true,
      },
    });

    if (!model) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '模型不存在或已禁用');
    }
  }

  private async assertModelExists(modelId: string) {
    this.assertUuid(modelId, 'model_record_id');
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

  private serializePublicModel(model: FavoriteAwareModel): PublicAiModel {
    const defaultExecutionProfile = this.serializeDefaultExecutionProfile(
      this.findDefaultExecutionProfile(model),
    );

    return {
      id: model.id,
      model_id: model.modelId,
      display_name: model.displayName,
      provider_name: model.providerName,
      modality: model.modality,
      icon_url: model.iconUrl,
      description: model.description,
      endpoint_types: model.endpointTypes,
      reference_transfer_mode: model.referenceTransferMode,
      supports_reference_image: model.supportsReferenceImage,
      is_recommended: model.isRecommended,
      is_favorite: Boolean(model.favorites?.length),
      default_params: model.defaultParams,
      parameter_schema: normalizeParameterSchema(model.parameterSchema),
      default_execution_profile: defaultExecutionProfile,
    };
  }

  private serializeAdminModel(model: SerializableAdminModel): AdminAiModel {
    return {
      ...this.serializePublicModel(model),
      is_favorite: false,
      is_enabled: model.isEnabled,
      sort_order: model.sortOrder,
      created_at: model.createdAt.toISOString(),
      updated_at: model.updatedAt.toISOString(),
      deleted_at: model.deletedAt?.toISOString() ?? null,
    };
  }

  private serializeAdminExecutionProfile(
    profile: ExecutionProfileWithRevisions,
    includeRevisions: boolean,
  ): AdminExecutionProfile {
    return {
      id: profile.id,
      ai_model_id: profile.aiModelId,
      name: profile.name,
      operation: profile.operation,
      adapter_key: profile.adapterKey,
      adapter_version: profile.adapterVersion,
      transport_key: profile.transportKey,
      upstream_model_id: profile.upstreamModelId,
      upstream_endpoint_path: profile.upstreamEndpointPath,
      reference_transfer_mode: profile.referenceTransferMode,
      supports_reference_image: profile.supportsReferenceImage,
      max_reference_images: profile.maxReferenceImages,
      parameter_schema: normalizeParameterSchema(profile.parameterSchema),
      default_params: profile.defaultParams,
      request_mapping: profile.requestMapping,
      response_parser_key: profile.responseParserKey,
      capabilities: profile.capabilities,
      validation_rules: profile.validationRules,
      is_default: profile.isDefault,
      is_enabled: profile.isEnabled,
      sort_order: profile.sortOrder,
      created_at: profile.createdAt.toISOString(),
      updated_at: profile.updatedAt.toISOString(),
      deleted_at: profile.deletedAt?.toISOString() ?? null,
      ...(includeRevisions
        ? {
            revisions: profile.revisions.map((revision) =>
              this.serializeExecutionProfileRevision(revision),
            ),
          }
        : {}),
    };
  }

  private serializeExecutionProfileRevision(
    revision: ExecutionProfileRevisionRecord,
  ): AdminExecutionProfileRevision {
    return {
      id: revision.id,
      execution_profile_id: revision.executionProfileId,
      revision_no: revision.revisionNo,
      status: revision.status,
      source_kind: revision.sourceKind,
      source_url: revision.sourceUrl,
      source_checked_at: revision.sourceCheckedAt?.toISOString() ?? null,
      source_summary: revision.sourceSummary,
      adapter_key: revision.adapterKey,
      adapter_version: revision.adapterVersion,
      transport_key: revision.transportKey,
      upstream_model_id: revision.upstreamModelId,
      upstream_endpoint_path: revision.upstreamEndpointPath,
      reference_transfer_mode: revision.referenceTransferMode,
      supports_reference_image: revision.supportsReferenceImage,
      max_reference_images: revision.maxReferenceImages,
      parameter_schema: normalizeParameterSchema(revision.parameterSchema),
      default_params: revision.defaultParams,
      request_mapping: revision.requestMapping,
      response_parser_key: revision.responseParserKey,
      capabilities: revision.capabilities,
      validation_rules: revision.validationRules,
      change_summary: revision.changeSummary,
      created_by: revision.createdBy,
      created_at: revision.createdAt.toISOString(),
      activated_by: revision.activatedBy,
      activated_at: revision.activatedAt?.toISOString() ?? null,
      archived_at: revision.archivedAt?.toISOString() ?? null,
    };
  }

  private lintRevision(revision: ExecutionProfileRevisionRecord): ExecutionProfileLintResult {
    const errors: ValidationDetail[] = [];
    const warnings: ValidationDetail[] = [];

    try {
      const schema = normalizeParameterSchema(revision.parameterSchema);
      assertDefaultParams(schema, revision.defaultParams);
    } catch (error) {
      this.pushSchemaValidationDetails(error, errors);
    }

    const mapping = asJsonObject(revision.requestMapping);
    if (!mapping || !Array.isArray(mapping.fields) || mapping.fields.length === 0) {
      errors.push({
        field: 'request_mapping.fields',
        message: 'request_mapping.fields 必须至少包含一个映射字段',
      });
    }
    if (mapping && mapping.content_type !== 'json' && mapping.content_type !== 'multipart') {
      errors.push({
        field: 'request_mapping.content_type',
        message: 'content_type 必须是 json 或 multipart',
      });
    }
    if (!revision.adapterKey.trim()) {
      errors.push({ field: 'adapter_key', message: 'adapter_key 不能为空' });
    }
    if (!revision.upstreamModelId.trim()) {
      errors.push({ field: 'upstream_model_id', message: 'upstream_model_id 不能为空' });
    }
    if (!revision.responseParserKey.trim()) {
      errors.push({ field: 'response_parser_key', message: 'response_parser_key 不能为空' });
    }
    if (!revision.sourceUrl) {
      warnings.push({ field: 'source_url', message: '建议记录参数来源 URL' });
    }
    if (!revision.sourceCheckedAt) {
      warnings.push({ field: 'source_checked_at', message: '建议记录来源检查时间' });
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
    };
  }

  private buildRevisionPreview(
    revision: ExecutionProfileRevisionRecord,
    body: ExecutionProfilePreviewBody,
  ): ExecutionProfilePreviewResult {
    const schema = normalizeParameterSchema(revision.parameterSchema);
    const parameterResult = assertDefaultParams(schema, {
      ...asJsonObject(revision.defaultParams),
      ...asJsonObject(body.parameters),
    });
    const mapping = asJsonObject(revision.requestMapping) ?? {};
    const contentType = String(mapping.content_type ?? 'json');
    const prompt =
      typeof body.prompt === 'string' && body.prompt.trim()
        ? body.prompt.trim().slice(0, 300)
        : 'Preview prompt';
    const bodyPayload = this.compilePreviewMapping(mapping, {
      model: revision.upstreamModelId,
      prompt,
      params: parameterResult,
    });
    const endpointPath =
      revision.upstreamEndpointPath ??
      (revision.adapterKey === 'openai_images_edit'
        ? '/v1/images/edits'
        : '/v1/images/generations');

    return {
      adapter_key: revision.adapterKey,
      adapter_version: revision.adapterVersion,
      transport_key: revision.transportKey,
      endpoint_path: endpointPath,
      content_type: contentType,
      body: bodyPayload,
      reference_asset_ids: Array.isArray(body.reference_asset_ids)
        ? body.reference_asset_ids.map(String).slice(0, revision.maxReferenceImages)
        : [],
    };
  }

  private compilePreviewMapping(
    mapping: Record<string, unknown>,
    context: {
      model: string;
      prompt: string;
      params: Record<string, unknown>;
    },
  ) {
    const output: Record<string, unknown> = {};
    const fields = Array.isArray(mapping.fields) ? mapping.fields : [];
    for (const rawField of fields) {
      const field = asJsonObject(rawField);
      const source = typeof field?.source === 'string' ? field.source : '';
      const target = typeof field?.target === 'string' ? field.target : '';
      if (!source || !target) {
        continue;
      }
      const value = readPreviewSource(source, context);
      if ((value === undefined || value === null) && field?.omit_if_null === true) {
        continue;
      }
      if (value !== undefined) {
        output[target] = value;
      }
    }
    return output;
  }

  private findDefaultExecutionProfile(
    model: Pick<FavoriteAwareModel, 'executionProfiles'>,
  ): SerializableExecutionProfile | null {
    return (
      model.executionProfiles?.find(
        (profile) =>
          profile.isDefault &&
          profile.isEnabled &&
          !profile.deletedAt &&
          profile.revisions.some(
            (revision) => revision.status === ExecutionProfileRevisionStatus.active,
          ),
      ) ?? null
    );
  }

  private serializeDefaultExecutionProfile(
    profile: SerializableExecutionProfile | null,
  ): PublicDefaultExecutionProfile | null {
    if (!profile) {
      return null;
    }

    const activeRevision =
      profile.revisions.find(
        (revision) => revision.status === ExecutionProfileRevisionStatus.active,
      ) ?? null;
    if (!activeRevision) {
      return null;
    }

    return {
      id: profile.id,
      revision_id: activeRevision.id,
      operation: profile.operation,
      adapter_key: activeRevision.adapterKey,
      adapter_version: activeRevision.adapterVersion,
      reference_transfer_mode: activeRevision.referenceTransferMode,
      supports_reference_image: activeRevision.supportsReferenceImage,
      max_reference_images: activeRevision.maxReferenceImages,
      parameter_schema: normalizeParameterSchema(activeRevision.parameterSchema),
      default_params: activeRevision.defaultParams,
      capabilities: this.serializeCapabilities(activeRevision),
    };
  }

  private serializeCapabilities(revision: {
    capabilities: unknown;
    supportsReferenceImage: boolean;
    maxReferenceImages: number;
  }): PublicDefaultExecutionProfile['capabilities'] {
    const capabilities =
      revision.capabilities && typeof revision.capabilities === 'object'
        ? { ...(revision.capabilities as Record<string, unknown>) }
        : {};
    capabilities.supports_reference_image = revision.supportsReferenceImage;
    capabilities.max_reference_images = revision.maxReferenceImages;
    return capabilities as PublicDefaultExecutionProfile['capabilities'];
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

  private readOptionalBooleanString(value: unknown, field: string): boolean | undefined {
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
        field,
        message: `${field} 必须是 true 或 false`,
      },
    ]);
  }

  private readModality(value: unknown, details: ValidationDetail[]): ModelModality {
    if (value === ModelModality.chat || value === 'chat') {
      return ModelModality.chat;
    }
    if (value === ModelModality.image || value === 'image' || value === undefined) {
      return ModelModality.image;
    }
    if (value === ModelModality.video || value === 'video') {
      return ModelModality.video;
    }

    details.push({
      field: 'modality',
      message: 'modality 只支持 chat、image、video',
    });
    return ModelModality.image;
  }

  private readExecutionProfileOperation(
    value: unknown,
    details: ValidationDetail[],
  ): ExecutionProfileOperation {
    if (
      value === ExecutionProfileOperation.text_to_image ||
      value === ExecutionProfileOperation.image_to_image ||
      value === ExecutionProfileOperation.image_edit ||
      value === ExecutionProfileOperation.conversational_image
    ) {
      return value;
    }
    if (value === undefined || value === null || value === '') {
      return ExecutionProfileOperation.text_to_image;
    }

    details.push({
      field: 'operation',
      message: 'operation 不受支持',
    });
    return ExecutionProfileOperation.text_to_image;
  }

  private readSourceKind(value: unknown, details: ValidationDetail[]): ExecutionProfileSourceKind {
    if (
      value === ExecutionProfileSourceKind.manual ||
      value === ExecutionProfileSourceKind.openai_official ||
      value === ExecutionProfileSourceKind.gemini_official ||
      value === ExecutionProfileSourceKind.third_party_docs ||
      value === ExecutionProfileSourceKind.imported_json
    ) {
      return value;
    }
    if (value === undefined || value === null || value === '') {
      return ExecutionProfileSourceKind.manual;
    }

    details.push({
      field: 'source_kind',
      message: 'source_kind 不受支持',
    });
    return ExecutionProfileSourceKind.manual;
  }

  private readOptionalModality(value: unknown): ModelModality | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const details: ValidationDetail[] = [];
    const modality = this.readModality(value, details);
    if (details.length > 0) {
      throw validationFailed(details);
    }
    return modality;
  }

  private readEndpointTypes(value: unknown, details: ValidationDetail[]): ModelEndpointType[] {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    const endpointTypes = [...new Set(values.map((item) => this.readEndpointType(item, details)))];

    if (endpointTypes.length === 0) {
      details.push({
        field: 'endpoint_types',
        message: 'endpoint_types 至少选择一个端点类型',
      });
      return [ModelEndpointType.openai_image_generations];
    }

    return endpointTypes;
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
      field: 'endpoint_types',
      message: 'endpoint_types 包含不支持的端点类型',
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

  private readNullableDate(
    value: unknown,
    field: string,
    details: ValidationDetail[],
  ): Date | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      details.push({
        field,
        message: `${field} 必须是合法日期`,
      });
      return null;
    }
    return date;
  }

  private readJsonObject(
    value: unknown,
    field: string,
    details: ValidationDetail[],
  ): Prisma.InputJsonObject {
    if (value === undefined || value === null) {
      return {};
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      details.push({
        field,
        message: `${field} 必须是 JSON 对象`,
      });
      return {};
    }
    return value as Prisma.InputJsonObject;
  }

  private pushSchemaValidationDetails(
    error: unknown,
    details: ValidationDetail[],
    prefix = 'parameter_schema',
  ) {
    if (error instanceof Error && Array.isArray((error as Error & { details?: unknown }).details)) {
      for (const detail of (error as Error & { details: ValidationDetail[] }).details) {
        details.push({
          field: detail.field.startsWith(prefix) ? detail.field : `${prefix}.${detail.field}`,
          message: detail.message,
        });
      }
      return;
    }

    details.push({
      field: prefix,
      message: error instanceof Error ? error.message : '参数 Schema 不合法',
    });
  }

  private readOptionalSearch(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const text = String(value).trim();
    if (!text) {
      return undefined;
    }
    return text.slice(0, 120);
  }

  private readSafeIconFilename(value: string) {
    if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
      throw validationFailed([{ field: 'filename', message: '图标文件名无效' }]);
    }
    return value;
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

  private sanitizeUpstreamError(error: unknown) {
    if (error instanceof Error) {
      return error.message.slice(0, 300);
    }
    return '无法连接 new-api';
  }

  private summarizeUpstreamStatus(status: number) {
    if (status === 401 || status === 403) {
      return 'new-api 认证失败，请检查 API Key';
    }
    if (status === 404) {
      return 'new-api 未提供 /v1/models 接口';
    }
    if (status >= 500) {
      return 'new-api 服务暂时不可用';
    }
    return `new-api 返回 HTTP ${status}`;
  }

  private throwSchemaValidationError(error: unknown): never {
    if (error instanceof Error) {
      let details: ValidationDetail[] | null = null;
      try {
        details = JSON.parse(error.message) as ValidationDetail[];
      } catch {
        details = null;
      }

      throw validationFailed(
        details ?? [
          {
            field: 'parameter_schema',
            message: error.message,
          },
        ],
      );
    }

    throw validationFailed([
      {
        field: 'parameter_schema',
        message: '参数 Schema 不合法',
      },
    ]);
  }
}

function normalizeFileExtension(filename: string) {
  const extension = extname(filename).toLowerCase();
  return extension && /^\.[a-z0-9]+$/.test(extension) ? extension : '.png';
}

function contentTypeFromExtension(filename: string) {
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (filename.endsWith('.webp')) {
    return 'image/webp';
  }
  if (filename.endsWith('.gif')) {
    return 'image/gif';
  }
  if (filename.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  return 'image/png';
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readProfileSource(
  source: ExecutionProfileRevisionRecord | ExecutionProfileWithRevisions,
  field: keyof ExecutionProfileRevisionRecord | keyof ExecutionProfileWithRevisions,
): unknown {
  return (source as unknown as Record<string, unknown>)[field as string];
}

function readNullableProfileSource(
  source: ExecutionProfileRevisionRecord | ExecutionProfileWithRevisions,
  field: keyof ExecutionProfileRevisionRecord | keyof ExecutionProfileWithRevisions,
): string | null {
  const value = readProfileSource(source, field);
  return typeof value === 'string' && value.trim() ? value : null;
}

function readNullableProfileDate(
  source: ExecutionProfileRevisionRecord | ExecutionProfileWithRevisions,
  field: keyof ExecutionProfileRevisionRecord | keyof ExecutionProfileWithRevisions,
): Date | null {
  const value = readProfileSource(source, field);
  return value instanceof Date ? value : null;
}

function readPreviewSource(
  source: string,
  context: {
    model: string;
    prompt: string;
    params: Record<string, unknown>;
  },
) {
  if (source === 'model') {
    return context.model;
  }
  if (source === 'prompt') {
    return context.prompt;
  }
  if (source.startsWith('params.')) {
    return source
      .slice('params.'.length)
      .split('.')
      .reduce<unknown>((current, key) => {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          return (current as Record<string, unknown>)[key];
        }
        return undefined;
      }, context.params);
  }
  return undefined;
}
