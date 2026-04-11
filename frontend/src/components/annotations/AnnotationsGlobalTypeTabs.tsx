"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  AudioWaveform,
  Box,
  Image,
  Layers,
  LayoutGrid,
  Video,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

type TabItem = {
  href: string
  label: string
  Icon: LucideIcon
  /** Only `/dashboard/annotations` (not `/images`, etc.). */
  exactOnly?: boolean
}

const TABS: TabItem[] = [
  {
    href: "/dashboard/annotations",
    label: "All types",
    Icon: LayoutGrid,
    exactOnly: true,
  },
  {
    href: "/dashboard/annotations/images",
    label: "Images",
    Icon: Image,
  },
  {
    href: "/dashboard/annotations/videos",
    label: "Videos",
    Icon: Video,
  },
  {
    href: "/dashboard/annotations/audios",
    label: "Audio",
    Icon: AudioWaveform,
  },
  {
    href: "/dashboard/annotations/datasets",
    label: "Datasets",
    Icon: Layers,
  },
  {
    href: "/dashboard/annotations/model-3d",
    label: "3D models",
    Icon: Box,
  },
]

function normalizePath(path: string): string {
  const p = path.replace(/\/$/, "")
  return p === "" ? "/" : p
}

function isTabActive(pathname: string, tab: TabItem): boolean {
  const p = normalizePath(pathname)
  const h = normalizePath(tab.href)
  if (tab.exactOnly) {
    return p === h
  }
  return p === h
}

export function AnnotationsGlobalTypeTabs() {
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams()
  const project = searchParams.get("project")?.trim()
  const projectQs = project
    ? `?project=${encodeURIComponent(project)}`
    : ""

  return (
    <nav
      className="-mx-1 flex flex-wrap gap-1 overflow-x-auto border-b border-border pb-px sm:gap-2"
      aria-label="Annotation asset types"
    >
      {TABS.map((tab) => {
        const active = isTabActive(pathname, tab)
        const { Icon } = tab
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${projectQs}`}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
