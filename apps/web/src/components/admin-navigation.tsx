'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ADMIN_NAV_ITEMS, isAdminNavItemActive } from '@/lib/admin-navigation';

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="管理后台导航"
      className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0"
    >
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = isAdminNavItemActive(pathname, item);
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={`min-h-10 shrink-0 rounded-[var(--ds-radius-sm)] border px-3 py-2 text-sm font-black leading-5 transition lg:flex lg:w-full lg:items-center ${
              active
                ? 'border-[var(--ds-brand)] bg-[var(--ds-brand)] text-white shadow-sm'
                : 'border-transparent text-[var(--ds-text-muted)] hover:border-[var(--ds-border)] hover:bg-white/70 hover:text-[var(--ds-text)]'
            }`}
            href={item.href}
            key={item.href}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
