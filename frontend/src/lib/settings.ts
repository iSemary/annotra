import api from "./api"

export interface Settings {
  [key: string]: string | null
}

export async function getSettings(): Promise<Settings> {
  try {
    const res = await api.get<Settings | { settings: Settings }>("/settings")
    const d = res.data
    if (d && typeof d === "object" && "settings" in d) {
      return (d as { settings: Settings }).settings ?? {}
    }
    return (d as Settings) ?? {}
  } catch {
    return {}
  }
}

export async function updateSettings(
  settings: Record<string, string | null>,
): Promise<Settings> {
  const res = await api.put<{ settings?: Settings } & Settings>(
    "/settings",
    { settings },
  )
  const d = res.data
  if (d && typeof d === "object" && "settings" in d && d.settings) {
    return d.settings
  }
  return (d as Settings) ?? {}
}
