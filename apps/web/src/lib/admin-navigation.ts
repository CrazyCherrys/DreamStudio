import type { Route } from 'next';

export interface AdminNavItem {
  title: string;
  href: Route;
  exact?: boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    title: '用户管理',
    href: '/admin/users' as Route,
  },
  {
    title: '系统设置',
    href: '/admin/system-settings' as Route,
  },
  {
    title: '模型目录',
    href: '/admin/models' as Route,
  },
  {
    title: '模型同步',
    href: '/admin/model-sync' as Route,
  },
  {
    title: '存储设置',
    href: '/admin/storage-settings' as Route,
  },
  {
    title: '请求日志',
    href: '/admin/request-logs' as Route,
  },
  {
    title: '审计日志',
    href: '/admin/audit-logs' as Route,
  },
];

export function isAdminNavItemActive(pathname: string, item: AdminNavItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
