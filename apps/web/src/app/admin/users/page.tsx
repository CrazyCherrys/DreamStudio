'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminDialog } from '@/components/admin-dialog';
import { AdminPageHeading } from '@/components/admin-page-heading';
import { AdminUserDetailPanel } from '@/components/admin-user-detail-panel';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import { DsButton } from '@/components/ui';
import { ApiClientError } from '@/lib/auth';
import {
  fetchAdminUsers,
  formatDateTime,
  statusLabel,
  type AdminUserListItem,
  type Pagination,
} from '@/lib/admin';

function AdminUsersContent() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadUsers(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: '20',
      });
      if (keyword.trim()) {
        params.set('keyword', keyword.trim());
      }
      if (status) {
        params.set('status', status);
      }
      const payload = await fetchAdminUsers(params);
      setUsers(payload.items);
      setPagination(payload.pagination);
      setPage(payload.pagination.page);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取用户列表失败');
    } finally {
      setLoading(false);
    }
  }

  function openUserDialog(user: AdminUserListItem) {
    setSelectedUser(user);
    setError(null);
  }

  function closeUserDialog() {
    setSelectedUser(null);
  }

  useEffect(() => {
    void loadUsers(1);
  }, []);

  return (
    <>
      <section className="ds-card admin-panel p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <AdminPageHeading title="用户管理" />
          <form
            className="grid gap-2 md:grid-cols-[220px_150px_auto_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void loadUsers(1);
            }}
          >
            <input
              className="ds-input"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="用户名或展示名"
              value={keyword}
            />
            <select
              className="ds-input"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
              <option value="deleted">已删除</option>
            </select>
            <DsButton type="submit">查询</DsButton>
            <DsButton
              className="gap-2"
              disabled={loading}
              onClick={() => void loadUsers(page)}
              type="button"
              variant="secondary"
            >
              <RefreshCw aria-hidden="true" size={16} />
              刷新
            </DsButton>
          </form>
        </div>

        {error ? (
          <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
            {error}
          </p>
        ) : null}

        <div className="admin-table-scroll mt-5">
          <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--ds-text-muted)]">
                <th className="px-3 py-2">用户</th>
                <th className="px-3 py-2">角色</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">new-api</th>
                <th className="px-3 py-2">会话</th>
                <th className="px-3 py-2">最近登录</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-5 font-semibold text-[var(--ds-text-muted)]" colSpan={7}>
                    正在读取用户...
                  </td>
                </tr>
              ) : null}
              {!loading && users.length === 0 ? (
                <tr>
                  <td className="px-3 py-5 font-semibold text-[var(--ds-text-muted)]" colSpan={7}>
                    暂无匹配用户。
                  </td>
                </tr>
              ) : null}
              {users.map((user) => (
                <tr className="bg-[var(--ds-surface-raised)]" key={user.id}>
                  <td className="rounded-l-[var(--ds-radius-sm)] px-3 py-3">
                    <strong>{user.username}</strong>
                    <p className="ds-muted mt-1">{user.display_name ?? '无展示名'}</p>
                  </td>
                  <td className="px-3 py-3 font-semibold">{user.role}</td>
                  <td className="px-3 py-3 font-semibold">{statusLabel(user.status)}</td>
                  <td className="px-3 py-3">
                    <span className="font-semibold">{statusLabel(user.new_api_config_status)}</span>
                    <p className="ds-muted mt-1">{user.masked_api_key ?? '未配置密钥'}</p>
                  </td>
                  <td className="px-3 py-3 font-semibold">{user.active_session_count}</td>
                  <td className="px-3 py-3">{formatDateTime(user.last_login_at)}</td>
                  <td className="rounded-r-[var(--ds-radius-sm)] px-3 py-3">
                    <DsButton
                      className="min-h-9 px-3 text-sm"
                      onClick={() => openUserDialog(user)}
                      type="button"
                      variant="secondary"
                    >
                      详情/管理
                    </DsButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="ds-muted text-sm font-semibold">
            共 {pagination?.total ?? 0} 个用户，第 {pagination?.page ?? page} /{' '}
            {pagination?.total_pages ?? 1} 页
          </p>
          <div className="flex gap-2">
            <DsButton
              disabled={loading || page <= 1}
              onClick={() => void loadUsers(page - 1)}
              type="button"
              variant="secondary"
            >
              上一页
            </DsButton>
            <DsButton
              disabled={loading || page >= (pagination?.total_pages ?? 1)}
              onClick={() => void loadUsers(page + 1)}
              type="button"
              variant="secondary"
            >
              下一页
            </DsButton>
          </div>
        </div>
      </section>

      {selectedUser ? (
        <AdminDialog
          maxWidthClass="max-w-6xl"
          onClose={closeUserDialog}
          title={`管理用户：${selectedUser.username}`}
        >
          <AdminUserDetailPanel onChanged={() => loadUsers(page)} userId={selectedUser.id} />
        </AdminDialog>
      ) : null}
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <AdminUsersContent />
      </AdminLayout>
    </RouteGuard>
  );
}
