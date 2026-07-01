import Link from 'next/link';

import { PublicLayout } from '@/components/layouts';
import { PublicPrimaryCta, PublicSecondaryCta } from '@/components/public-auth-controls';

const previewCards = [
  { title: '月光狐狸', tone: 'from-[#10201d] via-[#0b332e] to-[#3a2b13]' },
  { title: '陶土花园', tone: 'from-[#1b1321] via-[#283850] to-[#73412f]' },
  { title: '风中灯塔', tone: 'from-[#111726] via-[#203d57] to-[#9d5133]' },
  { title: '纸艺飞船', tone: 'from-[#171018] via-[#274237] to-[#73502d]' },
  { title: '薄雾森林', tone: 'from-[#0d1817] via-[#173b34] to-[#556e3a]' },
  { title: '静物练习', tone: 'from-[#1b1510] via-[#3a2f1f] to-[#7f5038]' },
];

const quickFacts = [
  {
    title: '浏览器即开即用',
    description: '不需要额外安装第三方客户端，登录后即可进入工作台。',
  },
  {
    title: '任务在服务端持续执行',
    description: '页面关闭后任务仍由 Worker 继续处理，状态和结果会被保留。',
  },
  {
    title: '结果图自动进入资产库',
    description: '参考图、结果图和任务记录在同一套界面里管理和复用。',
  },
];

const capabilityCards = [
  {
    eyebrow: 'Prompt · 参数 · 参考图',
    title: '专注创作台',
    description: '把模型选择、提示词、参数覆写和参考图复用收进一套紧凑的图片工作台。',
  },
  {
    eyebrow: 'Queue · Retry · Status',
    title: '异步任务闭环',
    description: '提交后立即建立任务记录，前端可见状态变化，服务端负责执行、重试和结果回填。',
  },
  {
    eyebrow: 'Assets · History · Reuse',
    title: '结果与素材沉淀',
    description: '结果图和上传素材统一进入资产与任务链路，方便下载、管理和再次编辑。',
  },
  {
    eyebrow: 'Admin · Models · Logs',
    title: '管理员可配置',
    description: '模型目录、接入模板、存储、日志和审计保留在后台，不让普通用户承担运维复杂度。',
  },
];

const flowSteps = [
  {
    title: '注册登录',
    description: '创建 DreamStudio 账号，系统会恢复会话并识别你的下一步入口。',
  },
  {
    title: '连接 new-api',
    description: '填写服务地址和 API 密钥，系统优先做连接测试，再进入工作区。',
  },
  {
    title: '选择图片模型',
    description: '根据管理员已发布的模型和 execution profile 开始你的当前工作流。',
  },
  {
    title: '异步生成',
    description: '提交后由服务端持续执行，前端只负责展示过程、结果和失败提示。',
  },
  {
    title: '保存与复用',
    description: '结果图、参考图和任务记录统一保留，后续可以继续下载、整理和再编辑。',
  },
];

const operationsCards = [
  {
    title: '任务与资产管理',
    description:
      '同一套产品链路里保留任务历史、结果图和素材沉淀，不需要在多个工具之间来回切换。',
    items: ['任务状态可见', '结果图可下载与复用', '素材与结果统一管理'],
  },
  {
    title: '后台配置与排查',
    description:
      '管理员可以维护模型、执行配置、存储策略和日志排查入口，普通用户则保持专注创作。',
    items: ['模型与 profile 管理', '日志与审计查看', '存储与系统设置'],
  },
];

