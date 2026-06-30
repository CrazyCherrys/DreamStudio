import { AdminPageHeading } from '@/components/admin-page-heading';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';

export default function AdminPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <section className="ds-card admin-panel p-5">
          <AdminPageHeading title="后台管理" />
          <p className="ds-muted mt-3 text-sm">使用左侧导航进入用户、系统、模型、存储和日志管理页面。</p>
        </section>
      </AdminLayout>
    </RouteGuard>
  );
}
