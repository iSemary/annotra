'use client';

import { AnnotraMediaFileManager } from '@/components/media/AnnotraMediaFileManager';

export default function DashboardMediaPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Media</h1>
        <p className="text-muted-foreground text-sm">
          Upload, browse, and delete your files. Folders, rename, and copy/move
          are not available for this storage backend.
        </p>
      </div>
      <AnnotraMediaFileManager />
    </div>
  );
}
