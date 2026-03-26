'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function defaultNavIconActive(pathname: string, hrefPath: string): boolean {
  return hrefPath === '/dashboard'
    ? pathname === hrefPath
    : pathname === hrefPath || pathname.startsWith(hrefPath + '/');
}

export function NavIconLink({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  isActive?: (pathname: string, hrefPath: string) => boolean;
}) {
  const pathname = usePathname();
  const hrefPath = href.split('#')[0];
  const active = isActive
    ? isActive(pathname, hrefPath)
    : defaultNavIconActive(pathname, hrefPath);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className={[
            'flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors',
            active
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          ].join(' ')}
        >
          <Icon className="h-5 w-5" />
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
