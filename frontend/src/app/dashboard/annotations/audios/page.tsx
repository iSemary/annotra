"use client"

import { AnnotationsListPage } from "@/components/annotations/AnnotationsListPage"

export default function GlobalAudioAnnotationsPage() {
  return <AnnotationsListPage fileTypeFilter="audio" listScope="global" />
}
