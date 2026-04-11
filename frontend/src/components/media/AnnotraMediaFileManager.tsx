'use client';

import {
  getMenuOptions,
  Willow,
  WillowDark,
  type IApi,
  type IEntity,
  type IFileMenuOption,
} from '@svar-ui/react-filemanager';
import '@svar-ui/react-filemanager/all.css';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  deleteMedia,
  listMedia,
  listMediaStorageTree,
  type MediaRecord,
  type MediaStorageTreeNode,
  uploadFile,
} from '@/lib/media';

const Filemanager = dynamic(
  () =>
    import('@svar-ui/react-filemanager').then((mod) => mod.Filemanager),
  { ssr: false, loading: () => <p className="text-muted-foreground p-4">Loading file manager…</p> },
);

const BLOCKED_MENU_IDS = new Set([
  'rename',
  'copy',
  'move',
  'paste',
  'add-folder',
  'add-file',
]);

function toMenuOptions(mode: Parameters<typeof getMenuOptions>[0]): IFileMenuOption[] {
  const raw = getMenuOptions(mode);
  return raw
    .filter((o) => o.id == null || !BLOCKED_MENU_IDS.has(String(o.id)))
    .map(
      (o) =>
        ({ ...o, hotkey: (o as IFileMenuOption).hotkey ?? '' }) as IFileMenuOption,
    );
}

/**
 * Storage path relative to the browsed root (matches backend node.path), no leading slash.
 */
function pathFromFileManagerId(id: string): string {
  return id.replace(/^\/+/, '');
}

/** Last path segment; legacy ids were `/media-uuid` (segment = uuid). */
function parseUuidFromSvarId(id: string): string {
  const trimmed = pathFromFileManagerId(id);
  return trimmed.split('/').pop() ?? trimmed;
}

function extFromFileName(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i + 1).toLowerCase();
}

/**
 * SVAR FileTree.parseId() derives display name and file-type icon from the substring after
 * the last "/" in id. Using /${uuid} shows UUIDs and empty ext → "unknown" icons; use a
 * virtual path id instead and resolve actions via storage path.
 */
function toEntities(records: MediaRecord[]): IEntity[] {
  return records.map((m) => {
    const name = m.storage_key.split('/').pop() || m.id;
    const ext = extFromFileName(name);
    return {
      id: `/${m.storage_key}`,
      parent: 0,
      type: 'file' as const,
      size: m.size_bytes ?? 0,
      date: new Date(m.created_at),
      name,
      value: name,
      ext,
      mediaUrl: m.url,
      mimeType: m.mime_type,
    };
  });
}

function folderEntityId(rel: string): string {
  return `/${rel}`;
}

