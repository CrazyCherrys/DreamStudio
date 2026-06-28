import Link from 'next/link';

import { AdminNavigation } from '@/components/admin-navigation';
import { ConsoleNavigation } from '@/components/console-navigation';

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main>
      <header className="ds-shell flex items-center justify-between py-6">
        <Link className="text-lg font-black tracking-tight" href="/">
          DreamStudio
        </Link>
        <nav className="flex items-center gap-3 text-sm font-semibold">
          <Link className="ds-muted hover:text-[var(--ds-text)]" href="/auth/login">
            登录
          </Link>
          <Link className="ds-button" href="/auth/register">
            开始使用
          </Link>
        </nav>
      </header>
      {children}
    </main>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="ds-shell grid min-h-screen items-center gap-10 py-10 lg:grid-cols-[1fr_420px]">
      <section className="hidden lg:block">
        <span className="ds-badge">连接你的 new-api 密钥</span>
        <h1 className="ds-display mt-5 max-w-2xl text-6xl font-black leading-[0.98]">
          把复杂的模型接口收进一个安静的创作工作室。
        </h1>
        <p className="ds-muted mt-6 max-w-xl text-lg leading-8">
          M0 只建立认证页面骨架，具体注册、登录、会话和 CSRF 将在 M1 实现。
        </p>
      </section>
      <section className="ds-card p-7">{children}</section>
    </main>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-4">
      <div className="mx-auto grid max-w-[1440px] gap-4 lg:grid-cols-[300px_minmax(520px,1fr)_380px]">
        {children}
      </div>
    </main>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="admin-shell min-h-screen lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="admin-sidebar min-w-0 border-b border-[var(--ds-border)] bg-[var(--ds-admin-sidebar)] px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 lg:grid lg:items-start">
          <div>
            <p className="ds-badge">Admin</p>
            <h1 className="mt-2 text-xl font-black">管理后台</h1>
            <p className="ds-muted mt-1 hidden text-xs font-semibold lg:block">
              系统配置与运维控制台
            </p>
          </div>
          <Link className="ds-button ds-button-secondary min-h-10 px-3 text-sm" href="/">
            返回首页
          </Link>
        </div>
        <div className="mt-4">
          <AdminNavigation />
        </div>
      </aside>

      <section className="admin-content grid min-w-0 content-start gap-5 px-4 py-5 lg:px-6 lg:py-6 xl:px-8">
        {children}
      </section>
    </main>
  );
}

export function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="admin-shell min-h-screen lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="admin-sidebar min-w-0 border-b border-[var(--ds-border)] bg-[var(--ds-admin-sidebar)] px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 lg:grid lg:items-start">
          <div>
            <p className="ds-badge">Console</p>
            <h1 className="mt-2 text-xl font-black">用户后台</h1>
            <p className="ds-muted mt-1 hidden text-xs font-semibold lg:block">
              账号、密钥、任务和作品管理
            </p>
          </div>
          <Link className="ds-button ds-button-secondary min-h-10 px-3 text-sm" href="/studio">
            返回创作台
          </Link>
        </div>
        <div className="mt-4">
          <ConsoleNavigation />
        </div>
      </aside>

      <section className="admin-content grid min-w-0 content-start gap-5 px-4 py-5 lg:px-6 lg:py-6 xl:px-8">
        {children}
      </section>
    </main>
  );
}
