'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { AdminPageHeading } from '@/components/admin-page-heading';
import { AdminUserDetailPanel } from '@/components/admin-user-detail-panel';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';

function AdminUserDetailContent() {
  const params = useParams<{ user_id: string }>();

  return (
    <section className="ds-card admin-panel p-6">
      <div className="mb-5">
        <AdminPageHeading
          actions={
            <Link className="ds-button ds-button-secondary" href="/admin/users">
              返回用户列表
            </Link>
          }
          title="用户详情"
        />
      </div>
      <AdminUserDetailPanel userId={params.user_id} />
    </section>
  );
}

export default function AdminUserDetailPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <AdminUserDetailContent />
      </AdminLayout>
    </RouteGuard>
  );
}
