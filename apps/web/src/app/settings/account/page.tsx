'use client';

import { useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { RouteGuard } from '@/components/route-guard';
import { DsButton, DsFormSection, DsInput } from '@/components/ui';
import { apiRequest, ApiClientError, type AuthPayload } from '@/lib/auth';

function AccountSettingsContent() {
  const { csrfToken, setAuth, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const payload = await apiRequest<AuthPayload>('/api/v1/me/password', {
        method: 'PATCH',
        csrfToken,
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setAuth(payload);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('密码已更新，其他设备上的会话已失效。');
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError ? requestError.message : '修改密码失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="ds-shell min-h-screen py-8">
      <header className="mb-6">
        <span className="ds-badge">Account</span>
        <h1 className="mt-4 text-3xl font-black">账号设置</h1>
        <p className="ds-muted mt-2">管理基础账号信息和登录密码。</p>
      </header>
      <div className="grid max-w-[880px] gap-5">
        <DsFormSection title="账号信息">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/60 p-4">
              <dt className="ds-muted text-sm font-semibold">用户名</dt>
              <dd className="mt-1 font-black">{user?.username}</dd>
            </div>
            <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/60 p-4">
              <dt className="ds-muted text-sm font-semibold">角色</dt>
              <dd className="mt-1 font-black">{user?.role}</dd>
            </div>
          </dl>
        </DsFormSection>

        <DsFormSection
          description="修改成功后，当前设备保持登录，其他设备需要重新登录。"
          title="修改密码"
        >
          <form className="grid gap-4" onSubmit={changePassword}>
            <DsInput
              autoComplete="current-password"
              label="当前密码"
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
            <DsInput
              autoComplete="new-password"
              label="新密码"
              minLength={8}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
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
            <DsButton className="w-fit" disabled={submitting} type="submit">
              {submitting ? '保存中...' : '更新密码'}
            </DsButton>
          </form>
        </DsFormSection>
      </div>
    </main>
  );
}

export default function AccountSettingsPage() {
  return (
    <RouteGuard>
      <AccountSettingsContent />
    </RouteGuard>
  );
}
