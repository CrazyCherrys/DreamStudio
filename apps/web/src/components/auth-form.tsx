'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth-provider';
import { AuthModeSwitchLink } from '@/components/public-auth-controls';
import { DsButton, DsInput } from '@/components/ui';
import { apiRequest, type AuthPayload, ApiClientError } from '@/lib/auth';
import {
  getSignedInDestination,
  getSignedInDestinationFromPayload,
  sanitizeNextPath,
} from '@/lib/auth-routing';

type AuthMode = 'login' | 'register';

export function AuthForm({ mode, nextPath }: { mode: AuthMode; nextPath?: string | null }) {
  const router = useRouter();
  const { authProblem, loading, newApiConfigStatus, setAuth, user } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isRegister = mode === 'register';
  const safeNextPath = useMemo(() => sanitizeNextPath(nextPath), [nextPath]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (authProblem === 'disabled') {
      router.replace('/disabled' as Route);
      return;
    }

    if (!user) {
      return;
    }

    router.replace(
      getSignedInDestination({
        user,
        newApiConfigStatus,
        nextPath: safeNextPath,
      }) as Route,
    );
  }, [authProblem, loading, newApiConfigStatus, router, safeNextPath, user]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = await apiRequest<AuthPayload>(
        isRegister ? '/api/v1/auth/register' : '/api/v1/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            ...(isRegister ? { display_name: displayName } : {}),
          }),
        },
      );
      setAuth(payload);
      router.replace(getSignedInDestinationFromPayload(payload, safeNextPath) as Route);
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError ? requestError.message : '请求失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || authProblem === 'disabled' || user) {
    const message = loading
      ? '正在确认登录状态...'
      : authProblem === 'disabled'
        ? '正在进入账号状态页...'
        : '正在进入你的工作区...';

    return (
      <div className="grid gap-4 text-center">
        <span className="ds-badge mx-auto">Session</span>
        <h1 className="text-3xl font-black">请稍候</h1>
        <p className="ds-muted">{message}</p>
      </div>
    );
  }

  return (
    <>
      <span className="ds-badge">{isRegister ? '创建账号' : '欢迎回来'}</span>
      <h1 className="mt-5 text-3xl font-black">
        {isRegister ? '注册 DreamStudio' : '登录 DreamStudio'}
      </h1>
      <p className="ds-muted mt-2">
        {isRegister
          ? '创建普通用户账号，稍后可在设置中连接 new-api。'
          : '登录后进入创作台，系统会恢复会话和 CSRF token。'}
      </p>
      <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
        <DsInput
          autoComplete="username"
          label="用户名"
          maxLength={120}
          minLength={3}
          onChange={(event) => setUsername(event.target.value)}
          required
          value={username}
        />
        {isRegister ? (
          <DsInput
            autoComplete="name"
            label="展示名"
            maxLength={160}
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        ) : null}
        <DsInput
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          label="密码"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        {error ? (
          <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
            {error}
          </div>
        ) : null}
        <DsButton disabled={submitting} type="submit">
          {submitting ? '处理中...' : isRegister ? '注册并进入' : '登录'}
        </DsButton>
      </form>
      <p className="ds-muted mt-5 text-sm">
        {isRegister ? '已有账号？' : '还没有账号？'}{' '}
        <AuthModeSwitchLink mode={mode} nextPath={safeNextPath} />
      </p>
    </>
  );
}
