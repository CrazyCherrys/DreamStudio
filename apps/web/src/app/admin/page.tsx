import Link from 'next/link';

import { AdminLayout } from '@/components/layouts';

const entries = ['用户管理', '模型管理', '系统设置', '存储设置', '请求日志', '审计日志'];

export default function AdminPage() {
  return (
    <AdminLayout>
      <div className="grid gap-4 md:grid-cols-3">
        {entries.map((entry) => (
          <article className="ds-card p-5" key={entry}>
            <h2 className="text-lg font-black">{entry}</h2>
            <p className="ds-muted mt-2 text-sm">
              M0 仅建立后台导航骨架，业务接口按 M1-M6 顺序补齐。
            </p>
            <Link
              className="mt-4 inline-flex text-sm font-black text-[var(--ds-brand)]"
              href="/m0/status"
            >
              查看基础状态
            </Link>
          </article>
        ))}
      </div>
    </AdminLayout>
  );
}
