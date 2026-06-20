'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth-provider';
import { DsButton, DsInput } from '@/components/ui';
import { apiRequest, type AuthPayload, ApiClientError } from '@/lib/auth';

type AuthMode = 'login' | 'register';

function destinationFor(payload: AuthPayload) {
  if (payload.user.status === 'disabled') {
    return '/disabled';
  }

  if (payload.user.role === 'super_admin') {
    return '/admin';
  }

  return payload.new_api_config_status === 'valid' ? '/studio' : '/onboarding/new-api';
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isRegister = mode === 'register';

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
      router.replace(destinationFor(payload) as Route);
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError ? requestError.message : '请求失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
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
        <Link
          className="font-bold text-[var(--ds-brand)]"
          href={isRegister ? '/auth/login' : '/auth/register'}
        >
          {isRegister ? '登录' : '注册'}
        </Link>
      </p>
    </>
  );
}
