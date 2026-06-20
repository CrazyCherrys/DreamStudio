'use client';

import Link from 'next/link';

import { NewApiConfigForm } from '@/components/new-api-config-form';
import { RouteGuard } from '@/components/route-guard';

export default function NewApiSettingsPage() {
  return (
    <RouteGuard>
      <main className="ds-shell min-h-screen py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="ds-badge">Settings</span>
            <h1 className="mt-4 text-3xl font-black">服务密钥</h1>
          </div>
          <Link className="ds-button ds-button-secondary" href="/settings/account">
            账号设置
          </Link>
        </header>
        <NewApiConfigForm mode="settings" />
      </main>
    </RouteGuard>
  );
}
