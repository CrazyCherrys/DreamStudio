import Link from 'next/link';

import { PublicLayout } from '@/components/layouts';
import { PublicPrimaryCta } from '@/components/public-auth-controls';

const flowSteps = ['注册登录', '配置 new-api 密钥', '选择图片模型', '异步生成', '保存资产'];

export default function HomePage() {
  return (
    <PublicLayout>
      <section className="ds-shell grid items-center gap-12 pb-20 pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:pt-20">
        <div className="ds-reveal">
          <span className="ds-badge">AI 图片创作 · M0 Foundation</span>
          <h1 className="ds-display mt-6 text-5xl font-black leading-[0.95] md:text-7xl">
            浏览器里的 AI 图片创作工作室。
          </h1>
          <p className="ds-muted mt-6 max-w-2xl text-lg leading-8">
            DreamStudio v1 聚焦 AI 图片生成：你提供自己的 new-api 密钥，DreamStudio
            负责更清晰的创作界面、异步任务、结果保存和资产管理。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PublicPrimaryCta />
            <Link className="ds-button ds-button-secondary" href="/m0/status">
              查看 M0 状态
            </Link>
          </div>
          <p className="ds-muted mt-5 text-sm">
            使用前需要准备可访问的 new-api 服务地址和 API 密钥；v1 不处理充值、支付或订阅。
          </p>
        </div>

        <div className="ds-card ds-reveal-delay ds-float p-4 md:p-6">
          <div className="rounded-[22px] border border-[var(--ds-border)] bg-[var(--ds-bg-soft)] p-4">
            <div className="grid grid-cols-3 gap-3">
              {['月光狐狸', '陶土花园', '风中灯塔', '纸艺飞船', '薄雾森林', '静物练习'].map(
                (title, index) => (
                  <div
                    className="aspect-[4/5] rounded-2xl border border-[var(--ds-border-strong)] bg-gradient-to-br from-[#10201d] via-[#0b332e] to-[#3a2b13] p-3 shadow-sm"
                    key={title}
                  >
                    <div className="h-full rounded-xl bg-[rgba(255,255,255,0.055)] p-2">
                      <div className="h-2 w-10 rounded-full bg-[var(--ds-brand)]/50" />
                      <div className="mt-auto pt-16 text-xs font-bold text-[var(--ds-text)]/70">
                        0{index + 1} · {title}
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4">
                <div className="flex items-center justify-between">
                  <strong>image-generation</strong>
                  <span className="text-sm text-[var(--ds-accent)]">running</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-[var(--ds-surface-muted)]">
                  <div className="h-2 w-2/3 rounded-full bg-[var(--ds-brand)]" />
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4">
                <strong>asset-cleanup</strong>
                <p className="ds-muted mt-1 text-sm">过期文件清理队列占位已建立。</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ds-shell grid gap-4 pb-20 md:grid-cols-5">
        {flowSteps.map((step, index) => (
          <div className="ds-card p-5" key={step}>
            <div className="text-sm font-black text-[var(--ds-brand)]">0{index + 1}</div>
            <h2 className="mt-4 font-black">{step}</h2>
          </div>
        ))}
      </section>
    </PublicLayout>
  );
}
