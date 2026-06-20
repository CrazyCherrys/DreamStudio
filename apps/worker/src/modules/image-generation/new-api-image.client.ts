import { basename } from 'node:path';

export interface NewApiImageReference {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export interface NewApiImageRequest {
  baseUrl: string;
  apiKey: string;
  endpointType: 'openai_image_generations' | 'openai_image_edits';
  model: string;
  prompt: string;
  parameters: Record<string, unknown>;
  references?: NewApiImageReference[];
  timeoutMs?: number;
}

export interface NewApiImageData {
  url?: string;
  b64_json?: string;
}

export interface NewApiImageResponse {
  data: NewApiImageData[];
  raw: unknown;
  httpStatus: number;
}

export class NewApiImageClientError extends Error {
  code: string;
  httpStatus: number | null;
  isRetryable: boolean;

  constructor(input: {
    code: string;
    message: string;
    httpStatus?: number | null;
    isRetryable?: boolean;
  }) {
    super(input.message);
    this.name = 'NewApiImageClientError';
    this.code = input.code;
    this.httpStatus = input.httpStatus ?? null;
    this.isRetryable = input.isRetryable ?? false;
  }
}

export class NewApiImageClient {
  async createImage(input: NewApiImageRequest): Promise<NewApiImageResponse> {
    const endpoint =
      input.endpointType === 'openai_image_edits' ? '/v1/images/edits' : '/v1/images/generations';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 120000);

    try {
      const response = await fetch(`${input.baseUrl.replace(/\/+$/, '')}${endpoint}`, {
        method: 'POST',
        headers:
          input.endpointType === 'openai_image_edits'
            ? {
                accept: 'application/json',
                authorization: `Bearer ${input.apiKey}`,
              }
            : {
                accept: 'application/json',
                authorization: `Bearer ${input.apiKey}`,
                'content-type': 'application/json',
              },
        body:
          input.endpointType === 'openai_image_edits'
            ? this.buildEditBody(input)
            : JSON.stringify({
                model: input.model,
                prompt: input.prompt,
                ...input.parameters,
              }),
        signal: controller.signal,
      });
      const rawText = await response.text();
      const raw = parseJson(rawText);

      if (!response.ok) {
        throw toImageClientError(response.status, rawText, raw);
      }

      return {
        data: readImageData(raw),
        raw,
        httpStatus: response.status,
      };
    } catch (error) {
      if (error instanceof NewApiImageClientError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new NewApiImageClientError({
          code: 'timeout',
          message: '上游图片接口请求超时',
          httpStatus: 408,
          isRetryable: true,
        });
      }
      throw new NewApiImageClientError({
        code: 'new_api_connection_failed',
        message: '无法连接 new-api 图片接口',
        isRetryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private buildEditBody(input: NewApiImageRequest) {
    const formData = new FormData();
    formData.set('model', input.model);
    formData.set('prompt', input.prompt);
    for (const [key, value] of Object.entries(input.parameters)) {
      if (value !== undefined && value !== null && key !== 'model' && key !== 'prompt') {
        formData.set(key, String(value));
      }
    }
    (input.references ?? []).forEach((reference, index) => {
      formData.append(
        'image',
        new File(
          [toArrayBuffer(reference.buffer)],
          basename(reference.filename) || `image-${index}.png`,
          {
            type: reference.contentType,
          },
        ),
      );
    });
    return formData;
  }
}

function parseJson(rawText: string): unknown {
  if (!rawText) {
    return null;
  }
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function readImageData(raw: unknown): NewApiImageData[] {
  if (!isRecord(raw) || !Array.isArray(raw.data)) {
    throw new NewApiImageClientError({
      code: 'invalid_upstream_response',
      message: '上游图片接口返回格式不正确',
    });
  }

  const data = raw.data
    .filter(isRecord)
    .map((item) => ({
      url: typeof item.url === 'string' ? item.url : undefined,
      b64_json: typeof item.b64_json === 'string' ? item.b64_json : undefined,
    }))
    .filter((item) => item.url || item.b64_json);

  if (data.length === 0) {
    throw new NewApiImageClientError({
      code: 'invalid_upstream_response',
      message: '上游图片接口没有返回图片',
    });
  }

  return data;
}

function toImageClientError(status: number, rawText: string, raw: unknown) {
  const message = readErrorMessage(raw, rawText);
  const lowered = message.toLowerCase();

  if (status === 401 || status === 403) {
    return new NewApiImageClientError({
      code: 'new_api_auth_failed',
      message: 'new-api 密钥无效或无权限',
      httpStatus: status,
    });
  }
  if (
    status === 402 ||
    lowered.includes('quota') ||
    lowered.includes('额度') ||
    lowered.includes('余额')
  ) {
    return new NewApiImageClientError({
      code: 'new_api_quota_insufficient',
      message: 'new-api 额度不足',
      httpStatus: status,
    });
  }
  if (status === 408) {
    return new NewApiImageClientError({
      code: 'timeout',
      message: '上游图片接口请求超时',
      httpStatus: status,
      isRetryable: true,
    });
  }
  if (status === 429 || status >= 500) {
    return new NewApiImageClientError({
      code: 'retryable',
      message: '上游图片接口暂时不可用，请稍后重试',
      httpStatus: status,
      isRetryable: true,
    });
  }
  if (status >= 400 && status < 500) {
    return new NewApiImageClientError({
      code: 'invalid_upstream_request',
      message: message || '上游图片接口拒绝了请求参数',
      httpStatus: status,
    });
  }

  return new NewApiImageClientError({
    code: 'new_api_request_failed',
    message: message || '上游图片接口请求失败',
    httpStatus: status,
  });
}

function readErrorMessage(raw: unknown, fallback: string) {
  if (isRecord(raw)) {
    if (typeof raw.error === 'string') {
      return raw.error;
    }
    if (isRecord(raw.error) && typeof raw.error.message === 'string') {
      return raw.error.message;
    }
    if (typeof raw.message === 'string') {
      return raw.message;
    }
  }

  return fallback.slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))
  );
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}
