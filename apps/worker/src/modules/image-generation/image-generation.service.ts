import { Injectable } from '@nestjs/common';
import {
  ImageTaskStatus,
  Prisma,
  RequestLogStatus,
  type Asset,
  type ImageTask,
} from '@prisma/client';

import { prisma } from '@dreamstudio/db';
import type { ImageGenerationJobPayload } from '@dreamstudio/queue';
import { DreamStudioSecretCodec, readAssetBuffer, uploadImageObject } from '@dreamstudio/storage';

import {
  NewApiImageClient,
  NewApiImageClientError,
  type NewApiImageReference,
} from './new-api-image.client';
import { getImageGenerationAdapter, normalizeImageAdapterError } from './image-adapter.registry';

const REQUEST_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 30000;
const NEW_API_TIMEOUT_MS = 120000;

type ClaimedTask = ImageTask & {
  resultAssets?: Asset[];
};

interface WorkerFailure {
  code: string;
  message: string;
  httpStatus?: number | null;
  retryable?: boolean;
  taskStatus?: ImageTaskStatus;
}

@Injectable()
export class ImageGenerationService {
  private readonly client = new NewApiImageClient();

  constructor(private readonly secretCodec: DreamStudioSecretCodec) {}

  async runImageGenerationJob(jobId: string | undefined, payload: ImageGenerationJobPayload) {
    const task = await this.claimPendingTask(payload.task_id);
    if (!task) {
      console.log(
        JSON.stringify({
          level: 'info',
          module: 'worker',
          queue: 'image-generation',
          event: 'image_task_skipped',
          job_id: jobId,
          task_id: payload.task_id,
        }),
      );
      return;
    }

    const attempt = await this.createAttempt(task.id);
    try {
      await this.executeClaimedTask(task, attempt.id);
      console.log(
        JSON.stringify({
          level: 'info',
          module: 'worker',
          queue: 'image-generation',
          event: 'image_task_succeeded',
          job_id: jobId,
          task_id: task.id,
          attempt_id: attempt.id,
        }),
      );
    } catch (error) {
      const failure = normalizeFailure(error);
      await this.markTaskFailed(task.id, attempt.id, failure);
      console.warn(
        JSON.stringify({
          level: 'warn',
          module: 'worker',
          queue: 'image-generation',
          event: 'image_task_failed',
          job_id: jobId,
          task_id: task.id,
          attempt_id: attempt.id,
          error_code: failure.code,
          retryable: Boolean(failure.retryable),
        }),
      );
    }
  }

  private async claimPendingTask(taskId: string): Promise<ClaimedTask | null> {
    const startedAt = new Date();
    const updated = await prisma.imageTask.updateMany({
      where: {
        id: taskId,
        status: 'pending',
        deletedAt: null,
      },
      data: {
        status: 'running',
        startedAt,
        errorCode: null,
        errorMessage: null,
      },
    });
    if (updated.count !== 1) {
      return null;
    }

    return prisma.imageTask.findUniqueOrThrow({
      where: {
        id: taskId,
      },
    });
  }

  private async createAttempt(taskId: string) {
    const maxAttempt = await prisma.imageTaskAttempt.aggregate({
      where: {
        taskId,
      },
      _max: {
        attemptNo: true,
      },
    });
    return prisma.imageTaskAttempt.create({
      data: {
        taskId,
        attemptNo: (maxAttempt._max.attemptNo ?? 0) + 1,
        status: 'running',
        startedAt: new Date(),
      },
    });
  }

