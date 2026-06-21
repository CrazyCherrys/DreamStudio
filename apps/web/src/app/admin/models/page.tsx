'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AdminLayout } from '@/components/layouts';
import { ModelForm } from '@/components/model-catalog/model-components';
import { RouteGuard } from '@/components/route-guard';
import { DsButton } from '@/components/ui';
import { ApiClientError } from '@/lib/auth';
import {
  createAdminModel,
  deleteAdminModel,
  endpointTypeLabel,
  fetchAdminModels,
  modalityLabel,
  transferModeLabel,
  updateAdminModel,
  type AdminAiModel,
  type AiModelPayload,
} from '@/lib/model-catalog';

function AdminModelsContent() {
  const { csrfToken } = useAuth();
  const [models, setModels] = useState<AdminAiModel[]>([]);
  const [editingModel, setEditingModel] = useState<AdminAiModel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const nextModels = await fetchAdminModels();
      setModels(nextModels.items);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取模型目录失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function saveModel(payload: AiModelPayload) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      if (editingModel) {
        await updateAdminModel(editingModel.id, payload, csrfToken);
        setMessage('模型已保存。');
      } else {
        await createAdminModel(payload, csrfToken);
        setMessage('模型已创建。');
      }
      setEditingModel(null);
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '保存模型失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeModel(model: AdminAiModel) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await deleteAdminModel(model.id, csrfToken);
      setEditingModel(null);
      setMessage('模型已软删除。');
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '删除模型失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[520px_1fr]">
      <section className="ds-card admin-panel p-6">
        <span className="ds-badge">Models</span>
        <h2 className="mt-4 text-2xl font-black">{editingModel ? '编辑模型' : '新增模型'}</h2>
        <div className="mt-5">
          <ModelForm
            csrfToken={csrfToken}
            initialModel={editingModel}
            key={editingModel?.id ?? 'new-model'}
            onSubmit={saveModel}
            submitting={submitting}
          />
        </div>
        {editingModel ? (
          <DsButton
            className="mt-4"
            onClick={() => setEditingModel(null)}
            type="button"
            variant="secondary"
          >
            新增模型
          </DsButton>
        ) : null}
      </section>

      <section className="ds-card admin-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="ds-badge">Catalog</span>
            <h2 className="mt-4 text-2xl font-black">模型目录</h2>
          </div>
          <DsButton onClick={loadData} type="button" variant="secondary">
            刷新
          </DsButton>
        </div>

        {message ? (
          <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {loading ? <p className="ds-muted font-semibold">正在读取模型目录...</p> : null}
          {models.map((model) => (
            <article
              className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4"
              key={model.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)] text-lg font-black">
                    {model.icon_url ? (
                      <img
                        alt={model.display_name}
                        className="h-full w-full object-cover"
                        src={model.icon_url}
                      />
                    ) : (
                      model.display_name.slice(0, 1)
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black">{model.display_name}</h3>
                    <p className="ds-muted mt-1 break-all text-sm">{model.model_id}</p>
                    {model.description ? (
                      <p className="ds-muted mt-2 line-clamp-2 text-sm leading-6">
                        {model.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] px-2 py-1">
                    {model.is_enabled ? '启用' : '禁用'}
                  </span>
                  {model.is_recommended ? (
                    <span className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-2 py-1 text-[var(--ds-success)]">
                      推荐
                    </span>
                  ) : null}
                  <span
                    className={`rounded-[var(--ds-radius-sm)] border bg-[var(--ds-surface-raised)] px-2 py-1 ${
                      model.default_execution_profile
                        ? 'border-[var(--ds-success)]/30 text-[var(--ds-success)]'
                        : 'border-[var(--ds-danger)]/30 text-[var(--ds-danger)]'
                    }`}
                  >
                    {model.default_execution_profile ? 'Profile 可用' : '缺默认 Profile'}
                  </span>
                </div>
              </div>
              <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <dt className="ds-muted font-semibold">类型</dt>
                  <dd className="font-black">{modalityLabel(model.modality)}</dd>
                </div>
                <div>
                  <dt className="ds-muted font-semibold">端点</dt>
                  <dd className="font-black">
                    {model.endpoint_types.map(endpointTypeLabel).join(' / ')}
                  </dd>
                </div>
                <div>
                  <dt className="ds-muted font-semibold">参考图</dt>
                  <dd className="font-black">{transferModeLabel(model.reference_transfer_mode)}</dd>
                </div>
                <div>
                  <dt className="ds-muted font-semibold">Schema 字段</dt>
                  <dd className="font-black">{model.parameter_schema.length}</dd>
                </div>
                <div>
                  <dt className="ds-muted font-semibold">默认执行 Profile</dt>
                  <dd className="font-black">
                    {model.default_execution_profile
                      ? `${model.default_execution_profile.adapter_key} / ${model.default_execution_profile.operation}`
                      : '未配置 active revision'}
                  </dd>
                </div>
                <div>
                  <dt className="ds-muted font-semibold">Profile Schema 字段</dt>
                  <dd className="font-black">
                    {model.default_execution_profile?.parameter_schema.length ?? 0}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <DsButton onClick={() => setEditingModel(model)} type="button" variant="secondary">
                  编辑
                </DsButton>
                <DsButton onClick={() => removeModel(model)} type="button" variant="danger">
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

export default function AdminModelsPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <AdminModelsContent />
      </AdminLayout>
    </RouteGuard>
  );
}
