"use client"

import { AnnotationsListPage } from "@/components/annotations/AnnotationsListPage"

export default function GlobalImageAnnotationsPage() {
  return <AnnotationsListPage fileTypeFilter="image" listScope="global" />
}
