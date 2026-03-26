"use client"

import { AnnotationsListPage } from "@/components/annotations/AnnotationsListPage"

export default function GlobalAnnotationsPage() {
  return <AnnotationsListPage fileTypeFilter="all" listScope="global" />
}
