'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { useAuth } from '@/components/auth-provider';
import {
  buildAuthPageHref,
  getSignedInDestination,
  getUserInitial,
  type SafeNextPath,
} from '@/lib/auth-routing';

function LoadingPill({ className }: { className: string }) {
  return <span aria-hidden="true" className={className} />;
}

export function PublicAuthControls() {
  const { loading, newApiConfigStatus, user } = useAuth();

  if (loading) {
    return (
      <div className="public-auth-nav">
        <LoadingPill className="public-auth-skeleton public-auth-skeleton-link" />
        <LoadingPill className="public-auth-skeleton public-auth-skeleton-button" />
      </div>
    );
  }

  if (!user) {
    return (
      <nav className="public-auth-nav">
        <Link className="ds-muted hover:text-[var(--ds-text)]" href="/auth/login">
          登录
        </Link>
        <Link className="ds-button" href="/auth/register">
          开始使用
        </Link>
      </nav>
    );
  }

  const href = getSignedInDestination({
    user,
    newApiConfigStatus,
  });
  const userLabel = user.display_name?.trim() || user.username;
  const destinationLabel = user.role === 'super_admin' ? '管理后台' : '用户后台';

  return (
    <div className="public-auth-nav">
      <Link
        aria-label={`${userLabel}，进入${destinationLabel}`}
        className="public-user-chip"
        href={href as Route}
        title={`${userLabel} · ${destinationLabel}`}
      >
        <span className="public-user-avatar">{getUserInitial(user)}</span>
      </Link>
    </div>
  );
}

export function PublicPrimaryCta() {
  const { loading, newApiConfigStatus, user } = useAuth();

  if (loading) {
    return (
      <span aria-hidden="true" className="ds-button public-cta-placeholder">
        正在确认...
      </span>
    );
  }

  if (!user) {
    return (
      <Link className="ds-button" href="/auth/login">
        开始创作
      </Link>
    );
  }

  const href = getSignedInDestination({
    user,
    newApiConfigStatus,
  });

  let label = '继续创作';
  if (user.status === 'disabled') {
    label = '查看账号状态';
  } else if (user.role === 'super_admin') {
    label = '进入后台';
  } else if (newApiConfigStatus !== 'valid') {
    label = '继续配置';
  }

  return (
    <Link className="ds-button" href={href as Route}>
      {label}
    </Link>
  );
}

export function PublicSecondaryCta() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <span aria-hidden="true" className="ds-button ds-button-secondary public-cta-placeholder">
        请稍候
      </span>
    );
  }

  if (!user) {
    return (
      <Link className="ds-button ds-button-secondary" href="/auth/login">
        登录
      </Link>
    );
  }

  if (user.status === 'disabled') {
    return (
      <Link className="ds-button ds-button-secondary" href="/disabled">
        查看账号状态
      </Link>
    );
  }

  return (
    <Link className="ds-button ds-button-secondary" href="#setup-flow">
      了解流程
    </Link>
  );
}

export function AuthModeSwitchLink({
  mode,
  nextPath,
}: {
  mode: 'login' | 'register';
  nextPath?: SafeNextPath | null;
}) {
  const href = buildAuthPageHref(mode === 'register' ? '/auth/login' : '/auth/register', nextPath);
  return (
    <Link className="font-bold text-[var(--ds-brand)]" href={href as Route}>
      {mode === 'register' ? '登录' : '注册'}
    </Link>
  );
}
