'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { apiRequest, ApiClientError, type AuthPayload, type AuthUser } from '@/lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  newApiConfigStatus: AuthPayload['new_api_config_status'] | null;
  csrfToken: string | null;
  authProblem: 'disabled' | null;
  loading: boolean;
  refreshMe: () => Promise<AuthPayload | null>;
  setAuth: (payload: AuthPayload) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [newApiConfigStatus, setNewApiConfigStatus] = useState<
    AuthPayload['new_api_config_status'] | null
  >(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [authProblem, setAuthProblem] = useState<'disabled' | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    setNewApiConfigStatus(null);
    setCsrfToken(null);
    setAuthProblem(null);
  }, []);

  const setAuth = useCallback((payload: AuthPayload) => {
    setUser(payload.user);
    setNewApiConfigStatus(payload.new_api_config_status);
    setCsrfToken(payload.csrf_token);
    setAuthProblem(payload.user.status === 'disabled' ? 'disabled' : null);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const payload = await apiRequest<AuthPayload>('/api/v1/auth/me', {
        cache: 'no-store',
      });
      setAuth(payload);
      return payload;
    } catch (requestError) {
      setUser(null);
      setNewApiConfigStatus(null);
      setCsrfToken(null);
      setAuthProblem(
        requestError instanceof ApiClientError && requestError.code === 'account_disabled'
          ? 'disabled'
          : null,
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearAuth, setAuth]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const value = useMemo(
    () => ({
      user,
      newApiConfigStatus,
      csrfToken,
      authProblem,
      loading,
      refreshMe,
      setAuth,
      clearAuth,
    }),
    [authProblem, clearAuth, csrfToken, loading, newApiConfigStatus, refreshMe, setAuth, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
