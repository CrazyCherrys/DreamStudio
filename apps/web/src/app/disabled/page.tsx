'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { DsButton } from '@/components/ui';
import { apiRequest } from '@/lib/auth';

export default function DisabledPage() {
  const router = useRouter();
  const { clearAuth, csrfToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    if (!csrfToken) {
      clearAuth();
      router.replace('/auth/login');
      return;
    }

    setSubmitting(true);
    await apiRequest('/api/v1/auth/logout', {
      method: 'POST',
      csrfToken,
    }).catch(() => undefined);
    clearAuth();
    router.replace('/auth/login');
  }

  return (
    <main className="ds-shell grid min-h-screen place-items-center py-10">
      <section className="ds-card max-w-lg p-8 text-center">
        <span className="ds-badge">账号状态</span>
        <h1 className="mt-5 text-3xl font-black">账号已被禁用</h1>
        <p className="ds-muted mt-4 leading-7">
          当前账号不能继续访问 DreamStudio。请联系管理员确认状态，或切换到其他账号。
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <DsButton disabled={submitting} onClick={logout} type="button" variant="secondary">
            退出登录
          </DsButton>
          <Link className="ds-button" href="/">
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
