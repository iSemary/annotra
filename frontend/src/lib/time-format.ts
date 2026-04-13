/** Parse `MM:SS`, `HH:MM:SS`, or plain seconds (e.g. `2.5`). */
export function parseTimeToSeconds(input: string): number | null {
  const t = input.trim()
  if (t === "") return null
  if (t.includes(":")) {
    const parts = t.split(":").map((p) => p.trim())
    if (parts.length === 3) {
      const h = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      const s = parseFloat(parts[2])
      if (
        !Number.isFinite(h) ||
        h < 0 ||
        !Number.isFinite(m) ||
        m < 0 ||
        !Number.isFinite(s) ||
        s < 0
      ) {
        return null
      }
      return h * 3600 + m * 60 + s
    }
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10)
      const s = parseFloat(parts[1])
      if (!Number.isFinite(m) || m < 0 || !Number.isFinite(s) || s < 0) {
        return null
      }
      return m * 60 + s
    }
    return null
  }
  const n = parseFloat(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Format as zero-padded `MM:SS`, or `HH:MM:SS` when ≥ 1 hour.
 * Seconds are rounded to the nearest whole second for display.
 */
export function formatTimeMmSs(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00"
  const secTotal = Math.round(totalSeconds)
  const h = Math.floor(secTotal / 3600)
  const rem = secTotal % 3600
  const m = Math.floor(rem / 60)
  const s = rem % 60
  const pad2 = (n: number) => String(n).padStart(2, "0")
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
  return `${pad2(m)}:${pad2(s)}`
}

const pad3 = (n: number) => String(n).padStart(3, "0")

/**
 * `MM:SS.mmm` or `HH:MM:SS.mmm` (milliseconds after the last colon).
 */
export function formatTimeMmSsMmm(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00.000"
  const whole = Math.floor(totalSeconds)
  let frac = totalSeconds - whole
  if (frac < 0) frac = 0
  let ms = Math.round(frac * 1000)
  let w = whole + Math.floor(ms / 1000)
  ms %= 1000
  if (ms < 0) ms = 0
  const h = Math.floor(w / 3600)
  const rem = w % 3600
  const m = Math.floor(rem / 60)
  const s = rem % 60
  const pad2 = (n: number) => String(n).padStart(2, "0")
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`
  return `${pad2(m)}:${pad2(s)}.${pad3(ms)}`
}
