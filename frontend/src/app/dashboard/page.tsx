"use client"

import dynamic from "next/dynamic"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  getDashboardSummary,
  getWorkspaceStats,
  type DashboardSummary,
  type WorkspaceStats,
} from "@/lib/dashboard"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  FolderKanban,
  Layers,
  Tags,
  Image as ImageIcon,
  Activity,
} from "lucide-react"

const AnnotationsByTypePieChart = dynamic(
  () =>
    import("@/components/dashboard/AnnotationsByTypePieChart").then(
      (m) => m.AnnotationsByTypePieChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[228px] items-center justify-center"
        aria-hidden
      >
        <div className="h-36 w-36 animate-pulse rounded-full bg-muted" />
      </div>
    ),
  },
)

const MODALITIES: {
  key: keyof WorkspaceStats["annotations_by_asset_type"]
  label: string
  chartVar: string
}[] = [
  { key: "image", label: "Image", chartVar: "--chart-1" },
  { key: "video", label: "Video", chartVar: "--chart-2" },
  { key: "audio", label: "Audio", chartVar: "--chart-3" },
  { key: "dataset", label: "Dataset", chartVar: "--chart-4" },
  { key: "model_3d", label: "3D models", chartVar: "--chart-5" },
]

function KpiCard({
  label,
  value,
  icon: Icon,
  iconTint,
  href,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  iconTint: string
  href?: string
}) {
  const inner = (
    <Card className="border-border/80 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconTint}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <p className="truncate text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {value.toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  )
  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
        {inner}
      </Link>
    )
  }
  return inner
}

function StackedDistribution({
  title,
  description,
  data,
}: {
  title: string
  description: string
  data: Record<string, number>
}) {
  const entries = MODALITIES.map((m) => ({
    ...m,
    value: data[m.key] ?? 0,
  }))
  const total = entries.reduce((s, e) => s + e.value, 0) || 1

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
          {entries.map((e) => (
            <div
              key={e.key}
              className="h-full min-w-0 transition-all"
              style={{
                width: `${(e.value / total) * 100}%`,
                backgroundColor: `var(${e.chartVar})`,
              }}
              title={`${e.label}: ${e.value}`}
            />
          ))}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {entries.map((e) => (
            <li
              key={e.key}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(${e.chartVar})` }}
                />
                {e.label}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {e.value.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function ModalityProgressRows({
  title,
  description,
  data,
}: {
  title: string
  description: string
  data: Record<string, number>
}) {
  const max = Math.max(
    ...MODALITIES.map((m) => data[m.key] ?? 0),
    1,
  )

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {MODALITIES.map((m) => {
          const v = data[m.key] ?? 0
          const pct = (v / max) * 100
          return (
            <div key={m.key}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-foreground">{m.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {v.toLocaleString()}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: `var(${m.chartVar})`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [stats, setStats] = useState<WorkspaceStats | null>(null)
  const [statsError, setStatsError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [st, sm] = await Promise.all([
          getWorkspaceStats().catch(() => null),
          getDashboardSummary().catch(() => null),
        ])
        if (cancelled) return
        if (st) {
          setStats(st)
          setStatsError(false)
        } else {
          setStats(null)
          setStatsError(true)
        }
        setSummary(sm)
      } catch {
        if (!cancelled) {
          toast.error("Failed to load dashboard")
          setStats(null)
          setStatsError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const imageAssets = stats?.assets_by_type?.image ?? 0

  const annotationSpark = useMemo(() => {
    if (!stats) return []
    const a = stats.annotations_by_asset_type
    return MODALITIES.map((m) => a[m.key] ?? 0)
  }, [stats])

  const sparkMax = Math.max(...annotationSpark, 1)
  const sparkHeights = annotationSpark.map((v) =>
    Math.max(8, Math.round((v / sparkMax) * 48)),
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Statistics
          </h1>
          <p className="text-muted-foreground">Loading…</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-muted/80"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Statistics
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/projects">Projects</Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link href="/dashboard/annotations">Annotations</Link>
          </Button>
        </div>
      </div>

      {statsError && !stats && (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Could not load workspace stats. You need{" "}
          <code className="text-xs">projects:read</code> or{" "}
          <code className="text-xs">dashboard:read</code>.
        </p>
      )}

      {stats && (
        <>
          <section>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KpiCard
                label="Projects"
                value={stats.projects_total}
                icon={FolderKanban}
                iconTint="bg-[color-mix(in_srgb,var(--chart-1)_18%,transparent)] text-[var(--chart-1)]"
                href="/dashboard/projects"
              />
              <KpiCard
                label="Active projects"
                value={stats.projects_active}
                icon={Activity}
                iconTint="bg-[color-mix(in_srgb,var(--chart-4)_20%,transparent)] text-[var(--chart-4)]"
                href="/dashboard/projects"
              />
              <KpiCard
                label="Annotation assets"
                value={stats.annotation_assets_total}
                icon={Layers}
                iconTint="bg-[color-mix(in_srgb,var(--chart-2)_18%,transparent)] text-[var(--chart-2)]"
                href="/dashboard/annotations"
              />
              <KpiCard
                label="Annotations"
                value={stats.annotations_total}
                icon={Tags}
                iconTint="bg-[color-mix(in_srgb,var(--chart-3)_18%,transparent)] text-[var(--chart-3)]"
                href="/dashboard/annotations"
              />
              <KpiCard
                label="Image assets"
                value={imageAssets}
                icon={ImageIcon}
                iconTint="bg-[color-mix(in_srgb,var(--chart-1)_18%,transparent)] text-[var(--chart-1)]"
                href="/dashboard/annotations/images"
              />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="border-border/80 shadow-sm lg:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-lg">Annotation volume</CardTitle>
                  <CardDescription>
                    Relative counts by modality (annotation rows per asset type)
                  </CardDescription>
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {stats.annotations_total.toLocaleString()}
                </span>
              </CardHeader>
              <CardContent>
                <div className="flex h-14 items-end gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  {sparkHeights.map((h, i) => (
                    <div
                      key={MODALITIES[i].key}
                      className="min-w-0 flex-1 rounded-t-sm transition-all"
                      style={{
                        height: `${h}px`,
                        backgroundColor: `var(${MODALITIES[i].chartVar})`,
                        opacity: 0.85,
                      }}
                      title={`${MODALITIES[i].label}: ${annotationSpark[i]?.toLocaleString() ?? 0}`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {MODALITIES.map((m) => (
                    <span key={m.key} className="flex-1 text-center">
                      {m.label}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <StackedDistribution
              title="Annotations mix"
              description="Share of annotation rows by modality"
              data={stats.annotations_by_asset_type}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <ModalityProgressRows
              title="Assets by modality"
              description="Annotation assets in your workspace"
              data={stats.assets_by_type}
            />
            <Card className="border-border/80 shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">
                  Annotations by file type
                </CardTitle>
                <CardDescription>
                  Annotation rows per modality (including 3D models)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AnnotationsByTypePieChart
                  annotationsByAssetType={stats.annotations_by_asset_type}
                />
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {!stats && summary && !statsError && (
        <Card className="max-w-lg border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>
              Summary from <code className="text-xs">GET /dashboard/summary</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Company slug:</span>{" "}
              <span className="font-medium">{summary.slug}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Role:</span>{" "}
              <span className="font-medium">{summary.role}</span>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
