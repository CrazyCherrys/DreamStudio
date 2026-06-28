'use client';

import { Pencil, Plus, RefreshCw, Star, Trash2, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminConfirmDialog, AdminDialog } from '@/components/admin-dialog';
import { AdminPageHeading } from '@/components/admin-page-heading';
import { useAuth } from '@/components/auth-provider';
import { AdminLayout } from '@/components/layouts';
import { ExecutionProfileManager, ModelForm } from '@/components/model-catalog/model-components';
import { RouteGuard } from '@/components/route-guard';
import { DsButton, DsInput } from '@/components/ui';
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
  type ModelEndpointType,
  type ModelModality,
} from '@/lib/model-catalog';

type ModelEditorStep = 'basic' | 'execution' | 'release';

const ENDPOINT_FILTERS: Array<{ label: string; value: ModelEndpointType | '' }> = [
  { label: '全部端点', value: '' },
  { label: 'OpenAI Image', value: 'openai_image_generations' },
  { label: 'OpenAI Edit', value: 'openai_image_edits' },
  { label: 'OpenAI Responses', value: 'openai_responses_image' },
  { label: 'Gemini generateContent', value: 'gemini_generate_content' },
];

const MODALITY_FILTERS: Array<{ label: string; value: ModelModality | '' }> = [
  { label: '全部类型', value: '' },
  { label: '图片', value: 'image' },
  { label: '聊天', value: 'chat' },
  { label: '视频', value: 'video' },
];

