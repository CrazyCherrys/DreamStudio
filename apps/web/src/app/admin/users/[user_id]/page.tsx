'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { AdminUserDetailPanel } from '@/components/admin-user-detail-panel';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';

function AdminUserDetailContent() {
  const params = useParams<{ user_id: string }>();

  return (
    <section className="ds-card admin-panel p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <span className="ds-badge">Users</span>
          <h2 className="mt-4 text-2xl font-black">用户详情</h2>
          <p className="ds-muted mt-2 text-sm leading-6">
            这是兼容直达页面；后台用户列表的主流程会在当前页弹窗中完成管理。
          </p>
        </div>
        <Link className="ds-button ds-button-secondary" href="/admin/users">
          返回用户列表
        </Link>
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
