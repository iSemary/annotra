'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/context/auth-context';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { toast } from 'sonner';
import {
  Settings as SettingsIcon,
  Home,
  Shield,
  Key,
  Users,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FileUp,
  Tags,
  LayoutGrid,
  Image as ImageIcon,
  Video,
  AudioLines,
  Database,
} from 'lucide-react';
import type { AuthUser } from '@/lib/api';
import {
  canAccessAnnotationsHub,
  canReadAnnotationModality,
  canReadAnyAnnotationModality,
  parseDashboardProjectId,
  projectAnnotationNavActive,
} from '@/lib/annotation-nav';
import {
  applyDashboardColors,
  readDashboardColorsFromStorage,
} from '@/lib/dashboard-colors';

function SidebarAnnotationChildLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
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

function DashboardAnnotationsSidebar({ user }: { user: AuthUser | null }) {
  const pathname = usePathname();

  if (!canAccessAnnotationsHub(user)) return null;

  const projectId = parseDashboardProjectId(pathname);
  const hub = '/dashboard/annotations';

  const rows: React.ReactNode[] = [];

  if (projectId && user?.permissions?.includes('projects:read')) {
    const base = `/dashboard/projects/${projectId}/annotations`;
    if (canReadAnyAnnotationModality(user)) {
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-all"
          href={base}
          icon={LayoutGrid}
          label="All"
          active={projectAnnotationNavActive(pathname, projectId, 'all')}
        />,
      );
    }
    if (canReadAnnotationModality(user, 'image')) {
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-img"
          href={`${base}/images`}
          icon={ImageIcon}
          label="Images"
          active={projectAnnotationNavActive(pathname, projectId, 'image')}
        />,
      );
    }
    if (canReadAnnotationModality(user, 'video')) {
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-vid"
          href={`${base}/videos`}
          icon={Video}
          label="Videos"
          active={projectAnnotationNavActive(pathname, projectId, 'video')}
        />,
      );
    }
    if (canReadAnnotationModality(user, 'audio')) {
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-aud"
          href={`${base}/audios`}
          icon={AudioLines}
          label="Audios"
          active={projectAnnotationNavActive(pathname, projectId, 'audio')}
        />,
      );
    }
    if (canReadAnnotationModality(user, 'dataset')) {
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-ds"
          href={`${base}/datasets`}
          icon={Database}
          label="Datasets"
          active={projectAnnotationNavActive(pathname, projectId, 'dataset')}
        />,
      );
    }
  } else {
    if (canReadAnyAnnotationModality(user)) {
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-all"
          href={hub}
          icon={LayoutGrid}
          label="All"
          active={pathname === hub}
        />,
      );
    }
    if (canReadAnnotationModality(user, 'image')) {
      const href = `${hub}/images`;
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-img"
          href={href}
          icon={ImageIcon}
          label="Images"
          active={pathname === href}
        />,
      );
    }
    if (canReadAnnotationModality(user, 'video')) {
      const href = `${hub}/videos`;
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-vid"
          href={href}
          icon={Video}
          label="Videos"
          active={pathname === href}
        />,
      );
    }
    if (canReadAnnotationModality(user, 'audio')) {
      const href = `${hub}/audios`;
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-aud"
          href={href}
          icon={AudioLines}
          label="Audios"
          active={pathname === href}
        />,
      );
    }
    if (canReadAnnotationModality(user, 'dataset')) {
      const href = `${hub}/datasets`;
      rows.push(
        <SidebarAnnotationChildLink
          key="ann-ds"
          href={href}
          icon={Database}
          label="Datasets"
          active={pathname === href}
        />,
      );
    }
  }

  if (rows.length === 0) return null;

  return (
    <>
      <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        Annotations
      </p>
      {rows}
    </>
  );
}

function defaultNavIconActive(pathname: string, hrefPath: string): boolean {
  return hrefPath === '/dashboard'
    ? pathname === hrefPath
    : pathname === hrefPath || pathname.startsWith(hrefPath + '/');
}

function NavIconLink({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
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

function SidebarNavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
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

function ProjectAnnotationTopNav({ user }: { user: AuthUser | null }) {
  const pathname = usePathname();
  const projectId = parseDashboardProjectId(pathname);
  if (!projectId) return null;
  if (!user?.permissions?.includes('projects:read')) return null;
  if (!canAccessAnnotationsHub(user)) return null;

  const base = `/dashboard/projects/${projectId}/annotations`;

  return (
    <>
      <span
        className="mx-0.5 hidden h-6 w-px shrink-0 bg-border md:block"
        aria-hidden
      />
      {canReadAnyAnnotationModality(user) && (
        <NavIconLink
          href={base}
          icon={LayoutGrid}
          label="All annotations"
          isActive={(p) => projectAnnotationNavActive(p, projectId, 'all')}
        />
      )}
      {canReadAnnotationModality(user, 'image') && (
        <NavIconLink
          href={`${base}/images`}
          icon={ImageIcon}
          label="Image annotations"
          isActive={(p) => projectAnnotationNavActive(p, projectId, 'image')}
        />
      )}
      {canReadAnnotationModality(user, 'video') && (
        <NavIconLink
          href={`${base}/videos`}
          icon={Video}
          label="Video annotations"
          isActive={(p) => projectAnnotationNavActive(p, projectId, 'video')}
        />
      )}
      {canReadAnnotationModality(user, 'audio') && (
        <NavIconLink
          href={`${base}/audios`}
          icon={AudioLines}
          label="Audio annotations"
          isActive={(p) => projectAnnotationNavActive(p, projectId, 'audio')}
        />
      )}
      {canReadAnnotationModality(user, 'dataset') && (
        <NavIconLink
          href={`${base}/datasets`}
          icon={Database}
          label="Dataset annotations"
          isActive={(p) => projectAnnotationNavActive(p, projectId, 'dataset')}
        />
      )}
    </>
  );
}

function SettingsSubmenu({
  user,
}: {
  user: {
    two_factor_enabled?: boolean
    two_factor_feature_enabled?: boolean
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

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
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
                <nav className="hidden items-center gap-1 md:flex">
                  <NavIconLink
                    href="/dashboard"
                    icon={Home}
                    label="Home"
                  />
                  <NavIconLink
                    href="/dashboard/media"
                    icon={FileUp}
                    label="Media"
                  />
                  {user?.permissions?.includes('projects:read') && (
                    <NavIconLink
                      href="/dashboard/projects"
                      icon={FolderOpen}
                      label="Projects"
                    />
                  )}
                  {canAccessAnnotationsHub(user) && (
                    <NavIconLink
                      href="/dashboard/annotations"
                      icon={Tags}
                      label="Annotations"
                    />
                  )}
                  <ProjectAnnotationTopNav user={user} />
                  <NavIconLink
                    href="/dashboard/settings"
                    icon={SettingsIcon}
                    label="Settings"
                  />
                  {user?.permissions?.includes('users:read') && (
                    <NavIconLink
                      href="/dashboard/users"
                      icon={Users}
                      label="Users"
                    />
                  )}
                  {user?.permissions?.includes('roles:read') && (
                    <>
                      <NavIconLink
                        href="/dashboard/roles"
                        icon={Shield}
                        label="Roles"
                      />
                      <NavIconLink
                        href="/dashboard/permissions"
                        icon={Key}
                        label="Permissions"
                      />
                    </>
                  )}
                </nav>
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          Loading...
        </div>
      }
    >
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
