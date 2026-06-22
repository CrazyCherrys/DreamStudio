import type { ImageTask } from '@prisma/client';
import {
  compileRequestMapping,
  RequestMappingError,
  type RequestMapping,
} from '@dreamstudio/config';

import {
  NewApiImageClient,
  type NewApiImageReference,
  type NewApiImageResponse,
} from './new-api-image.client';

export interface ImageAdapterWorkerFailure {
  code: string;
  message: string;
  httpStatus?: number | null;
  retryable?: boolean;
}

export interface ImageAdapterInput {
  apiKey: string;
  client: NewApiImageClient;
  parameters: Record<string, unknown>;
  prompt: string;
  references: NewApiImageReference[];
  task: ImageTask;
  timeoutMs: number;
}

export interface ImageGenerationAdapter {
  key: string;
  version: number;
  allowedTargetPaths: string[];
  execute(input: ImageAdapterInput): Promise<NewApiImageResponse>;
}

const openAiImagesGenerationAdapter: ImageGenerationAdapter = {
  key: 'openai_images_generation',
  version: 1,
  allowedTargetPaths: ['/v1/images/generations'],
  async execute(input) {
    const endpointPath = readEndpointPath(input.task, '/v1/images/generations');
    assertAllowedTargetPath(this, endpointPath, input.task.modelIdSnapshot);
    const compiled = compileRequestMapping(readRequestMapping(input.task), {
      model: input.task.modelIdSnapshot,
      prompt: input.prompt,
      params: input.parameters,
    });
    if (compiled.contentType !== 'json') {
      throw adapterFailure('invalid_request_mapping', '图片生成 adapter 需要 json request mapping');
    }

    return input.client.sendJsonImageRequest({
      baseUrl: input.task.newApiBaseUrlSnapshot,
      apiKey: input.apiKey,
      endpointPath,
      body: compiled.body,
      timeoutMs: input.timeoutMs,
    });
  },
};

const openAiImagesEditAdapter: ImageGenerationAdapter = {
  key: 'openai_images_edit',
  version: 1,
  allowedTargetPaths: ['/v1/images/edits'],
  async execute(input) {
    const endpointPath = readEndpointPath(input.task, '/v1/images/edits');
    assertAllowedTargetPath(this, endpointPath, input.task.modelIdSnapshot);
    const compiled = compileRequestMapping(readRequestMapping(input.task), {
      model: input.task.modelIdSnapshot,
      prompt: input.prompt,
      params: input.parameters,
    });
    if (compiled.contentType !== 'multipart') {
      throw adapterFailure(
        'invalid_request_mapping',
        '图片编辑 adapter 需要 multipart request mapping',
      );
    }

    return input.client.sendMultipartImageRequest({
      baseUrl: input.task.newApiBaseUrlSnapshot,
      apiKey: input.apiKey,
      endpointPath,
      fields: compiled.body,
      references: input.references,
      referenceFieldName: compiled.referenceFieldName,
      timeoutMs: input.timeoutMs,
    });
  },
};

const geminiGenerateContentAdapter: ImageGenerationAdapter = {
  key: 'gemini_generate_content',
  version: 1,
  allowedTargetPaths: ['/v1beta/models/{model}:generateContent'],
  async execute(input) {
    const endpointPath = readEndpointPath(
      input.task,
      `/v1beta/models/${encodeURIComponent(input.task.modelIdSnapshot)}:generateContent`,
    );
    assertAllowedTargetPath(this, endpointPath, input.task.modelIdSnapshot);
    const compiled = compileRequestMapping(readRequestMapping(input.task), {
      model: input.task.modelIdSnapshot,
      prompt: input.prompt,
      params: input.parameters,
    });
    if (compiled.contentType !== 'json') {
      throw adapterFailure('invalid_request_mapping', 'Gemini adapter 需要 json request mapping');
    }

    return input.client.sendJsonImageRequest({
      baseUrl: input.task.newApiBaseUrlSnapshot,
      apiKey: input.apiKey,
      endpointPath,
      body: appendGeminiReferenceParts(compiled.body, input.references),
      responseParser: 'gemini_inline_data',
      timeoutMs: input.timeoutMs,
    });
  },
};

const IMAGE_ADAPTERS = new Map(
  [openAiImagesGenerationAdapter, openAiImagesEditAdapter, geminiGenerateContentAdapter].map(
    (adapter) => [adapter.key, adapter],
  ),
);

export function getImageGenerationAdapter(adapterKey: string | null): ImageGenerationAdapter {
  if (!adapterKey) {
    throw adapterFailure('profile_snapshot_missing', '任务缺少执行配置快照，请重新提交图片任务');
  }

  const adapter = IMAGE_ADAPTERS.get(adapterKey);
  if (!adapter) {
    throw adapterFailure('adapter_not_supported', '当前图片执行 adapter 暂不支持');
  }
  return adapter;
}

export function normalizeImageAdapterError(error: unknown): ImageAdapterWorkerFailure | null {
  if (isImageAdapterWorkerFailure(error)) {
    return error;
  }
  if (error instanceof RequestMappingError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  return null;
}

function readRequestMapping(task: ImageTask): RequestMapping {
  if (!isRecord(task.executionProfileSnapshot) || !isRecord(task.requestMappingSnapshot)) {
    throw adapterFailure('profile_snapshot_missing', '任务缺少执行配置快照，请重新提交图片任务');
  }
  return task.requestMappingSnapshot;
}

function readEndpointPath(task: ImageTask, fallback: string) {
  const resolved = toRecord(task.resolvedRequestSanitizedSnapshot);
  const profile = toRecord(task.executionProfileSnapshot);
  const endpointPath =
    readString(resolved?.endpoint_path) ?? readString(profile?.upstream_endpoint_path) ?? fallback;
  if (!endpointPath.startsWith('/')) {
    throw adapterFailure('invalid_request_mapping', '上游 endpoint path 必须以 / 开头');
  }
  return endpointPath;
}

function assertAllowedTargetPath(
  adapter: ImageGenerationAdapter,
  endpointPath: string,
  modelId: string,
) {
  const allowedPaths = adapter.allowedTargetPaths.map((path) =>
    path.replace('{model}', encodeURIComponent(modelId)),
  );
  if (!allowedPaths.includes(endpointPath)) {
    throw adapterFailure('adapter_target_not_allowed', '当前 adapter 不允许请求该上游路径');
  }
}

function adapterFailure(
  code: string,
  message: string,
  options: { httpStatus?: number | null; retryable?: boolean } = {},
): ImageAdapterWorkerFailure {
  return {
    code,
    message,
    ...options,
  };
}

function isImageAdapterWorkerFailure(error: unknown): error is ImageAdapterWorkerFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as ImageAdapterWorkerFailure).code === 'string' &&
    typeof (error as ImageAdapterWorkerFailure).message === 'string'
  );
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function appendGeminiReferenceParts(
  body: Record<string, unknown>,
  references: NewApiImageReference[],
): Record<string, unknown> {
  if (references.length === 0) {
    return body;
  }

  const contents = Array.isArray(body.contents) ? [...body.contents] : [];
  const firstContent = isRecord(contents[0]) ? { ...contents[0] } : {};
  const parts = Array.isArray(firstContent.parts) ? [...firstContent.parts] : [];
  parts.push(
    ...references.map((reference) => ({
      inlineData: {
        data: reference.buffer.toString('base64'),
        mimeType: reference.contentType,
      },
    })),
  );
  firstContent.parts = parts;
  contents[0] = firstContent;

  return {
    ...body,
    contents,
  };
}