  private async executeClaimedTask(task: ImageTask, attemptId: string) {
    const newApiConfig = await prisma.userNewApiConfig.findUnique({
      where: {
        userId: task.userId,
      },
    });
    if (!newApiConfig || newApiConfig.status !== 'valid') {
      throw failure('new_api_config_missing', '用户 new-api 配置不可用');
    }

    const prompt = this.decryptTaskPrompt(task);
    const negativePrompt = this.decryptTaskNegativePrompt(task);
    const parameters = toRecord(task.parameterSnapshot);
    if (negativePrompt) {
      parameters.negative_prompt = negativePrompt;
    }
    const references = await this.loadReferences(task);
    const apiKey = this.secretCodec.decryptSecret({
      encrypted: newApiConfig.encryptedApiKey,
      iv: newApiConfig.keyIv,
      tag: newApiConfig.keyTag,
      keyVersion: newApiConfig.keyVersion,
    });

    const startedAt = Date.now();
    let httpStatus: number | null = null;
    try {
      const adapter = getImageGenerationAdapter(task.adapterKeySnapshot);
      const upstream = await adapter.execute({
        task,
        client: this.client,
        apiKey,
        prompt,
        parameters,
        references,
        timeoutMs: NEW_API_TIMEOUT_MS,
      });
      httpStatus = upstream.httpStatus;
      await this.writeRequestLog(task, attemptId, {
        status: 'succeeded',
        httpStatus,
        durationMs: Date.now() - startedAt,
        upstreamResponseSummary: summarizeUpstreamResponse(upstream),
      });
      await this.saveResultImages(task, upstream.data);
      await prisma.imageTaskAttempt.update({
        where: {
          id: attemptId,
        },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          httpStatus,
        },
      });
      await prisma.imageTask.update({
        where: {
          id: task.id,
        },
        data: {
          status: 'succeeded',
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
    } catch (error) {
      const normalized = normalizeFailure(error);
      httpStatus = normalized.httpStatus ?? httpStatus;
      await this.writeRequestLog(task, attemptId, {
        status: normalized.taskStatus === 'timeout' ? 'timeout' : 'failed',
        httpStatus,
        durationMs: Date.now() - startedAt,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        profileErrorHint: buildProfileErrorHint(normalized),
      });
      throw normalized;
    }
  }

  private async loadReferences(task: ImageTask): Promise<NewApiImageReference[]> {
    if (task.referenceAssetIds.length === 0) {
      return [];
    }

    const assets = await prisma.asset.findMany({
      where: {
        id: {
          in: task.referenceAssetIds,
        },
        userId: task.userId,
        kind: 'reference_image',
        status: 'available',
        deletedAt: null,
      },
    });
    if (assets.length !== task.referenceAssetIds.length) {
      throw failure('reference_asset_unavailable', '参考图不可用');
    }

    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    return Promise.all(
      task.referenceAssetIds.map(async (assetId) => {
        const asset = assetById.get(assetId);
        if (!asset) {
          throw failure('reference_asset_unavailable', '参考图不可用');
        }
        const downloaded = await readAssetBuffer(asset, this.secretCodec);
        return {
          buffer: downloaded.buffer,
          filename: downloaded.filename,
          contentType: downloaded.contentType,
        };
      }),
    );
  }

  private async saveResultImages(
    task: ImageTask,
    images: Array<{ url?: string; b64_json?: string }>,
  ) {
    for (const [index, image] of images.entries()) {
      const buffer = image.b64_json
        ? Buffer.from(image.b64_json, 'base64')
        : await downloadImageBuffer(image.url);
      const stored = await uploadImageObject({
        buffer,
        codec: this.secretCodec,
        kind: 'result_image',
        originalFilename: `image-task-${task.id}-${index + 1}.png`,
        userId: task.userId,
      });
      await prisma.asset.create({
        data: {
          userId: task.userId,
          kind: 'result_image',
          status: 'available',
          storageDriver: stored.storageDriver,
          bucket: stored.bucket,
          objectKey: stored.objectKey,
          filename: stored.filename,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          width: stored.width,
          height: stored.height,
          checksum: stored.checksum,
          expiresAt: stored.expiresAt,
          sourceTaskId: task.id,
        },
      });
    }
  }

  private async markTaskFailed(taskId: string, attemptId: string, failureInput: WorkerFailure) {
    const status =
      failureInput.taskStatus ?? (failureInput.code === 'timeout' ? 'timeout' : 'failed');
    await Promise.all([
      prisma.imageTaskAttempt.update({
        where: {
          id: attemptId,
        },
        data: {
          status,
          finishedAt: new Date(),
          httpStatus: failureInput.httpStatus ?? null,
          errorCode: failureInput.code,
          errorMessage: sanitizeErrorMessage(failureInput.message),
          isRetryable: Boolean(failureInput.retryable),
        },
      }),
      prisma.imageTask.update({
        where: {
          id: taskId,
        },
        data: {
          status,
          completedAt: new Date(),
          errorCode: failureInput.code,
          errorMessage: sanitizeErrorMessage(failureInput.message),
        },
      }),
    ]);
  }

  private async writeRequestLog(
    task: ImageTask,
    attemptId: string,
    input: {
      status: RequestLogStatus;
      httpStatus?: number | null;
      durationMs?: number | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      profileErrorHint?: string | null;
      upstreamResponseSummary?: Prisma.InputJsonObject | null;
    },
  ) {
    const encryptedParams = this.secretCodec.encryptSecret(JSON.stringify(task.parameterSnapshot));
    await prisma.requestLog.create({
      data: {
        userId: task.userId,
        taskId: task.id,
        attemptId,
        newApiBaseUrlHost: readHost(task.newApiBaseUrlSnapshot),
        modelId: task.modelIdSnapshot,
        endpointType: task.endpointTypeSnapshot,
        adapterKey: task.adapterKeySnapshot,
        adapterVersion: task.adapterVersionSnapshot,
        executionProfileId: task.executionProfileId,
        executionProfileRevisionId: task.executionProfileRevisionId,
        status: input.status,
        httpStatus: input.httpStatus ?? null,
        durationMs: input.durationMs ?? null,
        promptSummary: task.promptSummary,
        encryptedPrompt: task.encryptedPrompt,
        promptIv: task.promptIv,
        promptTag: task.promptTag,
        sanitizedParams: toInputJsonObject(task.sanitizedParameterSnapshot),
        resolvedRequestSanitized: task.resolvedRequestSanitizedSnapshot
          ? toInputJsonObject(task.resolvedRequestSanitizedSnapshot)
          : undefined,
        upstreamResponseSummary: input.upstreamResponseSummary ?? undefined,
        profileErrorHint: input.profileErrorHint ?? null,
        encryptedParams: encryptedParams.encrypted,
        paramsIv: encryptedParams.iv,
        paramsTag: encryptedParams.tag,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ? sanitizeErrorMessage(input.errorMessage) : null,
        expiresAt: new Date(Date.now() + REQUEST_LOG_RETENTION_MS),
      },
    });
  }

  private decryptTaskPrompt(task: ImageTask) {
    return this.secretCodec.decryptSecret({
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
    return this.secretCodec.decryptSecret({
      encrypted: task.encryptedNegativePrompt,
      iv: task.negativePromptIv,
      tag: task.negativePromptTag,
      keyVersion: 1,
    });
  }
}

async function downloadImageBuffer(url: string | undefined) {
  if (!url) {
    throw failure('invalid_upstream_response', '上游图片接口没有返回可下载图片');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'image/*',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw failure('result_image_download_failed', '结果图下载失败', {
        httpStatus: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (isWorkerFailure(error)) {
      throw error;
    }
    throw failure('result_image_download_failed', '结果图下载失败', {
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

function failure(
  code: string,
  message: string,
  options: { httpStatus?: number | null; retryable?: boolean; taskStatus?: ImageTaskStatus } = {},
): WorkerFailure {
  return {
    code,
    message,
    ...options,
  };
}

function normalizeFailure(error: unknown): WorkerFailure {
  if (isWorkerFailure(error)) {
    return error;
  }
  if (error instanceof NewApiImageClientError) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: error.httpStatus,
      retryable: error.isRetryable,
      taskStatus: error.code === 'timeout' ? 'timeout' : 'failed',
    };
  }
  const adapterFailure = normalizeImageAdapterError(error);
  if (adapterFailure) {
    return {
      ...adapterFailure,
      taskStatus: 'failed',
    };
  }
  return {
    code: 'image_task_failed',
    message: error instanceof Error ? error.message : '图片任务执行失败',
  };
}

function isWorkerFailure(error: unknown): error is WorkerFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as WorkerFailure).code === 'string' &&
    typeof (error as WorkerFailure).message === 'string'
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toInputJsonObject(value: unknown): Prisma.InputJsonObject {
  return toRecord(value) as Prisma.InputJsonObject;
}

function readHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'invalid-host';
  }
}

function sanitizeErrorMessage(value: string) {
  return value.replace(/Bearer\s+[a-zA-Z0-9._~+/=-]+/g, 'Bearer [redacted]').slice(0, 800);
}

function summarizeUpstreamResponse(upstream: { data: Array<{ url?: string; b64_json?: string }> }) {
  return {
    image_count: upstream.data.length,
    has_url: upstream.data.some((item) => Boolean(item.url)),
    has_b64_json: upstream.data.some((item) => Boolean(item.b64_json)),
  } satisfies Prisma.InputJsonObject;
}

function buildProfileErrorHint(failureInput: WorkerFailure) {
  if (
    failureInput.code === 'invalid_request_mapping' ||
    failureInput.code === 'adapter_target_not_allowed' ||
    failureInput.code === 'adapter_not_supported' ||
    failureInput.code === 'profile_snapshot_missing'
  ) {
    return '执行配置或 request mapping 不合法，请在 Admin 模型执行配置中运行 lint 和请求预览。';
  }
  if (failureInput.code === 'invalid_upstream_request') {
    return '上游拒绝了请求参数，请检查 active profile 的 parameter_schema、request_mapping 和上游模型实际能力。';
  }
  return null;
}
