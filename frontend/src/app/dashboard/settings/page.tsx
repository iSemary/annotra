"use client"

import { useState, useEffect, useRef } from "react"
import { useForm } from "react-hook-form"
import { useTheme } from "next-themes"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select2 } from "@/components/ui/select2"
import { getSettings, updateSettings } from "@/lib/settings"
import {
  applyDashboardColors,
  clearDashboardColors,
  colorsFromSettings,
  dashboardColorsToSettings,
  isDashboardColorSettingKey,
  mergeLoadedDashboardColors,
  readDashboardColorsFromStorage,
  writeDashboardColorsToStorage,
  type DashboardColorKey,
  type DashboardColors,
} from "@/lib/dashboard-colors"
import { toast } from "sonner"
import { Palette, RotateCcw, Save } from "lucide-react"

const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
})

type SettingsValues = z.infer<typeof settingsSchema>

const THEME_OPTS = ["light", "dark", "system"] as const

function isSavedTheme(v: string | null | undefined): v is (typeof THEME_OPTS)[number] {
  return !!v && (THEME_OPTS as readonly string[]).includes(v)
}

const COLOR_META: {
  key: DashboardColorKey
  label: string
  description: string
}[] = [
  {
    key: "primary",
    label: "Primary",
    description: "Main buttons, key actions, and focus accents.",
  },
  {
    key: "secondary",
    label: "Secondary",
    description: "Secondary buttons and low-emphasis surfaces.",
  },
  {
    key: "accent",
    label: "Accent",
    description: "Hover states and highlighted rows.",
  },
  {
    key: "destructive",
    label: "Destructive",
    description: "Delete, errors, and dangerous actions.",
  },
  {
    key: "muted",
    label: "Muted",
    description: "Subtle backgrounds (e.g. sidebar, cards).",
  },
]

function normalizeHex(raw: string): string {
  const s = raw.trim()
  if (!s) return ""
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s)
  return m ? `#${m[1]}` : ""
}

