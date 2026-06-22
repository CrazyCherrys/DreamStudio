export interface RequestMapping {
  content_type?: unknown;
  fields?: unknown;
  reference_field?: unknown;
  constants?: unknown;
}

export interface RequestMappingContext {
  model: string;
  params: Record<string, unknown>;
  prompt: string;
}

export interface CompiledRequestMapping {
  body: Record<string, unknown>;
  contentType: 'json' | 'multipart';
  referenceFieldName: string;
}

export class RequestMappingError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RequestMappingError';
    this.code = code;
  }
}

const ALLOWED_TRANSFORMS = new Set([
  'validateOpenAIImageSize',
  'aspectRatioToOpenAISize',
  'dropUnsupported',
  'numberToString',
  'booleanToFlag',
  'joinArray',
]);

export function compileRequestMapping(
  mapping: RequestMapping,
  context: RequestMappingContext,
): CompiledRequestMapping {
  const contentType = readContentType(mapping);
  const body = compileMappedFields(mapping, context);
  return {
    body,
    contentType,
    referenceFieldName: readReferenceFieldName(mapping),
  };
}

export function compileMappedFields(
  mapping: RequestMapping,
  context: RequestMappingContext,
): Record<string, unknown> {
  if (!Array.isArray(mapping.fields) || mapping.fields.length === 0) {
    throw mappingFailure('invalid_request_mapping', 'request mapping 缺少字段映射');
  }

  const output: Record<string, unknown> = {};
  for (const rawField of mapping.fields) {
    const field = readMappingField(rawField);
    const rawValue = readSourceValue(field.source, context);
    const value = applyTransforms(rawValue, field.transforms);
    if ((value === undefined || value === null) && field.omitIfNull) {
      continue;
    }
    if (value === undefined) {
      throw mappingFailure(
        'invalid_request_mapping',
        `request mapping source 不存在: ${field.source}`,
      );
    }
    if (value === DROP_VALUE) {
      continue;
    }
    setMappedValue(output, field.target, value);
  }

  if (Array.isArray(mapping.constants)) {
    for (const constant of mapping.constants) {
      const record = toRecord(constant);
      const target = typeof record?.target === 'string' ? record.target : '';
      if (!target) {
        throw mappingFailure('invalid_request_mapping', 'request mapping constant target 无效');
      }
      setMappedValue(output, target, record?.value);
    }
  }

  return output;
}

