'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuth } from '@/context/auth-context';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { toast } from 'sonner';
import {
  Home,
  Shield,
  Key,
  Users,
  FolderOpen,
  FileUp,
} from 'lucide-react';
import {
  applyDashboardColors,
  readDashboardColorsFromStorage,
} from '@/lib/dashboard-colors';
import { DashboardAnnotationsSidebar } from './dashboard-annotations-sidebar';
import { SettingsSubmenu } from './settings-submenu';
import { SidebarNavLink } from './sidebar-nav-link';

export function DashboardLayoutInner({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace('/login');
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    const featureOn = user?.two_factor_feature_enabled !== false;
    if (
      !loading &&
      isAuthenticated &&
      user &&
      featureOn &&
      !user.two_factor_enabled
    ) {
      const currentPath = pathname;
      if (
        !currentPath.startsWith('/dashboard/settings/two-factor') &&
        !currentPath.startsWith('/login/verify-2fa') &&
        currentPath !== '/login'
      ) {
        router.push('/dashboard/settings/two-factor');
        toast.warning(
          'Two-factor authentication is required. Please enable it to continue.',
        );
      }
    }
  }, [loading, isAuthenticated, user, pathname, router]);

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const platform = searchParams.get('platform');
    if (oauth === 'success')
      toast.success(`Connected ${platform ?? 'channel'}`);
    if (oauth === 'facebook_pages')
      toast.message('Select a Facebook page to finish connecting');
  }, [searchParams]);

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    applyDashboardColors(readDashboardColorsFromStorage());
  }, [loading, isAuthenticated]);

  if (loading) return null;
  if (!isAuthenticated) return null;

  const displayName = user?.full_name ?? user?.name ?? '';

  return (
    <TooltipProvider>
      <ConfirmDialogProvider>
        <div className="min-h-screen bg-background">
          <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
            <div className="mx-auto flex max-w-[1920px] items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Link href="/dashboard" className="text-sm font-semibold">
                  Annotra
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <span className="hidden text-sm text-muted-foreground md:inline">
                  {displayName}
                </span>
                <Button variant="outline" size="sm" onClick={logout}>
                  Logout
                </Button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1920px] px-4 py-6">
            <div className="grid gap-6 md:grid-cols-[220px_1fr]">
              <aside className="hidden md:block">
                <Card className="p-2">
                  <div className="grid gap-1">
                    <SidebarNavLink
                      href="/dashboard"
                      icon={Home}
                      label="Home"
                    />
                    <SidebarNavLink
                      href="/dashboard/media"
                      icon={FileUp}
                      label="Media"
                    />
                    {user?.permissions?.includes('projects:read') && (
                      <SidebarNavLink
                        href="/dashboard/projects"
                        icon={FolderOpen}
                        label="Projects"
                      />
                    )}
                    <DashboardAnnotationsSidebar user={user} />
                    <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                      Administration
                    </p>
                    {user?.permissions?.includes('users:read') && (
                      <SidebarNavLink
                        href="/dashboard/users"
                        icon={Users}
                        label="Users"
                      />
                    )}
                    {user?.permissions?.includes('roles:read') && (
                      <>
                        <SidebarNavLink
                          href="/dashboard/roles"
                          icon={Shield}
                          label="Roles"
                        />
                        <SidebarNavLink
                          href="/dashboard/permissions"
                          icon={Key}
                          label="Permissions"
                        />
                      </>
                    )}
                    <SettingsSubmenu user={user} />
                  </div>
                </Card>
              </aside>
              <section className="min-h-full bg-background text-foreground">
                {children}
              </section>
            </div>
          </main>
        </div>
      </ConfirmDialogProvider>
    </TooltipProvider>
  );
}
