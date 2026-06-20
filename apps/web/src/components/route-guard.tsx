'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth-provider';
import type { UserRole } from '@/lib/auth';

export function RouteGuard({
  children,
  requireNewApiConfig = false,
  requireRole,
}: {
  children: React.ReactNode;
  requireNewApiConfig?: boolean;
  requireRole?: UserRole;
}) {
  const { authProblem, loading, newApiConfigStatus, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (authProblem === 'disabled') {
      router.replace('/disabled' as Route);
      return;
    }

    if (!user) {
      router.replace(`/auth/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (user.status === 'disabled') {
      router.replace('/disabled' as Route);
      return;
    }

    if (requireNewApiConfig && user.role !== 'super_admin' && newApiConfigStatus !== 'valid') {
      router.replace('/onboarding/new-api' as Route);
    }
  }, [authProblem, loading, newApiConfigStatus, pathname, requireNewApiConfig, router, user]);

  if (loading || authProblem === 'disabled' || !user || user.status === 'disabled') {
    return (
      <main className="ds-shell grid min-h-screen place-items-center py-10">
        <div className="ds-card p-6 text-center">
          <span className="ds-badge">Session</span>
          <p className="ds-muted mt-4 font-semibold">正在确认登录状态...</p>
        </div>
      </main>
    );
  }

  if (requireRole && user.role !== requireRole) {
    return (
      <main className="ds-shell grid min-h-screen place-items-center py-10">
        <section className="ds-card max-w-md p-7 text-center">
          <span className="ds-badge">403</span>
          <h1 className="mt-5 text-3xl font-black">无权限访问</h1>
          <p className="ds-muted mt-3 leading-7">当前账号没有访问该页面的权限。</p>
          <Link className="ds-button mt-6" href="/studio">
            返回创作台
          </Link>
        </section>
      </main>
    );
  }

  if (requireNewApiConfig && user.role !== 'super_admin' && newApiConfigStatus !== 'valid') {
    return (
      <main className="ds-shell grid min-h-screen place-items-center py-10">
        <div className="ds-card p-6 text-center">
          <span className="ds-badge">new-api</span>
          <p className="ds-muted mt-4 font-semibold">正在进入配置引导...</p>
        </div>
      </main>
    );
  }

  return children;
}
