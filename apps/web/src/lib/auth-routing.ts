'use client';

import type { AuthPayload, AuthUser, NewApiConfigStatus } from '@/lib/auth';

const BLOCKED_NEXT_PATHS = new Set(['/auth/login', '/auth/register', '/disabled']);
const EXTERNAL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export type SafeNextPath = string & { readonly __brand: 'SafeNextPath' };

function normalizePathname(path: string) {
  return path.split('?')[0]?.split('#')[0] ?? path;
}

export function sanitizeNextPath(nextPath?: string | string[] | null) {
  const value = Array.isArray(nextPath) ? nextPath[0] : nextPath;
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }

  if (EXTERNAL_SCHEME_PATTERN.test(trimmed)) {
    return null;
  }

  return BLOCKED_NEXT_PATHS.has(normalizePathname(trimmed)) ? null : (trimmed as SafeNextPath);
}

export function buildAuthPageHref(
  path: '/auth/login' | '/auth/register',
  nextPath?: SafeNextPath | string | null,
) {
  const safeNextPath = sanitizeNextPath(nextPath);
  if (!safeNextPath) {
    return path;
  }

  return `${path}?next=${encodeURIComponent(safeNextPath)}`;
}

export function getSignedInDestination({
  user,
  newApiConfigStatus,
  nextPath,
}: {
  user: AuthUser;
  newApiConfigStatus: NewApiConfigStatus | null | undefined;
  nextPath?: string | string[] | null;
}) {
  if (user.status === 'disabled') {
    return '/disabled';
  }

  const safeNextPath = sanitizeNextPath(nextPath);
  if (safeNextPath) {
    return safeNextPath;
  }

  if (user.role === 'super_admin') {
    return '/admin/users';
  }

  return newApiConfigStatus === 'valid' ? '/studio' : '/onboarding/new-api';
}

export function getSignedInDestinationFromPayload(
  payload: AuthPayload,
  nextPath?: string | string[] | null,
) {
  return getSignedInDestination({
    user: payload.user,
    newApiConfigStatus: payload.new_api_config_status,
    nextPath,
  });
}

export function getUserInitial(user: Pick<AuthUser, 'display_name' | 'username'> | null) {
  const name = user?.display_name?.trim() || user?.username?.trim() || 'D';
  return name.slice(0, 1).toUpperCase();
}
