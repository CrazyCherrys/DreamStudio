'use client';

import Link from 'next/link';

import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';

export default function AdminModelCategoriesPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <section className="ds-card admin-panel p-6">
          <h2 className="text-2xl font-black">模型分类已改为固定类型</h2>
          <p className="ds-muted mt-3 max-w-2xl text-sm leading-6">
            DreamStudio 现在使用固定模型类型：聊天、图片、视频。管理员不再维护独立的模型分类，
            请在模型目录中为每个模型选择类型、配置图标、描述和端点能力。
          </p>
          <Link className="ds-button mt-6 w-fit" href="/admin/models">
            前往模型目录
          </Link>
        </section>
      </AdminLayout>
    </RouteGuard>
  );
}
