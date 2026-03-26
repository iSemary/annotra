'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
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
import { SidebarAnnotationChildLink } from './sidebar-annotation-child-link';

export function DashboardAnnotationsSidebar({ user }: { user: AuthUser | null }) {
  const pathname = usePathname();

  if (!canAccessAnnotationsHub(user)) return null;

  const projectId = parseDashboardProjectId(pathname);
  const hub = '/dashboard/annotations';

  const rows: ReactNode[] = [];

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
