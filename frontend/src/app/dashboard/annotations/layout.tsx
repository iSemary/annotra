import type { ReactNode } from "react"
import { Suspense } from "react"
import { AnnotationsGlobalTypeTabs } from "@/components/annotations/AnnotationsGlobalTypeTabs"

export default function DashboardAnnotationsLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <AnnotationsGlobalTypeTabs />
      </Suspense>
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  )
}
