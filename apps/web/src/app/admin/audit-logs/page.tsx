'use client';

import { useEffect, useState } from 'react';

import { AdminPageHeading } from '@/components/admin-page-heading';
import { AdminLayout } from '@/components/layouts';
import { RouteGuard } from '@/components/route-guard';
import { DsButton } from '@/components/ui';
import { ApiClientError } from '@/lib/auth';
import {
  auditActionLabel,
  fetchAuditLogs,
  formatDateTime,
  stringifyPreview,
  targetTypeLabel,
  type AuditLogListItem,
  type Pagination,
} from '@/lib/admin';

function AdminAuditLogsContent() {
  const [actorUserId, setActorUserId] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [result, setResult] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<AuditLogListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadLogs(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: '20',
      });
      if (actorUserId.trim()) params.set('actor_user_id', actorUserId.trim());
      if (action.trim()) params.set('action', action.trim());
      if (targetType.trim()) params.set('target_type', targetType.trim());
      if (result) params.set('result', result);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const payload = await fetchAuditLogs(params);
      setLogs(payload.items);
      setPagination(payload.pagination);
      setPage(payload.pagination.page);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : '读取审计日志失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(1);
  }, []);

  return (
    <section className="ds-card admin-panel p-6">
      <AdminPageHeading title="审计日志" />

      <form
        className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          void loadLogs(1);
        }}
      >
        <input
          className="ds-input"
          onChange={(event) => setActorUserId(event.target.value)}
          placeholder="操作者 UUID"
          value={actorUserId}
        />
        <input
          className="ds-input"
          onChange={(event) => setAction(event.target.value)}
          placeholder="动作"
          value={action}
        />
        <input
          className="ds-input"
          onChange={(event) => setTargetType(event.target.value)}
          placeholder="目标类型"
          value={targetType}
        />
        <select
          className="ds-input"
          onChange={(event) => setResult(event.target.value)}
          value={result}
        >
          <option value="">全部结果</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <input
          className="ds-input"
          onChange={(event) => setDateFrom(event.target.value)}
          type="datetime-local"
          value={dateFrom}
        />
        <div className="flex gap-2">
          <input
            className="ds-input"
            onChange={(event) => setDateTo(event.target.value)}
            type="datetime-local"
            value={dateTo}
          />
          <DsButton type="submit">查询</DsButton>
        </div>
      </form>

      {error ? (
        <p className="mt-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-danger)]/30 bg-[var(--ds-surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--ds-danger)]">
          {error}
        </p>
      ) : null}

      <div className="admin-table-scroll mt-5">
        <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--ds-text-muted)]">
              <th className="px-3 py-2">动作</th>
              <th className="px-3 py-2">目标</th>
              <th className="px-3 py-2">操作者</th>
              <th className="px-3 py-2">结果</th>
              <th className="px-3 py-2">时间</th>
              <th className="px-3 py-2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-5 font-semibold text-[var(--ds-text-muted)]" colSpan={6}>
                  正在读取审计日志...
                </td>
              </tr>
            ) : null}
            {logs.map((log) => (
              <tr className="bg-[var(--ds-surface-raised)]" key={log.id}>
                <td className="rounded-l-[var(--ds-radius-sm)] px-3 py-3">
                  <strong>{auditActionLabel(log.action)}</strong>
                  <p className="ds-muted mt-1">{log.action}</p>
                </td>
                <td className="px-3 py-3">
                  <strong>{targetTypeLabel(log.target_type)}</strong>
                  <p className="ds-muted mt-1 break-all">{log.target_id ?? '无目标 ID'}</p>
                </td>
                <td className="px-3 py-3">{log.actor?.username ?? log.actor_user_id ?? '系统'}</td>
                <td className="px-3 py-3 font-black">
                  {log.result === 'success' ? '成功' : '失败'}
                </td>
                <td className="px-3 py-3">{formatDateTime(log.created_at)}</td>
                <td className="rounded-r-[var(--ds-radius-sm)] px-3 py-3">
                  <pre className="max-h-28 max-w-sm overflow-auto whitespace-pre-wrap rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface-raised)] p-2 text-xs">
                    {stringifyPreview(log.metadata)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="ds-muted text-sm font-semibold">
          共 {pagination?.total ?? 0} 条审计，第 {pagination?.page ?? page} /{' '}
          {pagination?.total_pages ?? 1} 页
        </p>
        <div className="flex gap-2">
          <DsButton
            disabled={loading || page <= 1}
            onClick={() => void loadLogs(page - 1)}
            type="button"
            variant="secondary"
          >
            上一页
          </DsButton>
          <DsButton
            disabled={loading || page >= (pagination?.total_pages ?? 1)}
            onClick={() => void loadLogs(page + 1)}
            type="button"
            variant="secondary"
          >
            下一页
          </DsButton>
        </div>
      </div>
    </section>
  );
}

export default function AdminAuditLogsPage() {
  return (
    <RouteGuard requireRole="super_admin">
      <AdminLayout>
        <AdminAuditLogsContent />
      </AdminLayout>
    </RouteGuard>
  );
}
