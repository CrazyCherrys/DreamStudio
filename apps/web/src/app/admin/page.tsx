import Link from 'next/link';

import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import { ADMIN_NAV_ITEMS } from '@/lib/admin-navigation';

export default function AdminPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <section className="ds-card admin-panel p-5">
          <span className="ds-badge">Admin</span>
          <h2 className="mt-4 text-2xl font-black">后台管理</h2>
          <p className="ds-muted mt-2">选择左侧模块进入对应的配置、目录、日志和用户管理。</p>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ADMIN_NAV_ITEMS.map((entry) => (
            <article className="ds-card admin-panel p-4" key={entry.href}>
              <h3 className="text-lg font-black">{entry.title}</h3>
              <p className="ds-muted mt-2 text-sm">{entry.description}</p>
              <Link
                className="mt-4 inline-flex text-sm font-black text-[var(--ds-brand)]"
                href={entry.href}
              >
                打开
              </Link>
            </article>
          ))}
        </div>
      </AdminLayout>
    </RouteGuard>
  );
}
