'use client';

import { Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AdminLayout } from '@/components/layouts';
import { ExecutionProfileManager, ModelForm } from '@/components/model-catalog/model-components';
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
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAiModel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const enabledModelCount = useMemo(
    () => models.filter((model) => model.is_enabled).length,
    [models],
  );
  const missingProfileCount = useMemo(
    () => models.filter((model) => !model.default_execution_profile).length,
    [models],
  );

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

  function openNewModelDialog() {
    setEditingModel(null);
    setModelDialogOpen(true);
    setMessage(null);
    setError(null);
  }

  function openEditModelDialog(model: AdminAiModel) {
    setEditingModel(model);
    setModelDialogOpen(true);
    setMessage(null);
    setError(null);
  }

  function closeModelDialog() {
    if (submitting) {
      return;
    }
    setModelDialogOpen(false);
    setEditingModel(null);
    setError(null);
  }

  function openDeleteModelDialog(model: AdminAiModel) {
    setDeleteTarget(model);
    setMessage(null);
    setError(null);
  }

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
      setModelDialogOpen(false);
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
      setDeleteTarget(null);
      setMessage('模型已软删除。');
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '删除模型失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="ds-card admin-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="ds-badge">Catalog</span>
            <h2 className="mt-4 text-2xl font-black">模型目录</h2>
            <p className="ds-muted mt-2 max-w-3xl text-sm leading-6">
              管理已添加到 DreamStudio 的模型、参数 Schema 和执行配置。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DsButton className="gap-2" onClick={loadData} type="button" variant="secondary">
              <RefreshCw aria-hidden="true" size={16} />
              刷新
            </DsButton>
            <DsButton className="gap-2" onClick={openNewModelDialog} type="button">
              <Plus aria-hidden="true" size={16} />
              新增模型
            </DsButton>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm font-black md:grid-cols-3">
          <StatusSummary label="已添加模型" value={models.length} />
          <StatusSummary label="启用模型" value={enabledModelCount} />
          <StatusSummary label="缺默认 Profile" value={missingProfileCount} tone="warning" />
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
          {!loading && models.length === 0 ? (
            <div className="rounded-[var(--ds-radius-sm)] border border-dashed border-[var(--ds-border-strong)] bg-[var(--ds-surface-muted)] p-6">
              <h3 className="text-lg font-black">暂无模型</h3>
              <p className="ds-muted mt-2 text-sm leading-6">
                添加第一个模型后，Studio 才能展示对应的模型和快捷参数。
              </p>
              <DsButton className="mt-4 gap-2" onClick={openNewModelDialog} type="button">
                <Plus aria-hidden="true" size={16} />
                新增模型
              </DsButton>
            </div>
          ) : null}
          {models.map((model) => (
            <article
              className="grid gap-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-4 xl:grid-cols-[minmax(0,1fr)_auto]"
              key={model.id}
            >
              <div className="min-w-0">
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
                <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
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
                    <dd className="font-black">
                      {transferModeLabel(model.reference_transfer_mode)}
                    </dd>
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
              </div>
              <div className="flex flex-wrap gap-2 xl:grid xl:min-w-28 xl:content-start">
                <DsButton
                  className="gap-2"
                  onClick={() => openEditModelDialog(model)}
                  type="button"
                  variant="secondary"
                >
                  <Pencil aria-hidden="true" size={16} />
                  编辑
                </DsButton>
                <DsButton
                  className="gap-2"
                  onClick={() => openDeleteModelDialog(model)}
                  type="button"
                  variant="danger"
                >
                  <Trash2 aria-hidden="true" size={16} />
                  软删除
                </DsButton>
              </div>
            </article>
          ))}
        </div>
      </section>

      {modelDialogOpen ? (
        <ModelEditorDialog
          csrfToken={csrfToken}
          error={error}
          model={editingModel}
          onChanged={loadData}
          onClose={closeModelDialog}
          onSubmit={saveModel}
          submitting={submitting}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteModelDialog
          error={error}
          model={deleteTarget}
          onCancel={() => {
            if (!submitting) {
              setDeleteTarget(null);
              setError(null);
            }
          }}
          onConfirm={() => removeModel(deleteTarget)}
          submitting={submitting}
        />
      ) : null}
    </>
  );
}

function StatusSummary({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning';
}) {
  return (
    <div className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] px-4 py-3">
      <p className="ds-muted text-xs">{label}</p>
      <p
        className={
          tone === 'warning' && value > 0 ? 'mt-1 text-xl text-[var(--ds-danger)]' : 'mt-1 text-xl'
        }
      >
        {value}
      </p>
    </div>
  );
}

function ModelEditorDialog({
  csrfToken,
  error,
  model,
  onChanged,
  onClose,
  onSubmit,
  submitting,
}: {
  csrfToken: string | null;
  error: string | null;
  model: AdminAiModel | null;
  onChanged: () => Promise<void>;
  onClose: () => void;
  onSubmit: (payload: AiModelPayload) => Promise<void>;
  submitting: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  return (
    <div
      aria-labelledby="model-editor-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="ds-card mx-auto flex max-h-[calc(100vh-48px)] w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--ds-border)] p-5">
          <div>
            <span className="ds-badge">Models</span>
            <h2 className="mt-3 text-2xl font-black" id="model-editor-title">
              {model ? '编辑模型' : '新增模型'}
            </h2>
            <p className="ds-muted mt-2 text-sm leading-6">
              {model
                ? '维护模型基础信息、Studio 快捷参数、参数 Schema 和执行配置。'
                : '添加模型后，Studio 才能向用户展示并使用对应参数。'}
            </p>
          </div>
          <button
            aria-label="关闭模型编辑弹窗"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] text-[var(--ds-text)] transition hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-surface)]"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">
          {error ? (
            <p className="mb-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
              {error}
            </p>
          ) : null}
          <ModelForm
            csrfToken={csrfToken}
            initialModel={model}
            key={model?.id ?? 'new-model'}
            onSubmit={onSubmit}
            submitting={submitting}
          />
          {model ? (
            <div className="mt-6">
              <ExecutionProfileManager csrfToken={csrfToken} model={model} onChanged={onChanged} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DeleteModelDialog({
  error,
  model,
  onCancel,
  onConfirm,
  submitting,
}: {
  error: string | null;
  model: AdminAiModel;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, submitting]);

  return (
    <div
      aria-labelledby="delete-model-title"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onCancel();
        }
      }}
      role="dialog"
    >
      <div className="ds-card mx-auto mt-16 max-w-lg p-6">
        <span className="ds-badge">Delete</span>
        <h2 className="mt-4 text-2xl font-black" id="delete-model-title">
          软删除模型？
        </h2>
        <p className="ds-muted mt-3 text-sm leading-6">
          将软删除「{model.display_name}」，不会直接清理历史任务。删除后普通用户不会再看到该模型。
        </p>
        {error ? (
          <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <DsButton disabled={submitting} onClick={onCancel} type="button" variant="secondary">
            取消
          </DsButton>
          <DsButton
            className="gap-2"
            disabled={submitting}
            onClick={onConfirm}
            type="button"
            variant="danger"
          >
            <Trash2 aria-hidden="true" size={16} />
            {submitting ? '删除中...' : '确认删除'}
          </DsButton>
        </div>
      </div>
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
