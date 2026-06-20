import Link from 'next/link';

import { PublicLayout } from '@/components/layouts';

const apiBaseUrl = process.env.API_BASE_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;

async function getHealth() {
  try {
    const response = await fetch(`${apiBaseUrl}/healthz`, {
      cache: 'no-store',
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json(),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {
        message: error instanceof Error ? error.message : 'API health request failed',
      },
    };
  }
}

export default async function M0StatusPage() {
  const health = await getHealth();

  return (
    <PublicLayout>
      <section className="ds-shell pb-20 pt-10">
        <span className="ds-badge">M0 验证入口</span>
        <h1 className="ds-display mt-5 text-5xl font-black">基础进程与健康检查</h1>
        <p className="ds-muted mt-4 max-w-2xl leading-7">
          这个页面只展示 M0 运行状态，不实现认证、密钥配置或图片生成业务。
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="ds-card p-6">
            <h2 className="text-xl font-black">API /healthz</h2>
            <p className="ds-muted mt-2">目标 API：{apiBaseUrl}</p>
            <p
              className="mt-4 text-2xl font-black"
              style={{ color: health.ok ? '#059669' : '#e11d48' }}
            >
              {health.ok ? 'OK' : 'Unavailable'} · {health.status}
            </p>
            <pre className="mt-5 overflow-auto rounded-2xl bg-[var(--ds-surface-muted)] p-4 text-xs leading-6 text-[var(--ds-text)]">
              {JSON.stringify(health.body, null, 2)}
            </pre>
          </article>

          <article className="ds-card p-6">
            <h2 className="text-xl font-black">M0 模块</h2>
            <div className="mt-4 grid gap-3">
              {[
                'Next.js Web skeleton',
                'NestJS API skeleton',
                'NestJS Worker skeleton',
                'Prisma + PostgreSQL',
                'Redis + BullMQ',
              ].map((item) => (
                <div
                  className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-4"
                  key={item}
                >
                  <strong>{item}</strong>
                  <p className="ds-muted mt-1 text-sm">可运行骨架，不含提前扩展业务功能。</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <Link className="ds-button mt-8" href="/">
          返回首页
        </Link>
      </section>
    </PublicLayout>
  );
}
