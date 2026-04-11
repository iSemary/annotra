'use client';

import { AnnotraMediaFileManager } from '@/components/media/AnnotraMediaFileManager';

export default function DashboardMediaPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Media</h1>
      </div>
      <AnnotraMediaFileManager />
    </div>
  );
}
