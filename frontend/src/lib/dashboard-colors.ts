/** Persisted under these keys in user settings API and localStorage. */
export const DASHBOARD_COLOR_SETTING_KEYS = {
  primary: "ui_color_primary",
  secondary: "ui_color_secondary",
  accent: "ui_color_accent",
  destructive: "ui_color_destructive",
  muted: "ui_color_muted",
} as const

export type DashboardColorKey = keyof typeof DASHBOARD_COLOR_SETTING_KEYS

export type DashboardColors = Partial<Record<DashboardColorKey, string>>

const STORAGE_KEY = "annotra-dashboard-colors"

const CSS_VAR: Record<DashboardColorKey, string> = {
  primary: "--primary",
  secondary: "--secondary",
  accent: "--accent",
  destructive: "--destructive",
  muted: "--muted",
}

const FG_VAR: Partial<Record<DashboardColorKey, string>> = {
  primary: "--primary-foreground",
  secondary: "--secondary-foreground",
  accent: "--accent-foreground",
  destructive: "--destructive-foreground",
}

const MUTED_FG = "--muted-foreground"

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Pick light or dark foreground for contrast on solid `hex` background. */
export function contrastForegroundOklch(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return "oklch(0.985 0 0)"
  const L = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
  return L > 0.55 ? "oklch(0.145 0 0)" : "oklch(0.985 0 0)"
}

function mutedForegroundOklch(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return "oklch(0.556 0 0)"
  const L = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
  return L > 0.55 ? "oklch(0.45 0 0)" : "oklch(0.708 0 0)"
}

const DASHBOARD_COLOR_SETTING_KEY_SET = new Set<string>(
  Object.values(DASHBOARD_COLOR_SETTING_KEYS),
)

export function isDashboardColorSettingKey(key: string): boolean {
  return DASHBOARD_COLOR_SETTING_KEY_SET.has(key)
}

export function colorsFromSettings(
  settings: Record<string, string | null | undefined>,
): DashboardColors {
  const out: DashboardColors = {}
  ;(Object.keys(DASHBOARD_COLOR_SETTING_KEYS) as DashboardColorKey[]).forEach(
    (k) => {
      const sk = DASHBOARD_COLOR_SETTING_KEYS[k]
      const v = settings[sk]
      if (v && /^#?[0-9a-fA-F]{6}$/.test(v.trim())) {
        out[k] = v.trim().startsWith("#") ? v.trim() : `#${v.trim()}`
      }
    },
  )
  return out
}

export function readDashboardColorsFromStorage(): DashboardColors {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    const out: DashboardColors = {}
    ;(Object.keys(DASHBOARD_COLOR_SETTING_KEYS) as DashboardColorKey[]).forEach(
      (k) => {
        const v = (parsed as Record<string, unknown>)[k]
        if (typeof v === "string" && /^#?[0-9a-fA-F]{6}$/.test(v.trim())) {
          out[k] = v.trim().startsWith("#") ? v.trim() : `#${v.trim()}`
        }
      },
    )
    return out
  } catch {
    return {}
  }
}

export function writeDashboardColorsToStorage(colors: DashboardColors): void {
  try {
    const cleaned: Record<string, string> = {}
    ;(Object.keys(colors) as DashboardColorKey[]).forEach((k) => {
      const v = colors[k]
      if (v && /^#?[0-9a-fA-F]{6}$/.test(v.trim())) {
        cleaned[k] = v.trim().startsWith("#") ? v.trim() : `#${v.trim()}`
      }
    })
    if (Object.keys(cleaned).length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
    }
  } catch {
    /* ignore */
  }
}

/** Apply custom colors on `<html>`. Empty / missing keys leave theme defaults. */
export function applyDashboardColors(colors: DashboardColors): void {
  if (typeof document === "undefined") return
  const root = document.documentElement

  ;(Object.keys(DASHBOARD_COLOR_SETTING_KEYS) as DashboardColorKey[]).forEach(
    (k) => {
      const hex = colors[k]?.trim()
      const css = CSS_VAR[k]
      const fg = FG_VAR[k]
      if (hex && /^#?[0-9a-fA-F]{6}$/.test(hex)) {
        const norm = hex.startsWith("#") ? hex : `#${hex}`
        root.style.setProperty(css, norm)
        if (fg) {
          root.style.setProperty(fg, contrastForegroundOklch(norm))
        }
        if (k === "muted") {
          root.style.setProperty(MUTED_FG, mutedForegroundOklch(norm))
        }
      } else {
        root.style.removeProperty(css)
        if (fg) root.style.removeProperty(fg)
        if (k === "muted") root.style.removeProperty(MUTED_FG)
      }
    },
  )
}

export function clearDashboardColors(): void {
  if (typeof document === "undefined") return
  const root = document.documentElement
  ;(Object.keys(DASHBOARD_COLOR_SETTING_KEYS) as DashboardColorKey[]).forEach(
    (k) => {
      root.style.removeProperty(CSS_VAR[k])
      const fg = FG_VAR[k]
      if (fg) root.style.removeProperty(fg)
      if (k === "muted") root.style.removeProperty(MUTED_FG)
    },
  )
}

export function mergeDashboardColorSources(
  ...sources: DashboardColors[]
): DashboardColors {
  return Object.assign({}, ...sources.filter(Boolean))
}

/** Prefer API values; fall back to localStorage per key. */
export function mergeLoadedDashboardColors(
  fromApi: DashboardColors,
  fromLocal: DashboardColors,
): DashboardColors {
  const keys = Object.keys(DASHBOARD_COLOR_SETTING_KEYS) as DashboardColorKey[]
  const out: DashboardColors = {}
  for (const k of keys) {
    const v = fromApi[k] ?? fromLocal[k]
    if (v) out[k] = v
  }
  return out
}

export function dashboardColorsToSettings(
  colors: DashboardColors,
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  ;(Object.keys(DASHBOARD_COLOR_SETTING_KEYS) as DashboardColorKey[]).forEach(
    (k) => {
      const sk = DASHBOARD_COLOR_SETTING_KEYS[k]
      const v = colors[k]?.trim()
      if (v && /^#?[0-9a-fA-F]{6}$/.test(v)) {
        out[sk] = v.startsWith("#") ? v : `#${v}`
      } else {
        out[sk] = null
      }
    },
  )
  return out
}
