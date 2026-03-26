"use client"

import { AnnotationsListPage } from "@/components/annotations/AnnotationsListPage"

export default function GlobalDatasetAnnotationsPage() {
  return <AnnotationsListPage fileTypeFilter="dataset" listScope="global" />
}
