'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AdminLayout } from '@/components/layouts';
import { ModelCategoryForm } from '@/components/model-catalog/model-components';
import { RouteGuard } from '@/components/route-guard';
import { DsButton } from '@/components/ui';
import { ApiClientError } from '@/lib/auth';
import {
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
  updateAdminCategory,
  type AdminModelCategory,
  type ModelCategoryPayload,
} from '@/lib/model-catalog';

function AdminModelCategoriesContent() {
  const { csrfToken } = useAuth();
  const [categories, setCategories] = useState<AdminModelCategory[]>([]);
  const [editingCategory, setEditingCategory] = useState<AdminModelCategory | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadCategories() {
    setLoading(true);
    setError(null);
    try {
      setCategories((await fetchAdminCategories()).items);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取模型分类失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  async function saveCategory(payload: ModelCategoryPayload) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      if (editingCategory) {
        await updateAdminCategory(editingCategory.id, payload, csrfToken);
        setMessage('模型分类已保存。');
      } else {
        await createAdminCategory(payload, csrfToken);
        setMessage('模型分类已创建。');
      }
      setEditingCategory(null);
      await loadCategories();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '保存模型分类失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeCategory(category: AdminModelCategory) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await deleteAdminCategory(category.id, csrfToken);
      setEditingCategory(null);
      setMessage('模型分类已软删除。');
      await loadCategories();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '删除模型分类失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[420px_1fr]">
      <section className="ds-card admin-panel p-6">
        <span className="ds-badge">Categories</span>
        <h2 className="mt-4 text-2xl font-black">{editingCategory ? '编辑分类' : '新增分类'}</h2>
        <div className="mt-5">
          <ModelCategoryForm
            initialCategory={editingCategory}
            key={editingCategory?.id ?? 'new-category'}
            onSubmit={saveCategory}
            submitting={submitting}
          />
        </div>
        {editingCategory ? (
          <DsButton
            className="mt-4"
            onClick={() => setEditingCategory(null)}
            type="button"
            variant="secondary"
          >
            新增分类
          </DsButton>
        ) : null}
      </section>

      <section className="ds-card admin-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="ds-badge">List</span>
            <h2 className="mt-4 text-2xl font-black">模型分类</h2>
          </div>
          <DsButton onClick={loadCategories} type="button" variant="secondary">
            刷新
          </DsButton>
        </div>

        {message ? (
          <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {loading ? <p className="ds-muted font-semibold">正在读取模型分类...</p> : null}
          {categories.map((category) => (
            <article
              className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 p-4"
              key={category.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{category.name}</h3>
                  <p className="ds-muted mt-1 text-sm">{category.slug}</p>
                </div>
                <span className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 px-3 py-1 text-sm font-black">
                  {category.is_enabled ? '启用' : '禁用'}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <DsButton
                  onClick={() => setEditingCategory(category)}
                  type="button"
                  variant="secondary"
                >
                  编辑
                </DsButton>
                <DsButton onClick={() => removeCategory(category)} type="button" variant="danger">
                  软删除
                </DsButton>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function AdminModelCategoriesPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <AdminModelCategoriesContent />
      </AdminLayout>
    </RouteGuard>
  );
}
