'use client';

import { useAuth } from '@/components/auth-provider';
import type { UserRole } from '@/lib/auth';

export function PermissionGate({
  children,
  fallback = null,
  role,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  role: UserRole;
}) {
  const { user } = useAuth();
  return user?.role === role ? children : fallback;
}
