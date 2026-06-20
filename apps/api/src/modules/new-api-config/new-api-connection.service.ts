import { HttpStatus, Injectable } from '@nestjs/common';

import { apiError } from '../auth/auth.errors';
import type { ConnectionTestResult } from './new-api-config.types';

const NEW_API_TEST_TIMEOUT_MS = 12000;

@Injectable()
export class NewApiConnectionService {
  async testConnection(baseUrl: string, apiKey: string): Promise<ConnectionTestResult> {
    const testedAt = new Date();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NEW_API_TEST_TIMEOUT_MS);

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
        return {
          ok: false,
          status: 'invalid',
          model_count: null,
          tested_at: testedAt.toISOString(),
          error: this.summarizeHttpError(response.status),
        };
      }

      const payload = (await response.json().catch(() => null)) as unknown;
      return {
        ok: true,
        status: 'valid',
        model_count: this.countModels(payload),
        tested_at: testedAt.toISOString(),
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        status: 'invalid',
        model_count: null,
        tested_at: testedAt.toISOString(),
        error:
          error instanceof Error && error.name === 'AbortError'
            ? '连接测试超时'
            : this.sanitizeError(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  assertUsableSavedKey(apiKey: string | null): asserts apiKey is string {
    if (!apiKey) {
      throw apiError(HttpStatus.BAD_REQUEST, 'new_api_config_missing', '未配置 new-api API Key');
    }
  }

  private countModels(payload: unknown): number | null {
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

    return null;
  }

  private summarizeHttpError(status: number): string {
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

  private sanitizeError(error: unknown): string {
    if (!(error instanceof Error)) {
      return '连接 new-api 失败';
    }

    return error.message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').slice(0, 240);
  }
}
