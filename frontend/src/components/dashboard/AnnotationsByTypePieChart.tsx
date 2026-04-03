"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
  type ChartOptions,
} from "chart.js"
import { Pie } from "react-chartjs-2"

ChartJS.register(ArcElement, Tooltip, Legend)

const SLICES = [
  { key: "image", label: "Image", chartVar: "--chart-1" },
  { key: "video", label: "Video", chartVar: "--chart-2" },
  { key: "audio", label: "Audio", chartVar: "--chart-3" },
  { key: "dataset", label: "Dataset", chartVar: "--chart-4" },
] as const

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return v || fallback
}

export function AnnotationsByTypePieChart({
  annotationsByAssetType,
}: {
  annotationsByAssetType: Record<string, number>
}) {
  const { chartData, total, options } = useMemo(() => {
    const values = SLICES.map((s) => annotationsByAssetType[s.key] ?? 0)
    const sum = values.reduce((a, b) => a + b, 0)
    const bg = SLICES.map((s) => readCssVar(s.chartVar, "#64748b"))
    const border = readCssVar("--card", "#ffffff")
    const fg = readCssVar("--foreground", "#33394c")

    const data = {
      labels: SLICES.map((s) => s.label),
      datasets: [
        {
          data: values,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    }

    const opts: ChartOptions<"pie"> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 8,
            usePointStyle: true,
            pointStyle: "circle",
            color: fg,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const raw = ctx.raw as number
              const pct = sum > 0 ? ((raw / sum) * 100).toFixed(1) : "0"
              return `${ctx.label}: ${raw.toLocaleString()} (${pct}%)`
            },
          },
        },
      },
    }

    return { chartData: data, total: sum, options: opts }
  }, [annotationsByAssetType])

  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No annotations yet. Open{" "}
        <Link
          href="/dashboard/annotations"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Annotations
        </Link>{" "}
        to add assets and label them.
      </p>
    )
  }

  return (
    <div className="mx-auto h-[min(248px,50vw)] w-full max-w-[260px] sm:h-[228px]">
      <Pie data={chartData} options={options} />
    </div>
  )
}