export function lintRequestMapping(
  mapping: unknown,
  options: {
    allowedTargetPaths?: string[];
    endpointPath?: string | null;
  } = {},
) {
  const errors: Array<{ field: string; message: string }> = [];
  const requestMapping = toRecord(mapping);
  if (!requestMapping) {
    return {
      ok: false,
      errors: [{ field: 'request_mapping', message: 'request_mapping 必须是对象' }],
    };
  }

  try {
    readContentType(requestMapping);
  } catch (error) {
    errors.push({ field: 'request_mapping.content_type', message: readErrorMessage(error) });
  }

  if (!Array.isArray(requestMapping.fields) || requestMapping.fields.length === 0) {
    errors.push({
      field: 'request_mapping.fields',
      message: 'request_mapping.fields 必须至少包含一个字段',
    });
  } else {
    requestMapping.fields.forEach((field, index) => {
      try {
        readMappingField(field);
      } catch (error) {
        errors.push({
          field: `request_mapping.fields[${index}]`,
          message: readErrorMessage(error),
        });
      }
    });
  }

  if (Array.isArray(requestMapping.constants)) {
    requestMapping.constants.forEach((constant, index) => {
      const record = toRecord(constant);
      if (!record || typeof record.target !== 'string' || !record.target.trim()) {
        errors.push({
          field: `request_mapping.constants[${index}]`,
          message: 'constant 需要 target',
        });
      }
    });
  }

  try {
    readReferenceFieldName(requestMapping);
  } catch (error) {
    errors.push({
      field: 'request_mapping.reference_field',
      message: readErrorMessage(error),
    });
  }

  if (
    options.endpointPath &&
    options.allowedTargetPaths &&
    !options.allowedTargetPaths.includes(options.endpointPath)
  ) {
    errors.push({
      field: 'upstream_endpoint_path',
      message: '当前 adapter 不允许请求该上游路径',
    });
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function readReferenceFieldName(mapping: RequestMapping) {
  const referenceField = toRecord(mapping.reference_field);
  const target = readString(referenceField?.target);
  if (!target) {
    return 'image';
  }
  if (target === 'image[]' || target === 'image') {
    return target;
  }
  throw mappingFailure(
    'invalid_request_mapping',
    '图片编辑 reference field 只能是 image 或 image[]',
  );
}

function readContentType(mapping: RequestMapping): 'json' | 'multipart' {
  if (mapping.content_type === 'json' || mapping.content_type === 'multipart') {
    return mapping.content_type;
  }
  throw mappingFailure('invalid_request_mapping', 'content_type 必须是 json 或 multipart');
}

function readMappingField(rawField: unknown) {
  const field = toRecord(rawField);
  const source = readString(field?.source);
  const target = readString(field?.target);
  if (!source || !target) {
    throw mappingFailure('invalid_request_mapping', 'request mapping field 需要 source 和 target');
  }

  const transforms = readTransforms(field?.transform ?? field?.transforms);
  return {
    source,
    target,
    omitIfNull: field?.omit_if_null === true,
    transforms,
  };
}

function readTransforms(rawTransforms: unknown) {
  const transforms =
    typeof rawTransforms === 'string'
      ? [rawTransforms]
      : Array.isArray(rawTransforms)
        ? rawTransforms
        : [];
  return transforms.map((transform) => {
    if (typeof transform !== 'string' || !ALLOWED_TRANSFORMS.has(transform)) {
      throw mappingFailure('invalid_request_mapping', `transform 不受支持: ${String(transform)}`);
    }
    return transform;
  });
}

const DROP_VALUE = Symbol('drop-value');

function applyTransforms(value: unknown, transforms: string[]): unknown {
  return transforms.reduce<unknown>((current, transform) => {
    switch (transform) {
      case 'dropUnsupported':
        return current === undefined || current === null || current === '' ? DROP_VALUE : current;
      case 'numberToString':
        return typeof current === 'number' ? String(current) : current;
      case 'booleanToFlag':
        return typeof current === 'boolean' ? (current ? 'true' : 'false') : current;
      case 'joinArray':
        return Array.isArray(current) ? current.join(',') : current;
      case 'aspectRatioToOpenAISize':
        if (current === '1:1') return '1024x1024';
        if (current === '16:9') return '1536x1024';
        if (current === '9:16') return '1024x1536';
        return current;
      case 'validateOpenAIImageSize':
        if (typeof current === 'string' && /^(auto|\d{3,5}x\d{3,5})$/.test(current)) {
          return current;
        }
        throw mappingFailure('invalid_request_mapping', 'OpenAI image size 不合法');
      default:
        return current;
    }
  }, value);
}

function readSourceValue(source: string, context: RequestMappingContext): unknown {
  if (source === 'model') {
    return context.model;
  }
  if (source === 'prompt') {
    return context.prompt;
  }
  if (source.startsWith('params.')) {
    return readPath(context.params, source.slice('params.'.length));
  }
  throw mappingFailure('invalid_request_mapping', `request mapping source 不支持: ${source}`);
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
  let current: Record<string, unknown> | unknown[] = output;

  tokens.forEach((token, index) => {
    const isLast = index === tokens.length - 1;
    const key = parseContainerKey(token);

    if (isLast) {
      setContainerValue(current, key, value);
      return;
    }

    const nextToken = tokens[index + 1];
    const nextContainer: Record<string, unknown> | unknown[] = isArrayIndex(nextToken) ? [] : {};
    const existing = readContainerValue(current, key);
    if (!isContainer(existing)) {
      setContainerValue(current, key, nextContainer);
    }
    current = readContainerValue(current, key) as Record<string, unknown> | unknown[];
  });
}

function parseTargetPath(target: string) {
  const normalized = target.replace(/\[(\d+)\]/g, '.$1');
  const tokens = normalized.split('.').filter(Boolean);
  if (tokens.length === 0) {
    throw mappingFailure('invalid_request_mapping', 'request mapping target 无效');
  }
  return tokens;
}

function isArrayIndex(token: string) {
  return /^(0|[1-9]\d*)$/.test(token);
}

function parseContainerKey(token: string) {
  return isArrayIndex(token) ? Number.parseInt(token, 10) : token;
}

function readContainerValue(container: Record<string, unknown> | unknown[], key: number | string) {
  if (Array.isArray(container) && typeof key === 'number') {
    return container[key];
  }
  if (!Array.isArray(container) && typeof key === 'string') {
    return container[key];
  }
  throw mappingFailure('invalid_request_mapping', 'request mapping target 数组路径无效');
}

function setContainerValue(
  container: Record<string, unknown> | unknown[],
  key: number | string,
  value: unknown,
) {
  if (Array.isArray(container) && typeof key === 'number') {
    container[key] = value;
    return;
  }
  if (!Array.isArray(container) && typeof key === 'string') {
    container[key] = value;
    return;
  }
  throw mappingFailure('invalid_request_mapping', 'request mapping target 数组路径无效');
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return isRecord(value) || Array.isArray(value);
}

function mappingFailure(code: string, message: string) {
  return new RequestMappingError(code, message);
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'request mapping 不合法';
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
