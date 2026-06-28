import Link from 'next/link';

import { AdminPageHeading } from '@/components/admin-page-heading';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import { ADMIN_NAV_ITEMS } from '@/lib/admin-navigation';

export default function AdminPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <section className="ds-card admin-panel p-5">
          <AdminPageHeading title="后台管理" />
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ADMIN_NAV_ITEMS.map((entry) => (
            <article className="ds-card admin-panel p-4" key={entry.href}>
              <h3 className="text-lg font-black">{entry.title}</h3>
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
