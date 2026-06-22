import type { ImageTask } from '@prisma/client';

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

interface RequestMapping {
  content_type?: unknown;
  fields?: unknown;
  reference_field?: unknown;
  constants?: unknown;
}

interface RequestMappingField {
  source?: unknown;
  target?: unknown;
  omit_if_null?: unknown;
}

interface ReferenceFieldMapping {
  target?: unknown;
  mode?: unknown;
}

interface MappingContext {
  model: string;
  prompt: string;
  params: Record<string, unknown>;
}

const openAiImagesGenerationAdapter: ImageGenerationAdapter = {
  key: 'openai_images_generation',
  version: 1,
  allowedTargetPaths: ['/v1/images/generations'],
  async execute(input) {
    const endpointPath = readEndpointPath(input.task, '/v1/images/generations');
    assertAllowedTargetPath(this, endpointPath);
    const mapping = readRequestMapping(input.task);
    if (mapping.content_type !== 'json') {
      throw adapterFailure('invalid_request_mapping', '图片生成 adapter 需要 json request mapping');
    }

    const body = compileMappedFields(mapping, {
      model: input.task.modelIdSnapshot,
      prompt: input.prompt,
      params: input.parameters,
    });

    return input.client.sendJsonImageRequest({
      baseUrl: input.task.newApiBaseUrlSnapshot,
      apiKey: input.apiKey,
      endpointPath,
      body,
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
    assertAllowedTargetPath(this, endpointPath);
    const mapping = readRequestMapping(input.task);
    if (mapping.content_type !== 'multipart') {
      throw adapterFailure(
        'invalid_request_mapping',
        '图片编辑 adapter 需要 multipart request mapping',
      );
    }

    const fields = compileMappedFields(mapping, {
      model: input.task.modelIdSnapshot,
      prompt: input.prompt,
      params: input.parameters,
    });
    const referenceField = readReferenceFieldName(mapping);

    return input.client.sendMultipartImageRequest({
      baseUrl: input.task.newApiBaseUrlSnapshot,
      apiKey: input.apiKey,
      endpointPath,
      fields,
      references: input.references,
      referenceFieldName: referenceField,
      timeoutMs: input.timeoutMs,
    });
  },
};

const IMAGE_ADAPTERS = new Map(
  [openAiImagesGenerationAdapter, openAiImagesEditAdapter].map((adapter) => [adapter.key, adapter]),
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
  return null;
}

export function compileMappedFields(
  mapping: RequestMapping,
  context: MappingContext,
): Record<string, unknown> {
  if (!Array.isArray(mapping.fields) || mapping.fields.length === 0) {
    throw adapterFailure('invalid_request_mapping', 'request mapping 缺少字段映射');
  }

  const output: Record<string, unknown> = {};
  for (const rawField of mapping.fields) {
    const field = readMappingField(rawField);
    const value = readSourceValue(field.source, context);
    if ((value === undefined || value === null) && field.omitIfNull) {
      continue;
    }
    if (value === undefined) {
      throw adapterFailure(
        'invalid_request_mapping',
        `request mapping source 不存在: ${field.source}`,
      );
    }
    setMappedValue(output, field.target, value);
  }

  if (Array.isArray(mapping.constants)) {
    for (const constant of mapping.constants) {
      const record = toRecord(constant);
      const target = typeof record?.target === 'string' ? record.target : '';
      if (!target) {
        throw adapterFailure('invalid_request_mapping', 'request mapping constant target 无效');
      }
      setMappedValue(output, target, record?.value);
    }
  }

  return output;
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

function assertAllowedTargetPath(adapter: ImageGenerationAdapter, endpointPath: string) {
  if (!adapter.allowedTargetPaths.includes(endpointPath)) {
    throw adapterFailure('adapter_target_not_allowed', '当前 adapter 不允许请求该上游路径');
  }
}

function readMappingField(rawField: unknown) {
  const field = toRecord(rawField) as RequestMappingField | null;
  const source = readString(field?.source);
  const target = readString(field?.target);
  if (!source || !target) {
    throw adapterFailure('invalid_request_mapping', 'request mapping field 需要 source 和 target');
  }
  return {
    source,
    target,
    omitIfNull: field?.omit_if_null === true,
  };
}

function readReferenceFieldName(mapping: RequestMapping) {
  const referenceField = toRecord(mapping.reference_field) as ReferenceFieldMapping | null;
  const target = readString(referenceField?.target);
  if (!target) {
    return 'image';
  }
  if (target === 'image[]') {
    return 'image[]';
  }
  if (target === 'image') {
    return 'image';
  }
  throw adapterFailure(
    'invalid_request_mapping',
    '图片编辑 reference field 只能是 image 或 image[]',
  );
}

function readSourceValue(source: string, context: MappingContext): unknown {
  if (source === 'model') {
    return context.model;
  }
  if (source === 'prompt') {
    return context.prompt;
  }
  if (source.startsWith('params.')) {
    return readPath(context.params, source.slice('params.'.length));
  }
  throw adapterFailure('invalid_request_mapping', `request mapping source 不支持: ${source}`);
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (isRecord(current)) {
      return current[key];
    }
    return undefined;
  }, source);
}

function setMappedValue(output: Record<string, unknown>, target: string, value: unknown) {
  const tokens = parseTargetPath(target);
  let current = output;
  tokens.forEach((token, index) => {
    const isLast = index === tokens.length - 1;
    if (isLast) {
      current[token] = value;
      return;
    }
    if (!isRecord(current[token])) {
      current[token] = {};
    }
    current = current[token] as Record<string, unknown>;
  });
}

function parseTargetPath(target: string) {
  const normalized = target.replace(/\[(\d+)\]/g, '.$1');
  const tokens = normalized.split('.').filter(Boolean);
  if (tokens.length === 0) {
    throw adapterFailure('invalid_request_mapping', 'request mapping target 无效');
  }
  return tokens;
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