function ColorPickerRow({
  label,
  description,
  value,
  fallbackPicker,
  onChange,
}: {
  label: string
  description: string
  value: string
  fallbackPicker: string
  onChange: (hex: string) => void
}) {
  const pickerValue = value || fallbackPicker
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <input
          type="color"
          aria-label={`${label} color`}
          className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-0.5 shadow-xs"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
        />
        <Input
          className="w-32 font-mono text-xs"
          placeholder="#000000"
          value={value}
          onChange={(e) => {
            const n = normalizeHex(e.target.value)
            if (n || e.target.value === "") onChange(n)
          }}
          spellCheck={false}
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onChange("")}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { theme: nextTheme, setTheme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dashboardColors, setDashboardColors] = useState<DashboardColors>({})
  const [customSettings, setCustomSettings] = useState<
    Array<{ key: string; value: string }>
  >([])
  const hadServerThemeRef = useRef(false)

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {},
  })

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  useEffect(() => {
    if (loading || hadServerThemeRef.current) return
    if (nextTheme && isSavedTheme(nextTheme)) {
      const current = form.getValues("theme")
      if (current === undefined || current === null) {
        form.setValue("theme", nextTheme)
      }
    }
  }, [loading, nextTheme, form.setValue, form.getValues])

  const patchDashboardColor = (key: DashboardColorKey, hex: string) => {
    setDashboardColors((prev) => {
      const next = { ...prev }
      if (!hex) delete next[key]
      else next[key] = hex
      applyDashboardColors(next)
      writeDashboardColorsToStorage(next)
      return next
    })
  }

  const resetAllDashboardColors = () => {
    setDashboardColors({})
    clearDashboardColors()
    writeDashboardColorsToStorage({})
    toast.message("Dashboard colors cleared (save to sync account)")
  }

  const loadSettings = async () => {
    try {
      setLoading(true)
      const settings = await getSettings()

      if (isSavedTheme(settings.theme)) {
        hadServerThemeRef.current = true
        form.setValue("theme", settings.theme)
        setTheme(settings.theme)
      } else {
        hadServerThemeRef.current = false
      }

      const fromApi = colorsFromSettings(settings as Record<string, string | null>)
      const fromLocal = readDashboardColorsFromStorage()
      const merged = mergeLoadedDashboardColors(fromApi, fromLocal)
      setDashboardColors(merged)
      applyDashboardColors(merged)
      writeDashboardColorsToStorage(merged)

      const custom = Object.entries(settings)
        .filter(
          ([key]) =>
            key !== "theme" && !isDashboardColorSettingKey(key),
        )
        .map(([key, value]) => ({ key, value: value || "" }))
      setCustomSettings(custom)
    } catch {
      toast.error("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  const handleAddCustomSetting = () => {
    setCustomSettings([...customSettings, { key: "", value: "" }])
  }

  const handleRemoveCustomSetting = (index: number) => {
    setCustomSettings(customSettings.filter((_, i) => i !== index))
  }

  const handleCustomSettingChange = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    const updated = [...customSettings]
    updated[index][field] = value
    setCustomSettings(updated)
  }

  const onSubmit = async (values: SettingsValues) => {
    try {
      setSaving(true)

      const allSettings: Record<string, string | null> = {}

      if (values.theme) {
        allSettings.theme = values.theme
      }

      Object.assign(allSettings, dashboardColorsToSettings(dashboardColors))

      customSettings.forEach((setting) => {
        const k = setting.key.trim()
        if (k && !isDashboardColorSettingKey(k)) {
          allSettings[k] = setting.value || null
        }
      })

      await updateSettings(allSettings)
      toast.success("Settings saved successfully")

      if (values.theme && isSavedTheme(values.theme)) {
        setTheme(values.theme)
      }

      writeDashboardColorsToStorage(dashboardColors)
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your application settings and preferences
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the appearance of the application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Theme</FormLabel>
                    <FormControl>
                      <Select2
                        options={[
                          { value: "light", label: "Light" },
                          { value: "dark", label: "Dark" },
                          { value: "system", label: "System" },
                        ]}
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v)
                          if (v && isSavedTheme(v)) {
                            setTheme(v)
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Choose your preferred theme. System will follow your
                      device&apos;s theme preference.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-2">
                  <Palette className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle>Dashboard colors</CardTitle>
                    <CardDescription>
                      Override primary, secondary, and other tokens. Foreground
                      text is chosen automatically for contrast. Leave empty to
                      use the default palette for light/dark mode.
                    </CardDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={resetAllDashboardColors}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset colors
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {COLOR_META.map(({ key, label, description }) => (
                <ColorPickerRow
                  key={key}
                  label={label}
                  description={description}
                  value={dashboardColors[key] ?? ""}
                  fallbackPicker={
                    key === "destructive"
                      ? "#dc2626"
                      : key === "muted"
                        ? "#94a3b8"
                        : "#3b82f6"
                  }
                  onChange={(hex) => patchDashboardColor(key, hex)}
                />
              ))}
              <p className="text-xs text-muted-foreground pt-1">
                Changes apply immediately in this browser. Click Save Settings to
                sync colors to your account as well.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Custom Settings</CardTitle>
                  <CardDescription>
                    Add custom key-value settings for your preferences
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomSetting}
                >
                  Add Setting
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {customSettings.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No custom settings. Click &quot;Add Setting&quot; to create one.
                </div>
              ) : (
                <div className="space-y-4">
                  {customSettings.map((setting, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Setting key"
                          value={setting.key}
                          onChange={(e) =>
                            handleCustomSettingChange(
                              index,
                              "key",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder="Setting value"
                          value={setting.value}
                          onChange={(e) =>
                            handleCustomSettingChange(
                              index,
                              "value",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveCustomSetting(index)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
