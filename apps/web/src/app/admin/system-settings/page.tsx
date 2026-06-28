'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AdminPageHeading } from '@/components/admin-page-heading';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import { DsButton, DsInput } from '@/components/ui';
import { ApiClientError, apiRequest } from '@/lib/auth';
import type { SystemSettings } from '@/lib/new-api-config';

const NUMBER_FIELDS: Array<{ key: keyof SystemSettings; label: string; min: number; max: number }> =
  [
    { key: 'image_task_timeout_seconds', label: '任务超时秒数', min: 30, max: 7200 },
    { key: 'image_task_max_attempts', label: '最大尝试次数', min: 1, max: 10 },
    { key: 'image_task_retry_backoff_seconds', label: '重试退避秒数', min: 1, max: 3600 },
    { key: 'per_user_running_task_limit', label: '单用户并发任务', min: 1, max: 100 },
    { key: 'global_running_task_limit', label: '全局并发任务', min: 1, max: 1000 },
    { key: 'request_log_retention_hours', label: '请求日志保留小时', min: 1, max: 87600 },
    { key: 'audit_log_retention_hours', label: '审计日志保留小时', min: 1, max: 87600 },
  ];

function SystemSettingsContent() {
  const { csrfToken } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      setSettings(
        await apiRequest<SystemSettings>('/api/v1/admin/system-settings', {
          cache: 'no-store',
        }),
      );
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取系统设置失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || !settings) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      setSettings(
        await apiRequest<SystemSettings>('/api/v1/admin/system-settings', {
          method: 'PATCH',
          csrfToken,
          body: JSON.stringify(settings),
        }),
      );
      setMessage('系统设置已保存。');
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '保存系统设置失败');
    } finally {
      setSaving(false);
    }
  }

  function updateSetting<Key extends keyof SystemSettings>(key: Key, value: SystemSettings[Key]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  if (loading) {
    return (
      <section className="ds-card admin-panel p-6">
        <AdminPageHeading title="系统设置" />
        <p className="ds-muted mt-4 font-semibold">正在读取系统设置...</p>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="ds-card admin-panel p-6">
        <AdminPageHeading title="系统设置" />
        <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error ?? '读取系统设置失败'}
        </p>
        <DsButton className="mt-5" onClick={loadSettings} type="button" variant="secondary">
          重试
        </DsButton>
      </section>
    );
  }

  return (
    <section className="ds-card admin-panel p-6">
      <AdminPageHeading title="系统设置" />

      <form className="mt-6 grid gap-5" onSubmit={saveSettings}>
        <DsInput
          label="默认 new-api Base URL"
          onChange={(event) =>
            updateSetting(
              'default_new_api_base_url',
              event.target.value as SystemSettings['default_new_api_base_url'],
            )
          }
          placeholder="https://new-api.example.com"
          value={settings.default_new_api_base_url}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-4 font-bold">
            <input
              checked={settings.allow_user_custom_new_api_base_url}
              onChange={(event) =>
                updateSetting('allow_user_custom_new_api_base_url', event.target.checked)
              }
              type="checkbox"
            />
            允许用户自定义 Base URL
          </label>
          <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-4 font-bold">
            <input
              checked={settings.registration_enabled}
              onChange={(event) => updateSetting('registration_enabled', event.target.checked)}
              type="checkbox"
            />
            开放注册
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {NUMBER_FIELDS.map((field) => (
            <DsInput
              key={field.key}
              label={field.label}
              max={field.max}
              min={field.min}
              onChange={(event) =>
                updateSetting(field.key, Number.parseInt(event.target.value, 10) as never)
              }
              type="number"
              value={String(settings[field.key])}
            />
          ))}
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

        <DsButton className="w-fit" disabled={saving} type="submit">
          {saving ? '保存中...' : '保存系统设置'}
        </DsButton>
      </form>
    </section>
  );
}

export default function AdminSystemSettingsPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <SystemSettingsContent />
      </AdminLayout>
    </RouteGuard>
  );
}
