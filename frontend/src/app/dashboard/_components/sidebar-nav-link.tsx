'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

export function SidebarNavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  const pathname = usePathname();
  const hrefPath = href.split('#')[0];
  const active =
    hrefPath === '/dashboard'
      ? pathname === hrefPath
      : pathname === hrefPath || pathname.startsWith(hrefPath + '/');

  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      ].join(' ')}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );
}
