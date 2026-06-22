'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AdminConfirmDialog, AdminDialog } from '@/components/admin-dialog';
import { useAuth } from '@/components/auth-provider';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import { DsButton, DsInput } from '@/components/ui';
import { ApiClientError, apiRequest, type UserStatus } from '@/lib/auth';
import {
  fetchAdminUser,
  formatDateTime,
  resetAdminUserPassword,
  statusLabel,
  updateAdminUserStatus,
  type AdminUserDetail,
} from '@/lib/admin';
import { type PublicNewApiConfig } from '@/lib/new-api-config';

type UserDialogState =
  | { kind: 'status'; nextStatus: UserStatus }
  | { kind: 'reset-password' }
  | { kind: 'new-api-config' }
  | { kind: 'clear-new-api-config' }
  | null;

function AdminUserDetailContent() {
  const params = useParams<{ user_id: string }>();
  const { csrfToken } = useAuth();
  const [detail, setDetail] = useState<AdminUserDetail['item'] | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [dialog, setDialog] = useState<UserDialogState>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadUser() {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchAdminUser(params.user_id);
      setDetail(payload.item);
      setBaseUrl('');
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取用户详情失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUser();
  }, [params.user_id]);

  function closeDialog() {
    if (submitting) {
      return;
    }
    setDialog(null);
    setApiKey('');
    setBaseUrl('');
    setNewPassword('');
    setError(null);
  }

  async function changeStatus(nextStatus: UserStatus) {
    if (!csrfToken || !detail) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await updateAdminUserStatus(detail.id, nextStatus, csrfToken);
      setMessage(`用户状态已更新为 ${statusLabel(nextStatus)}。`);
      setDialog(null);
      await loadUser();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '更新用户状态失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || !detail) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    const confirmed = window.confirm(
      `确认重置用户 ${detail.username} 的密码？该用户现有会话会立即失效。`,
    );
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await resetAdminUserPassword(detail.id, newPassword, csrfToken);
      setNewPassword('');
      setMessage('密码已重置，旧会话已撤销。');
      setDialog(null);
      await loadUser();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '重置密码失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveUserConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || !detail) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const nextConfig = await apiRequest<PublicNewApiConfig>(
        `/api/v1/admin/users/${detail.id}/new-api-config`,
        {
          method: 'PUT',
          csrfToken,
          body: JSON.stringify({
            api_key: apiKey.trim(),
            ...(baseUrl.trim() ? { new_api_base_url: baseUrl.trim() } : {}),
            test_before_save: true,
          }),
        },
      );
      setApiKey('');
      setBaseUrl('');
      setMessage(`new-api 配置已保存，当前状态：${statusLabel(nextConfig.status)}。`);
      setDialog(null);
      await loadUser();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '保存用户配置失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteUserConfig() {
    if (!csrfToken || !detail) {
      setError('登录状态已失效，请重新登录');
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await apiRequest(`/api/v1/admin/users/${detail.id}/new-api-config`, {
        method: 'DELETE',
        csrfToken,
      });
      setMessage('new-api 配置已清空。');
      setDialog(null);
      await loadUser();
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '清空用户配置失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link className="text-sm font-black text-[var(--ds-brand)]" href="/admin/users">
          返回用户列表
        </Link>
        <DsButton disabled={loading} onClick={loadUser} type="button" variant="secondary">
          刷新
        </DsButton>
      </div>

      {loading ? <p className="ds-muted font-semibold">正在读取用户详情...</p> : null}
      {message ? (
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}

      {detail ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[1fr_420px]">
          <section className="ds-card admin-panel p-6">
            <span className="ds-badge">User</span>
            <h2 className="mt-4 break-all text-2xl font-black">{detail.username}</h2>
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              <Info label="展示名" value={detail.display_name ?? '无'} />
              <Info label="角色" value={detail.role} />
              <Info label="状态" value={statusLabel(detail.status)} />
              <Info label="最近登录" value={formatDateTime(detail.last_login_at)} />
              <Info label="创建时间" value={formatDateTime(detail.created_at)} />
              <Info label="更新时间" value={formatDateTime(detail.updated_at)} />
              <Info label="图片任务" value={String(detail.activity_summary.image_task_count)} />
              <Info label="请求日志" value={String(detail.activity_summary.request_log_count)} />
            </dl>

            <div className="mt-6 flex flex-wrap gap-3">
              <DsButton
                disabled={submitting || detail.status === 'active'}
                onClick={() => {
                  setMessage(null);
                  setError(null);
                  setDialog({ kind: 'status', nextStatus: 'active' });
                }}
                type="button"
                variant="secondary"
              >
                启用
              </DsButton>
              <DsButton
                disabled={submitting || detail.status === 'disabled'}
                onClick={() => {
                  setMessage(null);
                  setError(null);
                  setDialog({ kind: 'status', nextStatus: 'disabled' });
                }}
                type="button"
                variant="danger"
              >
                禁用
              </DsButton>
              <DsButton
                disabled={submitting || detail.status === 'deleted'}
                onClick={() => {
                  setMessage(null);
                  setError(null);
                  setDialog({ kind: 'status', nextStatus: 'deleted' });
                }}
                type="button"
                variant="danger"
              >
                软删除
              </DsButton>
            </div>
          </section>

          <section className="ds-card admin-panel p-6">
            <span className="ds-badge">new-api</span>
            <h2 className="mt-4 text-2xl font-black">配置状态</h2>
            <dl className="mt-5 grid gap-3 text-sm">
              <Info label="状态" value={statusLabel(detail.new_api_config.status)} />
              <Info label="密钥" value={detail.new_api_config.masked_api_key ?? '未配置'} />
              <Info label="Base URL Host" value={detail.new_api_config.base_url_host ?? '未配置'} />
              <Info label="最近测试" value={formatDateTime(detail.new_api_config.last_tested_at)} />
            </dl>
            {detail.new_api_config.last_test_error ? (
              <p className="mt-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] p-3 text-sm font-semibold text-[var(--ds-danger)]">
                {detail.new_api_config.last_test_error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <DsButton
                disabled={submitting}
                onClick={() => {
                  setMessage(null);
                  setError(null);
                  setDialog({ kind: 'new-api-config' });
                }}
                type="button"
              >
                代配置 new-api
              </DsButton>
              <DsButton
                disabled={submitting || detail.new_api_config.status === 'missing'}
                onClick={() => {
                  setMessage(null);
                  setError(null);
                  setDialog({ kind: 'clear-new-api-config' });
                }}
                type="button"
                variant="danger"
              >
                清空密钥
              </DsButton>
            </div>
          </section>

          <section className="ds-card admin-panel p-6">
            <span className="ds-badge">Sessions</span>
            <h2 className="mt-4 text-2xl font-black">会话摘要</h2>
            <p className="ds-muted mt-2 text-sm">活跃会话：{detail.session_summary.active_count}</p>
            <div className="mt-4 grid gap-3">
              {detail.session_summary.recent.map((session) => (
                <div
                  className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-3 text-sm"
                  key={session.id}
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <strong>{session.revoked_at ? '已撤销' : '有效或未过期'}</strong>
                    <span>{formatDateTime(session.created_at)}</span>
                  </div>
                  <p className="ds-muted mt-1">
                    {session.ip_address ?? '无 IP'} ·{' '}
                    {session.user_agent_summary ?? '无 User-Agent'}
                  </p>
                </div>
              ))}
              {detail.session_summary.recent.length === 0 ? (
                <p className="ds-muted text-sm">暂无会话记录。</p>
              ) : null}
            </div>
          </section>

          <section className="ds-card admin-panel p-6">
            <span className="ds-badge">Password</span>
            <h2 className="mt-4 text-2xl font-black">重置密码</h2>
            <p className="ds-muted mt-2 text-sm leading-6">重置后该用户现有会话会立即失效。</p>
            <DsButton
              className="mt-5"
              disabled={submitting}
              onClick={() => {
                setMessage(null);
                setError(null);
                setDialog({ kind: 'reset-password' });
              }}
              type="button"
              variant="danger"
            >
              重置密码
            </DsButton>
          </section>
        </div>
      ) : null}

      {detail && dialog?.kind === 'status' ? (
        <AdminConfirmDialog
          confirmLabel={submitting ? '提交中...' : `确认${statusLabel(dialog.nextStatus)}`}
          description={statusDialogDescription(detail.username, dialog.nextStatus)}
          disabled={submitting}
          error={error}
          onCancel={closeDialog}
          onConfirm={() => void changeStatus(dialog.nextStatus)}
          title={`${statusLabel(dialog.nextStatus)}用户？`}
          variant={dialog.nextStatus === 'active' ? 'primary' : 'danger'}
        />
      ) : null}

      {detail && dialog?.kind === 'reset-password' ? (
        <AdminDialog
          badge="Password"
          disabled={submitting}
          maxWidthClass="max-w-lg"
          onClose={closeDialog}
          title="重置密码"
        >
          <form className="grid gap-4" onSubmit={resetPassword}>
            <p className="ds-muted text-sm leading-6">
              为用户「{detail.username}」设置新密码。提交后该用户现有会话会立即失效。
            </p>
            <DsInput
              label="新密码"
              minLength={8}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
            {error ? (
              <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-3">
              <DsButton
                disabled={submitting}
                onClick={closeDialog}
                type="button"
                variant="secondary"
              >
                取消
              </DsButton>
              <DsButton disabled={submitting || !newPassword} type="submit" variant="danger">
                {submitting ? '重置中...' : '重置密码并撤销会话'}
              </DsButton>
            </div>
          </form>
        </AdminDialog>
      ) : null}

      {detail && dialog?.kind === 'new-api-config' ? (
        <AdminDialog
          badge="new-api"
          disabled={submitting}
          maxWidthClass="max-w-2xl"
          onClose={closeDialog}
          title="代用户配置 new-api"
        >
          <form className="grid gap-4" onSubmit={saveUserConfig}>
            <p className="ds-muted text-sm leading-6">
              为用户「{detail.username}」保存 new-api 密钥。保存前会执行连接测试。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <DsInput
                label="API Key"
                onChange={(event) => setApiKey(event.target.value)}
                required
                type="password"
                value={apiKey}
              />
              <DsInput
                label="Base URL"
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="留空使用系统默认地址"
                value={baseUrl}
              />
            </div>
            {error ? (
              <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-3">
              <DsButton
                disabled={submitting}
                onClick={closeDialog}
                type="button"
                variant="secondary"
              >
                取消
              </DsButton>
              <DsButton disabled={submitting || !apiKey.trim()} type="submit">
                {submitting ? '保存中...' : '保存并测试'}
              </DsButton>
            </div>
          </form>
        </AdminDialog>
      ) : null}

      {detail && dialog?.kind === 'clear-new-api-config' ? (
        <AdminConfirmDialog
          confirmLabel={submitting ? '清空中...' : '确认清空'}
          description={`确认清空用户「${detail.username}」的 new-api 密钥？清空后该用户将无法继续使用自己的已保存配置。`}
          disabled={submitting}
          error={error}
          onCancel={closeDialog}
          onConfirm={() => void deleteUserConfig()}
          title="清空 new-api 密钥？"
        />
      ) : null}
    </div>
  );
}

function statusDialogDescription(username: string, nextStatus: UserStatus) {
  if (nextStatus === 'active') {
    return `确认启用用户「${username}」？启用后该用户可以重新登录和使用服务。`;
  }

  if (nextStatus === 'disabled') {
    return `确认禁用用户「${username}」？该用户现有会话会立即失效。`;
  }

  return `确认软删除用户「${username}」？该用户现有会话会立即失效，且不会再作为正常用户显示。`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="ds-muted text-sm font-semibold">{label}</dt>
      <dd className="mt-1 break-words font-black">{value}</dd>
    </div>
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
