'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { DsButton, DsFormSection, DsInput } from '@/components/ui';
import { apiRequest, ApiClientError, type AuthPayload } from '@/lib/auth';

export function AccountSettingsContent() {
  const router = useRouter();
  const { clearAuth, csrfToken, setAuth, user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setDisplayName(user?.display_name ?? '');
  }, [user?.display_name]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) {
      setProfileError('登录状态已失效，请重新登录');
      return;
    }

    setSavingProfile(true);
    setProfileMessage(null);
    setProfileError(null);
    try {
      const payload = await apiRequest<AuthPayload>('/api/v1/me/profile', {
        method: 'PATCH',
        csrfToken,
        body: JSON.stringify({
          display_name: displayName,
        }),
      });
      setAuth(payload);
      setDisplayName(payload.user.display_name ?? '');
      setProfileMessage('展示名已更新。');
    } catch (requestError) {
      setProfileError(
        requestError instanceof ApiClientError ? requestError.message : '保存展示名失败，请稍后重试',
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) {
      setPasswordError('登录状态已失效，请重新登录');
      return;
    }

    setSavingPassword(true);
    setPasswordMessage(null);
    setPasswordError(null);
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
      setPasswordMessage('密码已更新，其他设备上的会话已失效。');
    } catch (requestError) {
      setPasswordError(
        requestError instanceof ApiClientError ? requestError.message : '修改密码失败，请稍后重试',
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function logout() {
    if (!csrfToken) {
      clearAuth();
      router.replace('/auth/login' as Route);
      return;
    }

    setLoggingOut(true);
    await apiRequest('/api/v1/auth/logout', {
      method: 'POST',
      csrfToken,
    }).catch(() => undefined);
    clearAuth();
    router.replace('/auth/login' as Route);
  }

  return (
    <div className="admin-page">
      <section className="ds-card admin-panel p-6">
        <span className="ds-badge">Account</span>
        <h2 className="mt-4 text-2xl font-black">账号设置</h2>
        <p className="ds-muted mt-2">管理基础账号信息、展示名、登录密码和当前会话。</p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-5">
          <DsFormSection title="账号信息">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-4">
                <dt className="ds-muted text-sm font-semibold">用户名</dt>
                <dd className="mt-1 font-black">{user?.username}</dd>
              </div>
              <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-4">
                <dt className="ds-muted text-sm font-semibold">角色</dt>
                <dd className="mt-1 font-black">{user?.role}</dd>
              </div>
              <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-4">
                <dt className="ds-muted text-sm font-semibold">当前展示名</dt>
                <dd className="mt-1 font-black">{user?.display_name?.trim() || '未设置'}</dd>
              </div>
            </dl>
          </DsFormSection>

          <DsFormSection
            description="展示名用于 Studio 左下角用户卡片和后台导航展示。留空会回退显示用户名。"
            title="展示名"
          >
            <form className="grid gap-4" onSubmit={saveProfile}>
              <DsInput
                label="展示名"
                maxLength={160}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="输入展示名，留空则显示用户名"
                value={displayName}
              />
              {profileMessage ? (
                <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
                  {profileMessage}
                </p>
              ) : null}
              {profileError ? (
                <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
                  {profileError}
                </p>
              ) : null}
              <DsButton className="w-fit" disabled={savingProfile} type="submit">
                {savingProfile ? '保存中...' : '保存展示名'}
              </DsButton>
            </form>
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
              {passwordMessage ? (
                <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
                  {passwordMessage}
                </p>
              ) : null}
              {passwordError ? (
                <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
                  {passwordError}
                </p>
              ) : null}
              <DsButton className="w-fit" disabled={savingPassword} type="submit">
                {savingPassword ? '保存中...' : '更新密码'}
              </DsButton>
            </form>
          </DsFormSection>
        </div>

        <aside className="ds-card admin-panel grid content-start gap-4 p-6">
          <div>
            <span className="ds-badge">Session</span>
            <h3 className="mt-4 text-xl font-black">当前会话</h3>
            <p className="ds-muted mt-2 text-sm leading-6">
              退出登录会清除当前浏览器的 DreamStudio 会话。
            </p>
          </div>
          <DsButton disabled={loggingOut} onClick={logout} type="button" variant="secondary">
            {loggingOut ? '退出中...' : '退出登录'}
          </DsButton>
        </aside>
      </div>
    </div>
  );
}
