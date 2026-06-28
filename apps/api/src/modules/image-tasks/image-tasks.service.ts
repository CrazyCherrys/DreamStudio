import { randomUUID } from 'node:crypto';

import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  ExecutionProfileRevisionStatus,
  ImageTaskStatus,
  ModelEndpointType,
  ModelModality,
  Prisma,
  type Asset,
  type ImageTask,
} from '@prisma/client';
import { Queue } from 'bullmq';

import {
  createBullConnectionOptions,
  createImageGenerationQueue,
  type ImageGenerationJobPayload,
} from '@dreamstudio/queue';
import { assetDownloadPath } from '@dreamstudio/storage';
import { prisma } from '@dreamstudio/db';

import { apiError, validationFailed } from '../auth/auth.errors';
import type { SessionContext } from '../auth/auth.types';
import { EncryptionService } from '../new-api-config/encryption.service';
import { normalizeParameterSchema, validateParameters } from '../model-catalog/parameter-schema';
import type {
  CreateImageTaskBody,
  ImageTaskListQuery,
  PublicImageTask,
  PublicTaskAsset,
} from './image-tasks.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREATE_TASK_JOB_NAME = 'image-task';
const MAX_PROMPT_LENGTH = 8000;
const MAX_NEGATIVE_PROMPT_LENGTH = 4000;
const MAX_REFERENCE_ASSETS = 8;
const CLIENT_REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,120}$/;

type ActiveExecutionProfile = Prisma.AiModelExecutionProfileGetPayload<{
  include: {
    revisions: true;
  };
}>;

type TaskWithAssets = ImageTask & {
  resultAssets?: Asset[];
  attempts?: Array<{
    id: string;
    attemptNo: number;
    status: ImageTaskStatus;
    startedAt: Date;
    finishedAt: Date | null;
    httpStatus: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    isRetryable: boolean;
    createdAt: Date;
  }>;
};

@Injectable()
export class ImageTasksService implements OnModuleDestroy {
  private readonly imageQueue: Queue<ImageGenerationJobPayload>;

  constructor(private readonly encryptionService: EncryptionService) {
    this.imageQueue = createImageGenerationQueue(createBullConnectionOptions());
  }

  async onModuleDestroy() {
    await this.imageQueue.close();
  }

  async createTask(body: CreateImageTaskBody, session: SessionContext) {
    const input = await this.validateCreateInput(body, session);

    if (input.clientRequestId) {
      const existing = await prisma.imageTask.findFirst({
        where: {
          userId: session.userId,
          clientRequestId: input.clientRequestId,
        },
        include: {
          resultAssets: true,
        },
      });
      if (existing) {
        return {
          item: this.serializeTask(existing),
        };
      }
    }

    const task = await this.createTaskRecord(input, session.userId);

    await this.enqueueTask(task);

    return {
      item: this.serializeTask(task),
    };
  }

