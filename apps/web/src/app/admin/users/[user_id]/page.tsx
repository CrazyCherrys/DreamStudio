'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

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

function AdminUserDetailContent() {
  const params = useParams<{ user_id: string }>();
  const { csrfToken } = useAuth();
  const [detail, setDetail] = useState<AdminUserDetail['item'] | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [newPassword, setNewPassword] = useState('');
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

  async function changeStatus(nextStatus: UserStatus) {
    if (!csrfToken || !detail) {
      setError('登录状态已失效，请重新登录');
      return;
    }
    const confirmed = window.confirm(
      nextStatus === 'active'
        ? `确认启用用户 ${detail.username}？`
        : nextStatus === 'disabled'
          ? `确认禁用用户 ${detail.username}？该用户现有会话会立即失效。`
          : `确认软删除用户 ${detail.username}？该用户现有会话会立即失效。`,
    );
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await updateAdminUserStatus(detail.id, nextStatus, csrfToken);
      setMessage(`用户状态已更新为 ${statusLabel(nextStatus)}。`);
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
      setMessage(`new-api 配置已保存，当前状态：${statusLabel(nextConfig.status)}。`);
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
    if (!window.confirm(`确认清空用户 ${detail.username} 的 new-api 密钥？`)) {
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
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-success)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-success)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
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
                onClick={() => void changeStatus('active')}
                type="button"
                variant="secondary"
              >
                启用
              </DsButton>
              <DsButton
                disabled={submitting || detail.status === 'disabled'}
                onClick={() => void changeStatus('disabled')}
                type="button"
                variant="danger"
              >
                禁用
              </DsButton>
              <DsButton
                disabled={submitting || detail.status === 'deleted'}
                onClick={() => void changeStatus('deleted')}
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
              <p className="mt-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-white/70 p-3 text-sm font-semibold text-[var(--ds-danger)]">
                {detail.new_api_config.last_test_error}
              </p>
            ) : null}
          </section>

          <section className="ds-card admin-panel p-6">
            <span className="ds-badge">Sessions</span>
            <h2 className="mt-4 text-2xl font-black">会话摘要</h2>
            <p className="ds-muted mt-2 text-sm">活跃会话：{detail.session_summary.active_count}</p>
            <div className="mt-4 grid gap-3">
              {detail.session_summary.recent.map((session) => (
                <div
                  className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-white/70 p-3 text-sm"
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
            <form className="mt-5 grid gap-4" onSubmit={resetPassword}>
              <DsInput
                label="新密码"
                minLength={8}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
              <DsButton disabled={submitting || !newPassword} type="submit" variant="danger">
                重置密码并撤销会话
              </DsButton>
            </form>
          </section>

          <section className="ds-card admin-panel p-6 xl:col-span-2">
            <span className="ds-badge">代理配置</span>
            <h2 className="mt-4 text-2xl font-black">代用户配置 new-api</h2>
            <form
              className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto_auto]"
              onSubmit={saveUserConfig}
            >
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
              <div className="grid items-end">
                <DsButton disabled={submitting} type="submit">
                  保存
                </DsButton>
              </div>
              <div className="grid items-end">
                <DsButton
                  disabled={submitting}
                  onClick={deleteUserConfig}
                  type="button"
                  variant="danger"
                >
                  清空密钥
                </DsButton>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
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
