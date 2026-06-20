import type { Route } from 'next';

export interface AdminNavItem {
  title: string;
  href: Route;
  description: string;
  exact?: boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    title: '用户管理',
    href: '/admin/users' as Route,
    description: '管理用户状态、重置密码和代用户配置密钥。',
  },
  {
    title: '系统设置',
    href: '/admin/system-settings' as Route,
    description: '配置默认 new-api 地址、注册开关和任务参数。',
  },
  {
    title: '模型目录',
    href: '/admin/models' as Route,
    description: '维护模型类型、图标、描述、端点能力和参数 Schema。',
  },
  {
    title: '模型同步',
    href: '/admin/model-sync' as Route,
    description: '从 new-api 拉取模型候选快照。',
  },
  {
    title: '存储设置',
    href: '/admin/storage-settings' as Route,
    description: '配置本地或 S3 兼容资产存储。',
  },
  {
    title: '请求日志',
    href: '/admin/request-logs' as Route,
    description: '排查图片任务调用、状态、耗时和脱敏参数。',
  },
  {
    title: '审计日志',
    href: '/admin/audit-logs' as Route,
    description: '追踪敏感 reveal、用户变更和系统配置操作。',
  },
];

export function isAdminNavItemActive(pathname: string, item: AdminNavItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