  async listTasks(query: ImageTaskListQuery, session: SessionContext) {
    const status = this.readOptionalStatus(query.status);
    const modelRecordId = this.readOptionalUuid(query.model_record_id, 'model_record_id');
    const page = this.readPositiveInt(query.page, 1, 1, 100000);
    const pageSize = this.readPositiveInt(query.page_size, 20, 1, 100);
    const where = {
      userId: session.userId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(modelRecordId ? { modelRecordId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.imageTask.findMany({
        where,
        include: {
          resultAssets: {
            where: {
              status: 'available',
              deletedAt: null,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.imageTask.count({
        where,
      }),
    ]);

    return {
      items: items.map((task) => this.serializeTask(task)),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  async getTask(taskId: string, session: SessionContext) {
    const task = await this.findOwnTask(taskId, session, true);
    return {
      item: this.serializeTask(task),
    };
  }

  async cancelTask(taskId: string, session: SessionContext) {
    const task = await this.findOwnTask(taskId, session, false);
    if (task.status === 'running') {
      throw apiError(HttpStatus.BAD_REQUEST, 'task_not_cancelable', '运行中的任务不能取消');
    }
    if (task.status !== 'pending') {
      return {
        item: this.serializeTask(task),
      };
    }

    await this.removeQueueJob(task.id);
    const updated = await prisma.imageTask.update({
      where: {
        id: task.id,
      },
      data: {
        status: 'canceled',
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
      include: {
        resultAssets: true,
      },
    });

    return {
      item: this.serializeTask(updated),
    };
  }

  async retryTask(taskId: string, session: SessionContext) {
    const task = await this.findOwnTask(taskId, session, false);
    if (!['failed', 'timeout', 'canceled'].includes(task.status)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'task_not_retryable', '当前任务状态不能重试');
    }

    const prompt = this.decryptTaskPrompt(task);
    const negativePrompt = this.decryptTaskNegativePrompt(task);
    const input = await this.validateCreateInput(
      {
        model_record_id: task.modelRecordId,
        execution_profile_id: task.executionProfileId,
        prompt,
        negative_prompt: negativePrompt,
        parameters: task.parameterSnapshot,
        reference_asset_ids: task.referenceAssetIds,
        client_request_id: randomUUID(),
      },
      session,
    );

    const created = await this.createTaskRecord(input, session.userId);
    await this.enqueueTask(created);

    return {
      item: this.serializeTask(created),
    };
  }

  async deleteTask(taskId: string, session: SessionContext) {
    const task = await this.findOwnTask(taskId, session, false);
    const updated = await prisma.imageTask.update({
      where: {
        id: task.id,
      },
      data: {
        deletedAt: task.deletedAt ?? new Date(),
      },
      include: {
        resultAssets: true,
      },
    });

    return {
      deleted: true,
      item: this.serializeTask(updated),
    };
  }

  private async validateCreateInput(body: CreateImageTaskBody, session: SessionContext) {
    const modelRecordId = this.readUuid(body.model_record_id, 'model_record_id');
    const requestedExecutionProfileId = this.readOptionalUuid(
      body.execution_profile_id,
      'execution_profile_id',
    );
    const prompt = this.readString(body.prompt, 'prompt', 1, MAX_PROMPT_LENGTH);
    const negativePrompt = this.readOptionalString(
      body.negative_prompt,
      'negative_prompt',
      MAX_NEGATIVE_PROMPT_LENGTH,
    );
    const clientRequestId = this.readOptionalClientRequestId(body.client_request_id);
    const newApiConfig = await prisma.userNewApiConfig.findUnique({
      where: {
        userId: session.userId,
      },
    });
    if (!newApiConfig || newApiConfig.status !== 'valid') {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'new_api_config_missing',
        '请先配置并验证 new-api 密钥',
      );
    }

    const model = await prisma.aiModel.findFirst({
      where: {
        id: modelRecordId,
        isEnabled: true,
        deletedAt: null,
        modality: ModelModality.image,
      },
    });
    if (!model) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '模型不存在或已禁用');
    }

    const profile = await this.resolveActiveExecutionProfile(model.id, requestedExecutionProfileId);
    const activeRevision = profile.revisions[0];
    if (!activeRevision) {
      throw apiError(HttpStatus.BAD_REQUEST, 'model_profile_missing', '模型没有可用执行配置');
    }

    const schema = normalizeParameterSchema(activeRevision.parameterSchema);
    const userParameterResult = validateParameters(schema, body.parameters, {
      requireRequiredFields: false,
    });
    if (!userParameterResult.ok) {
      throw validationFailed(userParameterResult.errors);
    }
    const mergedParameterResult = validateParameters(
      schema,
      {
        ...toInputRecord(activeRevision.defaultParams),
        ...userParameterResult.value,
      },
      {
        requireRequiredFields: true,
      },
    );
    const parameterResult = {
      ...mergedParameterResult,
      value: this.applyParameterSendPolicy(schema, mergedParameterResult.value),
    };
    if (!parameterResult.ok) {
      throw validationFailed(parameterResult.errors);
    }

    const referenceAssetIds = this.readReferenceAssetIds(body.reference_asset_ids);
    if (referenceAssetIds.length > 0) {
      if (!activeRevision.supportsReferenceImage) {
        throw validationFailed([
          {
            field: 'reference_asset_ids',
            message: '当前模型不支持参考图',
          },
        ]);
      }
      if (
        activeRevision.maxReferenceImages >= 0 &&
        referenceAssetIds.length > activeRevision.maxReferenceImages
      ) {
        throw validationFailed([
          {
            field: 'reference_asset_ids',
            message: `当前执行配置最多支持 ${activeRevision.maxReferenceImages} 张参考图`,
          },
        ]);
      }
      const count = await prisma.asset.count({
        where: {
          id: {
            in: referenceAssetIds,
          },
          userId: session.userId,
          kind: 'reference_image',
          status: 'available',
          deletedAt: null,
        },
      });
      if (count !== referenceAssetIds.length) {
        throw apiError(HttpStatus.NOT_FOUND, 'not_found', '参考图不存在或不可用');
      }
    }

    const endpointType = this.resolveImageEndpointTypeFromProfile(profile, referenceAssetIds);
    const executionProfileSnapshot = this.buildExecutionProfileSnapshot(profile, activeRevision);
    const requestMappingSnapshot = activeRevision.requestMapping as Prisma.InputJsonValue;
    const resolvedRequestSanitizedSnapshot = this.buildResolvedRequestSanitizedSnapshot({
      endpointType,
      parameters: parameterResult.value,
      profile,
      prompt,
      referenceAssetIds,
      revision: activeRevision,
    });

    const encryptedPrompt = this.encryptionService.encryptSecret(prompt);
    const encryptedNegativePrompt = negativePrompt
      ? this.encryptionService.encryptSecret(negativePrompt)
      : null;

    return {
      model,
      newApiConfig,
      prompt,
      negativePrompt,
      encryptedPrompt,
      encryptedNegativePrompt,
      parameters: parameterResult.value as Prisma.InputJsonObject,
      executionProfile: profile,
      executionProfileRevision: activeRevision,
      executionProfileSnapshot,
      requestMappingSnapshot,
      resolvedRequestSanitizedSnapshot,
      referenceAssetIds,
      endpointType,
      clientRequestId,
    };
  }

  private async createTaskRecord(
    input: Awaited<ReturnType<ImageTasksService['validateCreateInput']>>,
    userId: string,
  ) {
    try {
      return await prisma.imageTask.create({
        data: {
          userId,
          modelRecordId: input.model.id,
          executionProfileId: input.executionProfile.id,
          executionProfileRevisionId: input.executionProfileRevision.id,
          modelIdSnapshot: input.executionProfileRevision.upstreamModelId,
          endpointTypeSnapshot: input.endpointType,
          adapterKeySnapshot: input.executionProfileRevision.adapterKey,
          adapterVersionSnapshot: input.executionProfileRevision.adapterVersion,
          newApiBaseUrlSnapshot: input.newApiConfig.newApiBaseUrl,
          promptSummary: summarizeText(input.prompt),
          encryptedPrompt: input.encryptedPrompt.encrypted,
          promptIv: input.encryptedPrompt.iv,
          promptTag: input.encryptedPrompt.tag,
          negativePromptSummary: input.negativePrompt ? summarizeText(input.negativePrompt) : null,
          encryptedNegativePrompt: input.encryptedNegativePrompt?.encrypted ?? null,
          negativePromptIv: input.encryptedNegativePrompt?.iv ?? null,
          negativePromptTag: input.encryptedNegativePrompt?.tag ?? null,
          parameterSnapshot: input.parameters,
          sanitizedParameterSnapshot: input.parameters,
          executionProfileSnapshot: input.executionProfileSnapshot,
          requestMappingSnapshot: input.requestMappingSnapshot,
          resolvedRequestSanitizedSnapshot: input.resolvedRequestSanitizedSnapshot,
          referenceAssetIds: input.referenceAssetIds,
          status: 'pending',
          clientRequestId: input.clientRequestId,
          queuedAt: new Date(),
        },
        include: {
          resultAssets: true,
        },
      });
    } catch (error) {
      if (
        input.clientRequestId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return prisma.imageTask.findFirstOrThrow({
          where: {
            userId,
            clientRequestId: input.clientRequestId,
          },
          include: {
            resultAssets: true,
          },
        });
      }
      throw error;
    }
  }

  private async resolveActiveExecutionProfile(
    modelRecordId: string,
    requestedExecutionProfileId: string | undefined,
  ): Promise<ActiveExecutionProfile> {
    const profile = await prisma.aiModelExecutionProfile.findFirst({
      where: {
        aiModelId: modelRecordId,
        deletedAt: null,
        isEnabled: true,
        ...(requestedExecutionProfileId
          ? { id: requestedExecutionProfileId }
          : {
              isDefault: true,
            }),
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
    });

    if (!profile || profile.revisions.length !== 1) {
      throw apiError(HttpStatus.BAD_REQUEST, 'model_profile_missing', '模型没有可用执行配置');
    }

    return profile;
  }

  private resolveImageEndpointTypeFromProfile(
    profile: ActiveExecutionProfile,
    referenceAssetIds: string[],
  ): ModelEndpointType {
    if (profile.adapterKey === 'openai_images_edit') {
      return ModelEndpointType.openai_image_edits;
    }

    if (profile.adapterKey === 'openai_images_generation') {
      if (referenceAssetIds.length > 0) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'endpoint_not_supported',
          '当前执行配置不支持参考图',
        );
      }
      return ModelEndpointType.openai_image_generations;
    }

    if (profile.adapterKey === 'openai_responses_image') {
      return ModelEndpointType.openai_responses_image;
    }

    if (profile.adapterKey === 'gemini_generate_content') {
      return ModelEndpointType.gemini_generate_content;
    }

    throw apiError(
      HttpStatus.BAD_REQUEST,
      'adapter_not_supported',
      '当前执行配置暂不支持图片任务提交',
    );
  }

  private buildExecutionProfileSnapshot(
    profile: ActiveExecutionProfile,
    revision: ActiveExecutionProfile['revisions'][number],
  ): Prisma.InputJsonObject {
    return {
      profile_id: profile.id,
      revision_id: revision.id,
      revision_no: revision.revisionNo,
      name: profile.name,
      operation: profile.operation,
      adapter_key: revision.adapterKey,
      adapter_version: revision.adapterVersion,
      transport_key: revision.transportKey,
      upstream_model_id: revision.upstreamModelId,
      upstream_endpoint_path: revision.upstreamEndpointPath,
      reference_transfer_mode: revision.referenceTransferMode,
      supports_reference_image: revision.supportsReferenceImage,
      max_reference_images: revision.maxReferenceImages,
      parameter_schema: revision.parameterSchema as Prisma.InputJsonValue,
      default_params: revision.defaultParams as Prisma.InputJsonValue,
      response_parser_key: revision.responseParserKey,
      capabilities: revision.capabilities as Prisma.InputJsonValue,
      validation_rules: revision.validationRules as Prisma.InputJsonValue,
      source_kind: revision.sourceKind,
      source_url: revision.sourceUrl,
      source_checked_at: revision.sourceCheckedAt?.toISOString() ?? null,
      source_summary: revision.sourceSummary,
    };
  }

  private applyParameterSendPolicy(
    schema: ReturnType<typeof normalizeParameterSchema>,
    parameters: Record<string, string | number | boolean | null>,
  ) {
    const neverSendKeys = new Set(
      schema.filter((field) => field.send_policy === 'never').map((field) => field.key),
    );
    if (neverSendKeys.size === 0) {
      return parameters;
    }

    return Object.fromEntries(
      Object.entries(parameters).filter(([key]) => !neverSendKeys.has(key)),
    ) as Record<string, string | number | boolean | null>;
  }

  private buildResolvedRequestSanitizedSnapshot(input: {
    endpointType: ModelEndpointType;
    parameters: Record<string, string | number | boolean | null>;
    profile: ActiveExecutionProfile;
    prompt: string;
    referenceAssetIds: string[];
    revision: ActiveExecutionProfile['revisions'][number];
  }): Prisma.InputJsonObject {
    const endpointPath =
      input.revision.upstreamEndpointPath ??
      defaultEndpointPathForTask(input.endpointType, input.revision.upstreamModelId);
    const contentType = contentTypeForEndpointType(input.endpointType);

    return {
      adapter_key: input.revision.adapterKey,
      adapter_version: input.revision.adapterVersion,
      transport_key: input.revision.transportKey,
      endpoint_type: input.endpointType,
      endpoint_path: endpointPath,
      content_type: contentType,
      body: {
        model: input.revision.upstreamModelId,
        prompt: summarizeText(input.prompt),
        ...input.parameters,
        ...(input.referenceAssetIds.length > 0
          ? {
              reference_asset_ids: input.referenceAssetIds,
            }
          : {}),
      },
      profile: {
        id: input.profile.id,
        revision_id: input.revision.id,
        operation: input.profile.operation,
      },
    };
  }

  private async enqueueTask(task: ImageTask) {
    await this.imageQueue.add(
      CREATE_TASK_JOB_NAME,
      {
        job_version: 1,
        task_id: task.id,
        user_id: task.userId,
        enqueued_at: new Date().toISOString(),
        client_request_id: task.clientRequestId ?? undefined,
      },
      {
        jobId: task.id,
      },
    );
  }

  private async removeQueueJob(taskId: string) {
    const job = await this.imageQueue.getJob(taskId);
    if (job) {
      await job.remove().catch(() => undefined);
    }
  }

  private async findOwnTask(taskId: string, session: SessionContext, includeDetails: boolean) {
    this.assertUuid(taskId, 'task_id');
    const task = await prisma.imageTask.findFirst({
      where: {
        id: taskId,
        userId: session.userId,
        deletedAt: null,
      },
      include: {
        resultAssets: {
          where: {
            status: 'available',
            deletedAt: null,
          },
        },
        attempts: includeDetails
          ? {
              orderBy: {
                attemptNo: 'asc',
              },
            }
          : false,
      },
    });
    if (!task) {
      throw apiError(HttpStatus.NOT_FOUND, 'not_found', '任务不存在');
    }
    return task;
  }

  private serializeTask(task: TaskWithAssets): PublicImageTask {
    return {
      id: task.id,
      model_record_id: task.modelRecordId,
      model_id: task.modelIdSnapshot,
      endpoint_type: task.endpointTypeSnapshot,
      execution_profile_id: task.executionProfileId,
      execution_profile_revision_id: task.executionProfileRevisionId,
      execution_profile_name: this.readExecutionProfileSnapshotName(task.executionProfileSnapshot),
      adapter_key: task.adapterKeySnapshot,
      adapter_version: task.adapterVersionSnapshot,
      prompt_summary: task.promptSummary,
      negative_prompt_summary: task.negativePromptSummary,
      sanitized_parameter_snapshot: task.sanitizedParameterSnapshot,
      resolved_request_sanitized_snapshot: task.resolvedRequestSanitizedSnapshot,
      reference_asset_ids: task.referenceAssetIds,
      status: task.status,
      error_code: task.errorCode,
      error_message: task.errorMessage,
      client_request_id: task.clientRequestId,
      queued_at: task.queuedAt.toISOString(),
      started_at: task.startedAt?.toISOString() ?? null,
      completed_at: task.completedAt?.toISOString() ?? null,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
      deleted_at: task.deletedAt?.toISOString() ?? null,
      result_assets: (task.resultAssets ?? []).map((asset) => this.serializeAsset(asset)),
      attempts: task.attempts?.map((attempt) => ({
        id: attempt.id,
        attempt_no: attempt.attemptNo,
        status: attempt.status,
        started_at: attempt.startedAt.toISOString(),
        finished_at: attempt.finishedAt?.toISOString() ?? null,
        http_status: attempt.httpStatus,
        error_code: attempt.errorCode,
        error_message: attempt.errorMessage,
        is_retryable: attempt.isRetryable,
        created_at: attempt.createdAt.toISOString(),
      })),
    };
  }

  private readExecutionProfileSnapshotName(snapshot: unknown) {
    const record = toInputRecord(snapshot);
    return typeof record.name === 'string' ? record.name : null;
  }

  private serializeAsset(asset: Asset): PublicTaskAsset {
    return {
      id: asset.id,
      kind: asset.kind,
      filename: asset.filename,
      mime_type: asset.mimeType,
      width: asset.width,
      height: asset.height,
      download_url: assetDownloadPath(asset.id),
      created_at: asset.createdAt.toISOString(),
    };
  }

  private decryptTaskPrompt(task: ImageTask) {
    return this.encryptionService.decryptSecret({
      encrypted: task.encryptedPrompt,
      iv: task.promptIv,
      tag: task.promptTag,
      keyVersion: 1,
    });
  }

  private decryptTaskNegativePrompt(task: ImageTask) {
    if (!task.encryptedNegativePrompt || !task.negativePromptIv || !task.negativePromptTag) {
      return null;
    }
    return this.encryptionService.decryptSecret({
      encrypted: task.encryptedNegativePrompt,
      iv: task.negativePromptIv,
      tag: task.negativePromptTag,
      keyVersion: 1,
    });
  }

  private readUuid(value: unknown, field: string) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw validationFailed([{ field, message: 'ID 格式错误' }]);
    }
    return value;
  }

  private readOptionalUuid(value: unknown, field: string) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return this.readUuid(value, field);
  }

  private assertUuid(value: unknown, field: string) {
    this.readUuid(value, field);
  }

  private readString(value: unknown, field: string, min: number, max: number) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length < min) {
      throw validationFailed([{ field, message: '不能为空' }]);
    }
    if (text.length > max) {
      throw validationFailed([{ field, message: `不能超过 ${max} 个字符` }]);
    }
    return text;
  }

  private readOptionalString(value: unknown, field: string, max: number) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return this.readString(value, field, 1, max);
  }

  private readOptionalClientRequestId(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    if (typeof value !== 'string' || !CLIENT_REQUEST_ID_PATTERN.test(value)) {
      throw validationFailed([
        {
          field: 'client_request_id',
          message: 'client_request_id 格式错误',
        },
      ]);
    }
    return value;
  }

  private readReferenceAssetIds(value: unknown) {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw validationFailed([{ field: 'reference_asset_ids', message: '参考图必须是数组' }]);
    }
    const ids = [...new Set(value.filter((item): item is string => typeof item === 'string'))];
    if (
      ids.length !== value.length ||
      ids.length > MAX_REFERENCE_ASSETS ||
      ids.some((id) => !UUID_PATTERN.test(id))
    ) {
      throw validationFailed([{ field: 'reference_asset_ids', message: '参考图 ID 格式错误' }]);
    }
    return ids;
  }

  private readOptionalStatus(value: unknown): ImageTaskStatus | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (
      value === 'pending' ||
      value === 'running' ||
      value === 'succeeded' ||
      value === 'failed' ||
      value === 'timeout' ||
      value === 'canceled'
    ) {
      return value;
    }
    throw validationFailed([{ field: 'status', message: '任务状态无效' }]);
  }

  private readPositiveInt(value: unknown, fallback: number, min: number, max: number) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw validationFailed([{ field: 'page', message: `必须是 ${min}-${max} 的整数` }]);
    }
    return parsed;
  }
}

function defaultEndpointPathForTask(endpointType: ModelEndpointType, upstreamModelId: string) {
  if (endpointType === ModelEndpointType.openai_image_edits) {
    return '/v1/images/edits';
  }
  if (endpointType === ModelEndpointType.openai_responses_image) {
    return '/v1/responses';
  }
  if (endpointType === ModelEndpointType.gemini_interactions_image) {
    return '/v1beta/interactions';
  }
  if (endpointType === ModelEndpointType.gemini_generate_content) {
    return `/v1beta/models/${encodeURIComponent(upstreamModelId)}:generateContent`;
  }
  return '/v1/images/generations';
}

function contentTypeForEndpointType(endpointType: ModelEndpointType) {
  return endpointType === ModelEndpointType.openai_image_edits ? 'multipart' : 'json';
}

function summarizeText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function toInputRecord(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    ) {
      record[key] = item;
    }
  }
  return record;
}
