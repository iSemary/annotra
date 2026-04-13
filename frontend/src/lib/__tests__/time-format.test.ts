import { describe, expect, it } from "vitest"

import {
  formatTimeMmSs,
  formatTimeMmSsMmm,
  parseTimeToSeconds,
} from "@/lib/time-format"

describe("time-format", () => {
  it("parses MM:SS and plain seconds", () => {
    expect(parseTimeToSeconds("00:02")).toBe(2)
    expect(parseTimeToSeconds("01:30")).toBe(90)
    expect(parseTimeToSeconds("2")).toBe(2)
    expect(parseTimeToSeconds("2.5")).toBe(2.5)
    expect(parseTimeToSeconds("")).toBeNull()
  })

  it("formats as MM:SS or HH:MM:SS", () => {
    expect(formatTimeMmSs(2)).toBe("00:02")
    expect(formatTimeMmSs(90)).toBe("01:30")
    expect(formatTimeMmSs(3600)).toBe("01:00:00")
  })

  it("formats with milliseconds", () => {
    expect(formatTimeMmSsMmm(0)).toBe("00:00.000")
    expect(formatTimeMmSsMmm(2.5)).toBe("00:02.500")
    expect(formatTimeMmSsMmm(90.012)).toBe("01:30.012")
    expect(formatTimeMmSsMmm(3600)).toBe("01:00:00.000")
  })
})
