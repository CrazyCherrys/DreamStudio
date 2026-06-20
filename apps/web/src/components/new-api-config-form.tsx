'use client';

import { useEffect, useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth-provider';
import { DsButton, DsInput } from '@/components/ui';
import { ApiClientError, apiRequest } from '@/lib/auth';
import {
  fetchOwnNewApiConfig,
  formatDateTime,
  statusLabel,
  type ConnectionTestResult,
  type PublicNewApiConfig,
} from '@/lib/new-api-config';

export function StatusBadge({ status }: { status: PublicNewApiConfig['status'] }) {
  const className =
    status === 'valid'
      ? 'border-[var(--ds-success)]/30 text-[var(--ds-success)]'
      : status === 'invalid'
        ? 'border-[var(--ds-danger)]/30 text-[var(--ds-danger)]'
        : 'border-[var(--ds-border)] text-[var(--ds-text-muted)]';

  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-[var(--ds-radius-sm)] border bg-white/70 px-3 text-sm font-black ${className}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function NewApiConfigForm({ mode }: { mode: 'onboarding' | 'settings' }) {
  const router = useRouter();
  const { csrfToken, refreshMe } = useAuth();
  const [config, setConfig] = useState<PublicNewApiConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadConfig() {
    setLoading(true);
    setError(null);
    try {
      const nextConfig = await fetchOwnNewApiConfig();
      setConfig(nextConfig);
      setBaseUrl(nextConfig.new_api_base_url ?? nextConfig.default_new_api_base_url ?? '');
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError ? requestError.message : '读取配置失败，请稍后重试',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  async function testConnection() {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return null;
    }

    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await apiRequest<ConnectionTestResult>('/api/v1/me/new-api-config/test', {
        method: 'POST',
        csrfToken,
        body: JSON.stringify({
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
          ...(baseUrl.trim() ? { new_api_base_url: baseUrl.trim() } : {}),
        }),
      });
      setTestResult(result);
      setMessage(result.ok ? '连接测试成功。' : '连接测试失败，已记录为异常状态。');
      await loadConfig();
      return result;
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError ? requestError.message : '连接测试失败，请稍后重试',
      );
      return null;
    } finally {
      setTesting(false);
    }
  }

  async function saveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const nextConfig = await apiRequest<PublicNewApiConfig>('/api/v1/me/new-api-config', {
        method: 'PUT',
        csrfToken,
        body: JSON.stringify({
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
          ...(baseUrl.trim() ? { new_api_base_url: baseUrl.trim() } : {}),
          test_before_save: true,
        }),
      });
      setConfig(nextConfig);
      setApiKey('');
      setTestResult(null);
      await refreshMe();

      if (nextConfig.status === 'valid' && mode === 'onboarding') {
        router.replace('/studio' as Route);
        return;
      }

      setMessage(
        nextConfig.status === 'valid' ? '配置已保存并测试通过。' : '配置已保存，但连接测试未通过。',
      );
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError ? requestError.message : '保存配置失败，请稍后重试',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="ds-card p-6">
        <span className="ds-badge">new-api</span>
        <p className="ds-muted mt-4 font-semibold">正在读取配置...</p>
      </section>
    );
  }

  if (!config) {
    return (
      <section className="ds-card p-6">
        <span className="ds-badge">new-api</span>
        <p className="ds-muted mt-4 font-semibold">暂时无法读取配置。</p>
        {error ? (
          <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="ds-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="ds-badge">new-api</span>
          <h1 className="mt-4 text-3xl font-black">
            {mode === 'onboarding' ? '连接 new-api' : 'new-api 配置'}
          </h1>
          <p className="ds-muted mt-2 max-w-2xl leading-7">
            在 new-api 控制台创建 API Key 后保存到 DreamStudio。密钥只会加密入库，页面只显示掩码。
          </p>
        </div>
        {config ? <StatusBadge status={config.status} /> : null}
      </div>

      {config ? (
        <dl className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/60 p-4">
            <dt className="ds-muted text-sm font-semibold">密钥</dt>
            <dd className="mt-1 font-black">{config.masked_api_key ?? '未配置'}</dd>
          </div>
          <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/60 p-4">
            <dt className="ds-muted text-sm font-semibold">最近测试</dt>
            <dd className="mt-1 font-black">{formatDateTime(config.last_tested_at)}</dd>
          </div>
          <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/60 p-4">
            <dt className="ds-muted text-sm font-semibold">默认 Base URL</dt>
            <dd className="mt-1 break-all font-black">
              {config.default_new_api_base_url ?? '管理员未配置'}
            </dd>
          </div>
        </dl>
      ) : null}

      <form className="mt-6 grid gap-4" onSubmit={saveConfig}>
        <DsInput
          label="API Key"
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={config?.configured ? '留空表示继续使用已保存密钥' : 'sk-...'}
          required={!config?.configured}
          type="password"
          value={apiKey}
        />
        {config?.allow_custom_base_url ? (
          <DsInput
            label="Base URL"
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={config.default_new_api_base_url ?? 'https://new-api.example.com'}
            value={baseUrl}
          />
        ) : (
          <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/60 p-4">
            <p className="text-sm font-bold">Base URL</p>
            <p className="mt-1 break-all font-black">
              {config.default_new_api_base_url ?? '管理员未配置'}
            </p>
          </div>
        )}

        {config?.last_test_error ? (
          <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
            {config.last_test_error}
          </p>
        ) : null}
        {testResult ? (
          <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 px-4 py-3 text-sm font-semibold">
            {testResult.ok
              ? `测试通过，模型数量 ${testResult.model_count ?? '未知'}`
              : testResult.error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <DsButton disabled={saving} type="submit">
            {saving ? '保存中...' : '保存配置'}
          </DsButton>
          <DsButton disabled={testing} onClick={testConnection} type="button" variant="secondary">
            {testing ? '测试中...' : '测试连接'}
          </DsButton>
        </div>
      </form>
    </section>
  );
}
