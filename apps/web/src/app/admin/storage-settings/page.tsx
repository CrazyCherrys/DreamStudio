'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AdminPageHeading } from '@/components/admin-page-heading';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import { DsButton, DsInput } from '@/components/ui';
import {
  fetchStorageSettings,
  saveStorageSettings,
  testStorageSettings,
  type StorageSettings,
} from '@/lib/assets';
import { ApiClientError } from '@/lib/auth';

type StorageSettingsFormState = StorageSettings & {
  s3_access_key: string;
  s3_secret_key: string;
};

function toFormState(settings: StorageSettings): StorageSettingsFormState {
  return {
    ...settings,
    s3_access_key: '',
    s3_secret_key: '',
  };
}

function StorageSettingsContent() {
  const { csrfToken } = useAuth();
  const [settings, setSettings] = useState<StorageSettingsFormState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      setSettings(toFormState(await fetchStorageSettings()));
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取存储设置失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  function update<Key extends keyof StorageSettingsFormState>(
    key: Key,
    value: StorageSettingsFormState[Key],
  ) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  function buildPayload(current: StorageSettingsFormState) {
    return {
      driver: current.driver,
      local_input_path: current.local_input_path,
      local_output_path: current.local_output_path,
      s3_endpoint: current.s3_endpoint,
      s3_bucket: current.s3_bucket,
      s3_region: current.s3_region,
      s3_force_path_style: current.s3_force_path_style,
      s3_public_base_url: current.s3_public_base_url,
      s3_access_key: current.s3_access_key,
      s3_secret_key: current.s3_secret_key,
      reference_retention_hours: current.reference_retention_hours,
      result_retention_hours: current.result_retention_hours,
    };
  }

  async function submitSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || !settings) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      setSettings(toFormState(await saveStorageSettings(buildPayload(settings), csrfToken)));
      setMessage('存储设置已保存。');
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function testCurrentSettings() {
    if (!csrfToken || !settings) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      await testStorageSettings(buildPayload(settings), csrfToken);
      setMessage('存储测试通过，临时对象已清理。');
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '存储测试失败');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <section className="ds-card admin-panel p-6">
        <AdminPageHeading title="存储设置" />
        <p className="ds-muted mt-4 font-semibold">正在读取存储设置...</p>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="ds-card admin-panel p-6">
        <AdminPageHeading title="存储设置" />
        <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error ?? '读取存储设置失败'}
        </p>
        <DsButton className="mt-5" onClick={loadSettings} type="button" variant="secondary">
          重试
        </DsButton>
      </section>
    );
  }

  return (
    <section className="ds-card admin-panel p-6">
      <AdminPageHeading title="存储设置" />

      <form className="mt-6 grid gap-6" onSubmit={submitSettings}>
        <div className="flex flex-wrap gap-2">
          {(['local', 's3'] as const).map((driver) => (
            <button
              className={`ds-button ${settings.driver === driver ? '' : 'ds-button-secondary'}`}
              key={driver}
              onClick={() => update('driver', driver)}
              type="button"
            >
              {driver === 'local' ? '本地存储' : 'S3 兼容存储'}
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <DsInput
            label="参考图本地路径"
            onChange={(event) => update('local_input_path', event.target.value)}
            value={settings.local_input_path}
          />
          <DsInput
            label="结果图本地路径"
            onChange={(event) => update('local_output_path', event.target.value)}
            value={settings.local_output_path}
          />
        </div>

        {settings.driver === 's3' ? (
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <DsInput
                label="S3 Endpoint"
                onChange={(event) => update('s3_endpoint', event.target.value)}
                placeholder="https://s3.example.com"
                value={settings.s3_endpoint ?? ''}
              />
              <DsInput
                label="Bucket"
                onChange={(event) => update('s3_bucket', event.target.value)}
                value={settings.s3_bucket ?? ''}
              />
              <DsInput
                label="Region"
                onChange={(event) => update('s3_region', event.target.value)}
                placeholder="auto"
                value={settings.s3_region ?? ''}
              />
              <DsInput
                label="Public Base URL"
                onChange={(event) => update('s3_public_base_url', event.target.value)}
                placeholder="可选"
                value={settings.s3_public_base_url ?? ''}
              />
            </div>

            <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-4 font-bold">
              <input
                checked={settings.s3_force_path_style}
                onChange={(event) => update('s3_force_path_style', event.target.checked)}
                type="checkbox"
              />
              使用 Path Style
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <DsInput
                label={`Access Key${settings.masked_s3_access_key ? ` (${settings.masked_s3_access_key})` : ''}`}
                onChange={(event) => update('s3_access_key', event.target.value)}
                placeholder="留空表示不修改"
                type="password"
                value={settings.s3_access_key}
              />
              <DsInput
                label={`Secret Key${settings.masked_s3_secret_key ? ` (${settings.masked_s3_secret_key})` : ''}`}
                onChange={(event) => update('s3_secret_key', event.target.value)}
                placeholder="留空表示不修改"
                type="password"
                value={settings.s3_secret_key}
              />
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <DsInput
            label="参考图保留小时"
            min={1}
            onChange={(event) =>
              update('reference_retention_hours', Number.parseInt(event.target.value, 10))
            }
            type="number"
            value={String(settings.reference_retention_hours)}
          />
          <DsInput
            label="结果图保留小时"
            min={1}
            onChange={(event) =>
              update('result_retention_hours', Number.parseInt(event.target.value, 10))
            }
            type="number"
            value={String(settings.result_retention_hours)}
          />
        </div>

        {message ? (
          <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <DsButton disabled={saving} type="submit">
            {saving ? '保存中...' : '保存存储设置'}
          </DsButton>
          <DsButton
            disabled={testing}
            onClick={testCurrentSettings}
            type="button"
            variant="secondary"
          >
            {testing ? '测试中...' : '测试存储'}
          </DsButton>
        </div>
      </form>
    </section>
  );
}

export default function AdminStorageSettingsPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <StorageSettingsContent />
      </AdminLayout>
    </RouteGuard>
  );
}
