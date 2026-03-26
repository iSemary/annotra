'use client';

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
import { NavIconLink } from './nav-icon-link';

export function ProjectAnnotationTopNav({ user }: { user: AuthUser | null }) {
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
