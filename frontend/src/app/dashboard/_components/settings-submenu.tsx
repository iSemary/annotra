'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Settings as SettingsIcon,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

export function SettingsSubmenu({
  user,
}: {
  user: {
    two_factor_enabled?: boolean;
    two_factor_feature_enabled?: boolean;
  } | null;
}) {
  const twoFactorFeatureOn = user?.two_factor_feature_enabled !== false;
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(
    pathname.startsWith('/dashboard/settings'),
  );

  const isSettingsActive = pathname.startsWith('/dashboard/settings');
  const isTwoFactorActive = pathname === '/dashboard/settings/two-factor';

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={[
          'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isSettingsActive
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        ].join(' ')}
      >
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-5 w-5" />
          <span>Settings</span>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {isOpen && (
        <div className="ml-6 mt-1 space-y-1 border-l pl-3">
          <Link
            href="/dashboard/settings"
            className={[
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              pathname === '/dashboard/settings'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            ].join(' ')}
          >
            <span>General</span>
          </Link>
          {twoFactorFeatureOn && (
            <Link
              href="/dashboard/settings/two-factor"
              className={[
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isTwoFactorActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              ].join(' ')}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Two-Factor Auth</span>
              {!user?.two_factor_enabled && (
                <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
                  Required
                </span>
              )}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
