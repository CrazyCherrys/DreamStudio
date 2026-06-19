import Link from 'next/link';

import { AuthLayout } from '@/components/layouts';

export default function RegisterPage() {
  return (
    <AuthLayout>
      <span className="ds-badge">M1 Preview</span>
      <h1 className="mt-5 text-3xl font-black">注册 DreamStudio</h1>
      <p className="ds-muted mt-2">注册、会话和 CSRF 将在 M1 实现，M0 只保留页面骨架。</p>
      <form className="mt-6 grid gap-4">
        <label className="grid gap-2 text-sm font-bold">
          用户名
          <input
            className="rounded-xl border border-[var(--ds-border)] bg-white px-4 py-3"
            disabled
          />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          展示名
          <input
            className="rounded-xl border border-[var(--ds-border)] bg-white px-4 py-3"
            disabled
          />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          密码
          <input
            className="rounded-xl border border-[var(--ds-border)] bg-white px-4 py-3"
            disabled
            type="password"
          />
        </label>
        <button className="ds-button" disabled type="button">
          M1 启用
        </button>
      </form>
      <p className="ds-muted mt-5 text-sm">
        已有账号？{' '}
        <Link className="font-bold text-[var(--ds-brand)]" href="/auth/login">
          登录
        </Link>
      </p>
    </AuthLayout>
  );
}