export default function HomePage() {
  return (
    <PublicLayout>
      <section className="ds-shell grid items-center gap-12 pb-20 pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:pb-24 lg:pt-18">
        <div className="ds-reveal">
          <span className="ds-badge">Browser-based AI Image Studio</span>
          <h1 className="ds-display mt-6 text-5xl font-black leading-[0.95] md:text-7xl">
            一站式 AI 图片创作工作室。
          </h1>
          <p className="ds-muted mt-6 max-w-2xl text-lg leading-8">
            在浏览器里完成模型选择、提示词编辑、异步任务执行和结果沉淀。你提供自己的
            new-api 密钥，DreamStudio 负责更清晰的创作界面、任务执行闭环和资产管理。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PublicPrimaryCta />
            <PublicSecondaryCta />
          </div>
          <p className="ds-muted mt-5 max-w-xl text-sm leading-6">
            无需安装第三方客户端。开始前只需准备可访问的 new-api 服务地址和 API 密钥；v1
            不处理充值、支付或订阅。
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {quickFacts.map((fact) => (
              <article className="ds-card ds-card-hover p-4" key={fact.title}>
                <h2 className="text-sm font-black">{fact.title}</h2>
                <p className="ds-muted mt-2 text-sm leading-6">{fact.description}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="ds-card ds-reveal-delay ds-float p-4 md:p-6">
          <div className="rounded-[22px] border border-[var(--ds-border)] bg-[var(--ds-bg-soft)] p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="ds-kicker">Workspace Preview</span>
                <h2 className="mt-3 text-2xl font-black">从提示词到结果图，都留在同一个工作区。</h2>
              </div>
              <div className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] px-4 py-2 text-xs font-black tracking-[0.14em] text-[var(--ds-text-muted)]">
                /studio
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="ds-mesh-panel ds-grid-trace rounded-[24px] border border-[var(--ds-border)] p-4">
                <div className="grid gap-4">
                  <div
                    className="rounded-[20px] border border-[var(--ds-border)] bg-[rgba(8,14,13,0.76)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black">提示词编辑</span>
                      <span className="rounded-full bg-[var(--ds-brand-soft)] px-3 py-1 text-xs font-bold text-[var(--ds-brand-hover)]">
                        latest batch
                      </span>
                    </div>
                    <div className="mt-4 rounded-[18px] border border-[var(--ds-border)] bg-[rgba(255,255,255,0.04)] p-4 text-sm leading-7 text-[var(--ds-text-muted)]">
                      电影感人像，保留自然皮肤质感和柔和侧光，背景使用低饱和工作室布景，输出适合继续精修的高质量照片。
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {['gpt-image-2', '1024 x 1024', '4 张', '参考图已挂载'].map((item) => (
                        <span
                          className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--ds-text-muted)]"
                          key={item}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-[var(--ds-border)] bg-[rgba(255,255,255,0.035)] p-4">
                    <span className="text-sm font-black">当前任务概览</span>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {[
                        ['任务状态', 'running'],
                        ['结果批次', 'latest'],
                        ['结果落点', 'assets'],
                      ].map(([label, value]) => (
                        <div
                          className="rounded-[16px] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] px-3 py-3"
                          key={label}
                        >
                          <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">
                            {label}
                          </div>
                          <div className="mt-2 text-sm font-black text-[var(--ds-text)]">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {previewCards.map((card, index) => (
                    <div
                      className={`aspect-[4/5] rounded-2xl border border-[var(--ds-border-strong)] bg-gradient-to-br ${card.tone} p-3 shadow-sm`}
                      key={card.title}
                    >
                      <div className="flex h-full flex-col rounded-xl bg-[rgba(255,255,255,0.055)] p-2">
                        <div className="h-2 w-10 rounded-full bg-[var(--ds-brand)]/50" />
                        <div className="mt-auto pt-16 text-xs font-bold text-[var(--ds-text)]/70">
                          0{index + 1} · {card.title}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    title: '任务追踪',
                    description: '状态变化、失败摘要和重试都围绕同一条任务记录展示。',
                  },
                  {
                    title: '资产沉淀',
                    description: '结果图自动回到资产与任务链路，后续可继续下载或复用。',
                  },
                  {
                    title: '后台配置',
                    description: '模型、模板、日志和存储由管理员集中维护。',
                  },
                ].map((panel) => (
                  <article
                    className="rounded-[20px] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4"
                    key={panel.title}
                  >
                    <h3 className="text-sm font-black">{panel.title}</h3>
                    <p className="ds-muted mt-2 text-sm leading-6">{panel.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ds-shell pb-8 pt-2">
        <div className="max-w-2xl">
          <span className="ds-kicker">Capability Overview</span>
          <h2 className="ds-display mt-4 text-4xl font-black leading-tight">
            不只是一个调用模型的表单，而是一套完整的图片创作工作流。
          </h2>
          <p className="ds-muted mt-4 text-base leading-7">
            DreamStudio 把前台创作体验、服务端任务执行、结果资产管理和后台配置能力拆成清晰的层次，让用户专注画面，而不是分散在多个工具里拼工作流。
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {capabilityCards.map((card) => (
            <article className="ds-card ds-card-hover p-5" key={card.title}>
              <span className="ds-kicker">{card.eyebrow}</span>
              <h3 className="mt-4 text-xl font-black">{card.title}</h3>
              <p className="ds-muted mt-3 text-sm leading-6">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ds-shell pb-8 pt-12" id="setup-flow">
        <div className="max-w-2xl">
          <span className="ds-kicker">Setup Flow</span>
          <h2 className="ds-display mt-4 text-4xl font-black leading-tight">
            从首次接入到反复生成，保持一条稳定、可恢复的主链路。
          </h2>
          <p className="ds-muted mt-4 text-base leading-7">
            公开首页负责解释产品与接入前提，登录后系统根据账号状态把你送到正确的下一步页面，而不是让你自己判断该去哪里。
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {flowSteps.map((step, index) => (
            <article className="ds-card ds-card-hover p-5" key={step.title}>
              <div className="text-sm font-black text-[var(--ds-brand)]">0{index + 1}</div>
              <h3 className="mt-4 text-lg font-black">{step.title}</h3>
              <p className="ds-muted mt-3 text-sm leading-6">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ds-shell grid gap-4 pb-8 pt-12 lg:grid-cols-2">
        {operationsCards.map((card) => (
          <article className="ds-card ds-card-hover p-6" key={card.title}>
            <span className="ds-kicker">{card.title}</span>
            <p className="ds-muted mt-4 max-w-xl text-sm leading-6">{card.description}</p>
            <div className="mt-5 grid gap-3">
              {card.items.map((item) => (
                <div
                  className="rounded-[18px] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] px-4 py-3 text-sm font-semibold text-[var(--ds-text)]"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="ds-shell pb-24 pt-12">
        <div className="ds-card overflow-hidden p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <span className="ds-kicker">Start Creating</span>
              <h2 className="ds-display mt-4 text-4xl font-black leading-tight">
                准备好自己的 new-api 密钥后，就可以把创作和管理都留在 DreamStudio。
              </h2>
              <p className="ds-muted mt-4 text-base leading-7">
                公开首页负责解释产品边界和入口，真正的生成、任务和资产管理留给登录后的工作区完成。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <PublicPrimaryCta />
              <PublicSecondaryCta />
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
