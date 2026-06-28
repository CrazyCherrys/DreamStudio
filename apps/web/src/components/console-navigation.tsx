'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/components/auth-provider';
import { CONSOLE_NAV_ITEMS, isConsoleNavItemActive } from '@/lib/console-navigation';

export function ConsoleNavigation() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <nav
      aria-label="用户后台导航"
      className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0"
    >
      {CONSOLE_NAV_ITEMS.filter((item) => !item.requireRole || item.requireRole === user?.role).map(
        (item) => {
          const active = isConsoleNavItemActive(pathname, item);
          return (
            <Link
              aria-current={active ? 'page' : undefined}
              className={`min-h-10 shrink-0 rounded-[var(--ds-radius-sm)] border px-3 py-2 text-sm font-black leading-5 transition lg:flex lg:w-full lg:items-center ${
                active
                  ? 'border-[var(--ds-brand)] bg-[var(--ds-brand)] text-[#031615] shadow-sm'
                  : 'border-transparent text-[var(--ds-text-muted)] hover:border-[var(--ds-border)] hover:bg-[var(--ds-surface-raised)] hover:text-[var(--ds-text)]'
              }`}
              href={item.href}
              key={item.href}
            >
              {item.title}
            </Link>
          );
        },
      )}
    </nav>
  );
}
