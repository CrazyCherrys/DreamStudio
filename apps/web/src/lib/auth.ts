'use client';

export type UserRole = 'user' | 'super_admin';
export type UserStatus = 'active' | 'disabled' | 'deleted';
export type NewApiConfigStatus = 'missing' | 'untested' | 'valid' | 'invalid';

export interface AuthUser {
  id: string;
  username: string;
  display_name: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface AuthPayload {
  user: AuthUser;
  new_api_config_status: NewApiConfigStatus;
  csrf_token: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id?: string;
}

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { csrfToken?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');

  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (options.csrfToken) {
    headers.set('x-csrf-token', options.csrfToken);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.success) {
    throw new ApiClientError(
      payload?.error?.message ?? '请求失败',
      payload?.error?.code ?? 'request_failed',
      response.status,
      payload?.error?.details,
    );
  }

  return payload.data as T;
}
