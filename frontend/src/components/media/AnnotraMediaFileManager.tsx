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
  type MediaRecord,
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

function parseUuidFromSvarId(id: string): string {
  const trimmed = id.replace(/^\/+/, '');
  const last = trimmed.split('/').pop() ?? trimmed;
  return last;
}

function toEntities(records: MediaRecord[]): IEntity[] {
  return records.map((m) => {
    const name = m.storage_key.split('/').pop() || m.id;
    return {
      id: `/${m.id}`,
      parent: 0,
      type: 'file' as const,
      size: m.size_bytes ?? 0,
      date: new Date(m.created_at),
      value: name,
      mediaUrl: m.url,
      mimeType: m.mime_type,
    };
  });
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
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchAllMediaPages();
      recordsRef.current = records;
      setData(toEntities(records));
      const used = records.reduce(
        (s, r) => s + (r.size_bytes ?? 0),
        0,
      );
      setDrive({
        used,
        total: Math.max(used * 2, 1024 * 1024),
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to load media');
      setData([]);
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
      try {
        await Promise.all(
          ev.ids.map((id) => deleteMedia(parseUuidFromSvarId(id))),
        );
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
      const uuid = parseUuidFromSvarId(ev.id);
      const rec = recordsRef.current.find((r) => r.id === uuid);
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
