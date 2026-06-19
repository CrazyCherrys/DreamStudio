import { AppLayout } from '@/components/layouts';

export default function StudioPage() {
  return (
    <AppLayout>
      <aside className="ds-card min-h-[calc(100vh-32px)] p-5">
        <span className="ds-badge">模型栏</span>
        <h1 className="mt-5 text-2xl font-black">图片模型</h1>
        <div className="mt-5 grid gap-3">
          {['推荐模型', '文生图', '参考图编辑'].map((item) => (
            <div
              className="rounded-2xl border border-[var(--ds-border)] bg-white/60 p-4"
              key={item}
            >
              <strong>{item}</strong>
              <p className="ds-muted mt-1 text-sm">M3 接入模型目录。</p>
            </div>
          ))}
        </div>
      </aside>

      <section className="ds-card min-h-[calc(100vh-32px)] p-5">
        <span className="ds-badge">创作栏</span>
        <h2 className="mt-5 text-2xl font-black">Prompt 与参数</h2>
        <div className="mt-5 min-h-40 rounded-2xl border border-dashed border-[var(--ds-border-strong)] bg-white/50 p-5">
          <p className="ds-muted">
            M5 前不提交真实任务；这里保留 PromptEditor、参考图和参数表单布局位置。
          </p>
        </div>
        <button className="ds-button mt-5" disabled>
          生成按钮将在 M5 启用
        </button>
      </section>

      <aside className="ds-card min-h-[calc(100vh-32px)] p-5">
        <span className="ds-badge">任务栏</span>
        <h2 className="mt-5 text-2xl font-black">最近任务</h2>
        <div className="mt-5 rounded-2xl border border-[var(--ds-border)] bg-white/60 p-4">
          <strong>image-generation</strong>
          <p className="ds-muted mt-1 text-sm">M0 队列已建立，业务消费逻辑将在 M5 实现。</p>
        </div>
      </aside>
    </AppLayout>
  );
}