function parentRelPath(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

function storageTreeToEntities(nodes: MediaStorageTreeNode[]): IEntity[] {
  const folders = nodes.filter((n) => n.is_dir);
  const files = nodes.filter((n) => !n.is_dir);
  folders.sort((a, b) => {
    const da = a.path.split('/').length;
    const db = b.path.split('/').length;
    if (da !== db) return da - db;
    return a.path.localeCompare(b.path);
  });
  files.sort((a, b) => a.path.localeCompare(b.path));
  const entities: IEntity[] = [];
  for (const n of folders) {
    const pp = parentRelPath(n.path);
    const label = baseName(n.path);
    entities.push({
      id: folderEntityId(n.path),
      parent: pp ? folderEntityId(pp) : 0,
      type: 'folder',
      size: 0,
      date: n.modified_at ? new Date(n.modified_at) : new Date(),
      name: label,
      value: label,
      ext: '',
    });
  }
  for (const n of files) {
    const pp = parentRelPath(n.path);
    const name = baseName(n.path);
    const ext = extFromFileName(name);
    const m = n.media;
    if (m) {
      entities.push({
        id: `/${n.path}`,
        parent: pp ? folderEntityId(pp) : 0,
        type: 'file',
        size: m.size_bytes ?? 0,
        date: new Date(m.updated_at),
        name,
        value: name,
        ext,
        mediaUrl: m.url,
        mimeType: m.mime_type,
      });
    } else {
      entities.push({
        id: `/${n.path}`,
        parent: pp ? folderEntityId(pp) : 0,
        type: 'file',
        size: n.size_bytes ?? 0,
        date: n.modified_at ? new Date(n.modified_at) : new Date(),
        name: `${name} (not in library)`,
        value: `${name} (not in library)`,
        ext,
        mediaUrl: n.url,
        mimeType: n.mime_type ?? 'application/octet-stream',
      });
    }
  }
  return entities;
}

async function fetchAllMediaPages(): Promise<MediaRecord[]> {
  const all: MediaRecord[] = [];
  let page = 1;
  const per_page = 200;
  for (;;) {
    const { items, pagination } = await listMedia({ page, per_page });
    all.push(...items);
    if (
      !pagination ||
      page >= pagination.total_pages ||
      items.length < per_page
    ) {
      break;
    }
    page += 1;
  }
  return all;
}

export function AnnotraMediaFileManager() {
  const { resolvedTheme } = useTheme();
  const ThemeShell = resolvedTheme === 'light' ? Willow : WillowDark;

  const [data, setData] = useState<IEntity[]>([]);
  const [drive, setDrive] = useState<{ used: number; total: number }>({
    used: 0,
    total: 1,
  });
  const [loading, setLoading] = useState(true);
  const recordsRef = useRef<MediaRecord[]>([]);
  const recordsByPathRef = useRef<Map<string, MediaRecord>>(new Map());
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nodes = await listMediaStorageTree();
      const records = nodes
        .filter((n) => !n.is_dir && n.media)
        .map((n) => n.media as MediaRecord);
      recordsRef.current = records;
      recordsByPathRef.current = new Map(
        nodes
          .filter((n) => !n.is_dir && n.media)
          .map((n) => [n.path, n.media as MediaRecord]),
      );
      setData(storageTreeToEntities(nodes));
      const used = nodes
        .filter((n) => !n.is_dir)
        .reduce((s, n) => s + (n.size_bytes ?? 0), 0);
      setDrive({
        used,
        total: Math.max(used * 2, 1024 * 1024),
      });
    } catch (e) {
      console.error(e);
      try {
        const records = await fetchAllMediaPages();
        recordsRef.current = records;
        recordsByPathRef.current = new Map(
          records.map((r) => [pathFromFileManagerId(`/${r.storage_key}`), r]),
        );
        setData(toEntities(records));
        const used = records.reduce(
          (s, r) => s + (r.size_bytes ?? 0),
          0,
        );
        setDrive({
          used,
          total: Math.max(used * 2, 1024 * 1024),
        });
      } catch (e2) {
        console.error(e2);
        toast.error('Failed to load media');
        setData([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRef.current = reload;
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const init = useCallback((api: IApi) => {
    api.intercept('delete-files', async (ev) => {
      const mediaIds: string[] = [];
      for (const id of ev.ids) {
        const path = pathFromFileManagerId(String(id));
        let rec = recordsByPathRef.current.get(path);
        if (!rec) {
          const maybeMediaId = parseUuidFromSvarId(String(id));
          rec = recordsRef.current.find((r) => r.id === maybeMediaId);
        }
        if (!rec) {
          toast.error(
            'Files on disk that are not in the media library cannot be deleted from here.',
          );
          return false;
        }
        mediaIds.push(rec.id);
      }
      try {
        await Promise.all(mediaIds.map((mid) => deleteMedia(mid)));
        await refreshRef.current();
        return false;
      } catch (err) {
        console.error(err);
        toast.error('Delete failed');
        return false;
      }
    });

    api.intercept('create-file', async (ev) => {
      const file = ev.file?.file;
      if (!file) return false;
      try {
        await uploadFile(file);
        toast.success('Uploaded');
        await refreshRef.current();
      } catch (err) {
        console.error(err);
        toast.error('Upload failed');
        return false;
      }
      return false;
    });

    api.intercept('rename-file', () => false);
    api.intercept('move-files', () => false);
    api.intercept('copy-files', () => false);

    api.intercept('download-file', (ev) => {
      const path = pathFromFileManagerId(String(ev.id));
      const maybeMediaId = parseUuidFromSvarId(String(ev.id));
      const rec =
        recordsByPathRef.current.get(path) ??
        recordsRef.current.find((r) => r.storage_key === path) ??
        recordsRef.current.find((r) => r.id === maybeMediaId);
      const url = rec?.url;
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return false;
    });
  }, []);

  if (loading && data.length === 0) {
    return (
      <div className="text-muted-foreground p-6 text-sm">Loading your files…</div>
    );
  }

  return (
    <ThemeShell fonts>
      <div className="min-h-[560px] w-full overflow-hidden rounded-lg border bg-card">
        <Filemanager
          init={init}
          data={data}
          drive={drive}
          menuOptions={(mode) => toMenuOptions(mode)}
          previews={(file, _w, _h) => {
            if (file.type !== 'file') return null;
            const ext = file as { mediaUrl?: string; mimeType?: string };
            if (!ext.mediaUrl) return null;
            if (ext.mimeType?.startsWith('image/')) return ext.mediaUrl;
            return null;
          }}
        />
      </div>
    </ThemeShell>
  );
}