function AdminModelsContent() {
  const { csrfToken } = useAuth();
  const [models, setModels] = useState<AdminAiModel[]>([]);
  const [editingModel, setEditingModel] = useState<AdminAiModel | null>(null);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [modelDialogStep, setModelDialogStep] = useState<ModelEditorStep>('basic');
  const [deleteTarget, setDeleteTarget] = useState<AdminAiModel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<{
    q: string;
    modality: ModelModality | '';
    endpoint_type: ModelEndpointType | '';
    enabled: '' | 'true' | 'false';
    recommended: '' | 'true' | 'false';
    missing_profile: '' | 'true';
  }>({
    q: '',
    modality: 'image',
    endpoint_type: '',
    enabled: '',
    recommended: '',
    missing_profile: '',
  });

  const enabledModelCount = useMemo(
    () => models.filter((model) => model.is_enabled).length,
    [models],
  );
  const missingProfileCount = useMemo(
    () => models.filter((model) => !model.management_summary.has_default_active_profile).length,
    [models],
  );
  const draftRevisionCount = useMemo(
    () => models.reduce((total, model) => total + model.management_summary.draft_revision_count, 0),
    [models],
  );

  async function loadData(nextFilters = filters) {
    setLoading(true);
    setError(null);
    try {
      const nextModels = await fetchAdminModels({
        ...(nextFilters.q.trim() ? { q: nextFilters.q.trim() } : {}),
        ...(nextFilters.modality ? { modality: nextFilters.modality } : {}),
        ...(nextFilters.endpoint_type ? { endpoint_type: nextFilters.endpoint_type } : {}),
        ...(nextFilters.enabled ? { enabled: nextFilters.enabled === 'true' } : {}),
        ...(nextFilters.recommended ? { recommended: nextFilters.recommended === 'true' } : {}),
        ...(nextFilters.missing_profile ? { missing_profile: true } : {}),
      });
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

  function patchFilters(
    patch: Partial<{
      q: string;
      modality: ModelModality | '';
      endpoint_type: ModelEndpointType | '';
      enabled: '' | 'true' | 'false';
      recommended: '' | 'true' | 'false';
      missing_profile: '' | 'true';
    }>,
  ) {
    setFilters((current) => ({
      ...current,
      ...patch,
    }));
  }

  function openNewModelDialog() {
    setEditingModel(null);
    setModelDialogStep('basic');
    setModelDialogOpen(true);
    setMessage(null);
    setError(null);
  }

  function openEditModelDialog(model: AdminAiModel) {
    setEditingModel(model);
    setModelDialogStep('basic');
    setModelDialogOpen(true);
    setMessage(null);
    setError(null);
  }

  function openConfigureModelDialog(model: AdminAiModel) {
    setEditingModel(model);
    setModelDialogStep('execution');
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

  async function saveModel(payload: AiModelPayload): Promise<AdminAiModel | null> {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return null;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      let saved: AdminAiModel;
      if (editingModel) {
        const result = await updateAdminModel(editingModel.id, payload, csrfToken);
        saved = result.item;
        setMessage('模型已保存。');
      } else {
        const result = await createAdminModel(payload, csrfToken);
        saved = result.item;
        setMessage('模型已创建，请继续配置执行配置。');
      }
      setEditingModel(saved);
      await loadData();
      return saved;
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '保存模型失败');
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function patchModel(model: AdminAiModel, patch: Partial<AiModelPayload>, success: string) {
    if (!csrfToken) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await updateAdminModel(model.id, patch, csrfToken);
      setMessage(success);
      setModels((current) => current.map((item) => (item.id === model.id ? result.item : item)));
      if (editingModel?.id === model.id) {
        setEditingModel(result.item);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '更新模型失败');
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
        <AdminPageHeading
          actions={
            <>
              <DsButton
                className="gap-2"
                disabled={loading}
                onClick={() => void loadData()}
                type="button"
                variant="secondary"
              >
                <RefreshCw aria-hidden="true" size={16} />
                刷新
              </DsButton>
              <DsButton className="gap-2" onClick={openNewModelDialog} type="button">
                <Plus aria-hidden="true" size={16} />
                新增模型
              </DsButton>
            </>
          }
          title="模型目录"
        />

        <div className="mt-5 grid gap-3 text-sm font-black md:grid-cols-4">
          <StatusSummary label="已添加模型" value={models.length} />
          <StatusSummary label="启用模型" value={enabledModelCount} />
          <StatusSummary label="缺默认 Profile" value={missingProfileCount} tone="warning" />
          <StatusSummary label="待发布 Draft" value={draftRevisionCount} tone="warning" />
        </div>

        <form
          className="mt-5 grid gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-4 md:grid-cols-[minmax(0,1.4fr)_180px_220px_160px_160px_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void loadData();
          }}
        >
          <DsInput
            label="搜索"
            onChange={(event) => patchFilters({ q: event.target.value })}
            placeholder="模型 ID / 展示名 / 厂商"
            value={filters.q}
          />
          <label className="grid gap-2 text-sm font-bold">
            <span>类型</span>
            <select
              className="ds-input"
              onChange={(event) =>
                patchFilters({ modality: event.target.value as ModelModality | '' })
              }
              value={filters.modality}
            >
              {MODALITY_FILTERS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            <span>端点标签</span>
            <select
              className="ds-input"
              onChange={(event) =>
                patchFilters({ endpoint_type: event.target.value as ModelEndpointType | '' })
              }
              value={filters.endpoint_type}
            >
              {ENDPOINT_FILTERS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            <span>启用状态</span>
            <select
              className="ds-input"
              onChange={(event) =>
                patchFilters({ enabled: event.target.value as '' | 'true' | 'false' })
              }
              value={filters.enabled}
            >
              <option value="">全部</option>
              <option value="true">仅启用</option>
              <option value="false">仅禁用</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            <span>推荐状态</span>
            <select
              className="ds-input"
              onChange={(event) =>
                patchFilters({ recommended: event.target.value as '' | 'true' | 'false' })
              }
              value={filters.recommended}
            >
              <option value="">全部</option>
              <option value="true">仅推荐</option>
              <option value="false">仅非推荐</option>
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-black">
            <input
              checked={filters.missing_profile === 'true'}
              onChange={(event) =>
                patchFilters({ missing_profile: event.target.checked ? 'true' : '' })
              }
              type="checkbox"
            />
            只看缺 Profile
          </label>
          <DsButton type="submit">查询</DsButton>
        </form>

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
              <h3 className="text-lg font-black">暂无匹配模型</h3>
              <p className="ds-muted mt-2 text-sm leading-6">
                可以直接创建模型，或者调整筛选条件查看已存在记录。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <DsButton className="gap-2" onClick={openNewModelDialog} type="button">
                  <Plus aria-hidden="true" size={16} />
                  新增模型
                </DsButton>
                <DsButton
                  onClick={() =>
                    setFilters({
                      q: '',
                      modality: 'image',
                      endpoint_type: '',
                      enabled: '',
                      recommended: '',
                      missing_profile: '',
                    })
                  }
                  type="button"
                  variant="secondary"
                >
                  重置筛选
                </DsButton>
              </div>
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
                    <StatusChip tone={model.is_enabled ? 'neutral' : 'warning'}>
                      {model.is_enabled ? '启用' : '禁用'}
                    </StatusChip>
                    {model.is_recommended ? <StatusChip tone="success">推荐</StatusChip> : null}
                    <StatusChip
                      tone={
                        model.management_summary.has_default_active_profile ? 'success' : 'danger'
                      }
                    >
                      {model.management_summary.has_default_active_profile
                        ? 'Profile 可用'
                        : '缺默认 Profile'}
                    </StatusChip>
                    {model.management_summary.draft_revision_count > 0 ? (
                      <StatusChip tone="warning">
                        {model.management_summary.draft_revision_count} 个 Draft
                      </StatusChip>
                    ) : null}
                  </div>
                </div>
                <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <Info label="类型" value={modalityLabel(model.modality)} />
                  <Info
                    label="端点标签"
                    value={model.endpoint_types.map(endpointTypeLabel).join(' / ') || '无'}
                  />
                  <Info label="参考图" value={transferModeLabel(model.reference_transfer_mode)} />
                  <Info label="Profile 数" value={String(model.management_summary.profile_count)} />
                  <Info
                    label="默认执行 Profile"
                    value={
                      model.default_execution_profile
                        ? `${model.default_execution_profile.adapter_key} / ${model.default_execution_profile.operation}`
                        : '未配置 active revision'
                    }
                  />
                  <Info
                    label="快捷参数来源"
                    value={
                      model.default_execution_profile
                        ? `${model.default_execution_profile.parameter_schema.length} 个 profile 字段`
                        : `${model.parameter_schema.length} 个模型回退字段`
                    }
                  />
                  <Info
                    label="待处理 Draft"
                    value={
                      model.management_summary.draft_revision_count > 0
                        ? `${model.management_summary.draft_revision_count} 个待发布`
                        : '无'
                    }
                  />
                  <Info
                    label="活跃 Revision"
                    value={String(model.management_summary.active_revision_count)}
                  />
                </dl>
              </div>
              <div className="flex flex-wrap gap-2 xl:grid xl:min-w-40 xl:content-start">
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
                  onClick={() => openConfigureModelDialog(model)}
                  type="button"
                  variant="secondary"
                >
                  <Wrench aria-hidden="true" size={16} />
                  {model.management_summary.has_default_active_profile ? '继续配置' : '补执行配置'}
                </DsButton>
                <DsButton
                  className="gap-2"
                  disabled={submitting}
                  onClick={() =>
                    void patchModel(
                      model,
                      { is_enabled: !model.is_enabled },
                      model.is_enabled ? '模型已禁用。' : '模型已启用。',
                    )
                  }
                  type="button"
                  variant="secondary"
                >
                  {model.is_enabled ? '禁用' : '启用'}
                </DsButton>
                <DsButton
                  className="gap-2"
                  disabled={submitting}
                  onClick={() =>
                    void patchModel(
                      model,
                      { is_recommended: !model.is_recommended },
                      model.is_recommended ? '已取消推荐。' : '已设为推荐。',
                    )
                  }
                  type="button"
                  variant="secondary"
                >
                  <Star aria-hidden="true" size={16} />
                  {model.is_recommended ? '取消推荐' : '设为推荐'}
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
          initialStep={modelDialogStep}
          model={editingModel}
          onChanged={async () => {
            await loadData();
            if (editingModel) {
              const refreshed = await fetchAdminModels({ q: editingModel.model_id });
              const matched = refreshed.items.find((item) => item.id === editingModel.id) ?? null;
              if (matched) {
                setEditingModel(matched);
              }
            }
          }}
          onClose={closeModelDialog}
          onSubmit={saveModel}
          submitting={submitting}
        />
      ) : null}

      {deleteTarget ? (
        <AdminConfirmDialog
          confirmLabel={submitting ? '删除中...' : '确认删除'}
          description={`将软删除「${deleteTarget.display_name}」，不会直接清理历史任务。删除后普通用户不会再看到该模型。`}
          disabled={submitting}
          error={error}
          onCancel={() => {
            if (!submitting) {
              setDeleteTarget(null);
              setError(null);
            }
          }}
          onConfirm={() => void removeModel(deleteTarget)}
          title="软删除模型？"
          variant="danger"
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

function StatusChip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-[var(--ds-success)]/30 text-[var(--ds-success)]'
      : tone === 'warning'
        ? 'border-[var(--ds-warning)]/30 text-[var(--ds-warning)]'
        : tone === 'danger'
          ? 'border-[var(--ds-danger)]/30 text-[var(--ds-danger)]'
          : 'border-[var(--ds-border)]';

  return (
    <span
      className={`rounded-[var(--ds-radius-sm)] border bg-[var(--ds-surface-raised)] px-2 py-1 ${toneClass}`}
    >
      {children}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="ds-muted font-semibold">{label}</dt>
      <dd className="font-black">{value}</dd>
    </div>
  );
}

function ModelEditorDialog({
  csrfToken,
  error,
  model,
  initialStep = 'basic',
  onChanged,
  onClose,
  onSubmit,
  submitting,
}: {
  csrfToken: string | null;
  error: string | null;
  initialStep?: ModelEditorStep;
  model: AdminAiModel | null;
  onChanged: () => Promise<void>;
  onClose: () => void;
  onSubmit: (payload: AiModelPayload) => Promise<AdminAiModel | null>;
  submitting: boolean;
}) {
  const [activeStep, setActiveStep] = useState<ModelEditorStep>(initialStep);

  useEffect(() => {
    setActiveStep(model ? initialStep : 'basic');
  }, [initialStep, model?.id]);

  return (
    <AdminDialog
      badge="Models"
      disabled={submitting}
      maxWidthClass="max-w-6xl"
      onClose={onClose}
      title={model ? `编辑模型：${model.display_name}` : '新增模型'}
      description={
        model
          ? '先确认模型基础信息，再在执行配置里建立默认 Profile 和 Draft，最后在发布检查里完成上线。'
          : '先创建模型基础信息，保存成功后会继续留在弹窗中配置执行配置。'
      }
    >
      {error ? (
        <p className="mb-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { key: 'basic', label: '1. 基础信息' },
          { key: 'execution', label: '2. 执行配置' },
          { key: 'release', label: '3. 发布检查' },
        ].map((step) => {
          const disabled = step.key !== 'basic' && !model;
          const active = activeStep === step.key;
          return (
            <button
              className={`rounded-[var(--ds-radius-sm)] border px-4 py-2 text-sm font-black ${
                active
                  ? 'border-[var(--ds-accent)] bg-[var(--ds-surface-raised)]'
                  : 'border-[var(--ds-border)] bg-[var(--ds-surface)]'
              } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              disabled={disabled}
              key={step.key}
              onClick={() => setActiveStep(step.key as ModelEditorStep)}
              type="button"
            >
              {step.label}
            </button>
          );
        })}
      </div>

      {activeStep === 'basic' ? (
        <ModelForm
          csrfToken={csrfToken}
          initialModel={model}
          onSubmit={async (payload) => {
            const saved = await onSubmit(payload);
            if (saved) {
              setActiveStep('execution');
            }
          }}
          submitting={submitting}
        />
      ) : null}

      {model && activeStep !== 'basic' ? (
        <ExecutionProfileManager
          csrfToken={csrfToken}
          mode={activeStep === 'release' ? 'release' : 'configure'}
          model={model}
          onChanged={onChanged}
        />
      ) : null}
    </AdminDialog>
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
