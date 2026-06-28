import type { Route } from 'next';

import type { UserRole } from '@/lib/auth';

export interface ConsoleNavItem {
  title: string;
  href: Route;
  description: string;
  requireRole?: UserRole;
}

export const CONSOLE_NAV_ITEMS: ConsoleNavItem[] = [
  {
    title: '账号设置',
    href: '/console/account' as Route,
    description: '查看账号信息、更新展示名、修改密码和退出登录。',
  },
  {
    title: '服务密钥',
    href: '/console/new-api' as Route,
    description: '管理个人 new-api 密钥、Base URL 和连接测试。',
  },
  {
    title: '任务列表',
    href: '/console/tasks' as Route,
    description: '查看图片任务状态、结果、重试与删除操作。',
  },
  {
    title: '我的作品',
    href: '/console/assets' as Route,
    description: '管理自己的结果图与参考图资产。',
  },
  {
    title: '管理后台',
    href: '/admin' as Route,
    description: '进入管理员控制台。',
    requireRole: 'super_admin',
  },
];

export function isConsoleNavItemActive(pathname: string, item: ConsoleNavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
