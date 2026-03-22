"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
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
import { Select2, type Select2Option } from "@/components/ui/select2"
import { getSettings, updateSettings, type Settings } from "@/lib/settings"
import { toast } from "sonner"
import { Save } from "lucide-react"

const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
})

type SettingsValues = z.infer<typeof settingsSchema>

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customSettings, setCustomSettings] = useState<
    Array<{ key: string; value: string }>
  >([])

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      theme: "dark",
    },
  })

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    // Apply theme on mount and when theme changes
    const applyTheme = (theme: string) => {
      const root = document.documentElement
      if (theme === "dark") {
        root.classList.add("dark")
      } else if (theme === "light") {
        root.classList.remove("dark")
      } else {
        // System theme
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches
        if (prefersDark) {
          root.classList.add("dark")
        } else {
          root.classList.remove("dark")
        }
      }
    }

    const theme = form.watch("theme")
    if (theme) {
      applyTheme(theme)

      // Listen for system theme changes if theme is set to system
      if (theme === "system") {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
        const handleChange = () => applyTheme("system")
        mediaQuery.addEventListener("change", handleChange)
        return () => mediaQuery.removeEventListener("change", handleChange)
      }
    }
  }, [form.watch("theme")])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const settings = await getSettings()
      
      // Set theme if it exists
      if (settings.theme) {
        form.setValue("theme", settings.theme as "light" | "dark" | "system")
      }

      // Load custom settings (all settings except theme)
      const custom = Object.entries(settings)
        .filter(([key]) => key !== "theme")
        .map(([key, value]) => ({ key, value: value || "" }))
      setCustomSettings(custom)
    } catch (error: any) {
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
    value: string
  ) => {
    const updated = [...customSettings]
    updated[index][field] = value
    setCustomSettings(updated)
  }

  const onSubmit = async (values: SettingsValues) => {
    try {
      setSaving(true)

      // Combine theme and custom settings
      const allSettings: Record<string, string | null> = {}

      // Add theme
      if (values.theme) {
        allSettings.theme = values.theme
      }

      // Add custom settings
      customSettings.forEach((setting) => {
        if (setting.key.trim()) {
          allSettings[setting.key.trim()] = setting.value || null
        }
      })

      await updateSettings(allSettings)
      toast.success("Settings saved successfully")
      
      // Apply theme if changed
      if (values.theme) {
        const root = document.documentElement
        if (values.theme === "dark") {
          root.classList.add("dark")
        } else if (values.theme === "light") {
          root.classList.remove("dark")
        } else {
          // System theme - check system preference
          const prefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)"
          ).matches
          if (prefersDark) {
            root.classList.add("dark")
          } else {
            root.classList.remove("dark")
          }
        }
      }
    } catch (error: any) {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
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
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>
                      Choose your preferred theme. System will follow your
                      device's theme preference.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                <div className="text-center py-8 text-muted-foreground">
                  No custom settings. Click "Add Setting" to create one.
                </div>
              ) : (
                <div className="space-y-4">
                  {customSettings.map((setting, index) => (
                    <div
                      key={index}
                      className="flex gap-2 items-start"
                    >
                      <div className="flex-1">
                        <Input
                          placeholder="Setting key"
                          value={setting.key}
                          onChange={(e) =>
                            handleCustomSettingChange(
                              index,
                              "key",
                              e.target.value
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
                              e.target.value
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
