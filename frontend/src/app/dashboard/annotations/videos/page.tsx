"use client"

import { AnnotationsListPage } from "@/components/annotations/AnnotationsListPage"

export default function GlobalVideoAnnotationsPage() {
  return <AnnotationsListPage fileTypeFilter="video" listScope="global" />
}
