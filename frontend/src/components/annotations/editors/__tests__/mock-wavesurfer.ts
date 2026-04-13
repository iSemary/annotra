import { vi } from "vitest"

type WsMock = {
  on: (ev: string, fn: (...args: unknown[]) => void) => void
  registerPlugin: ReturnType<typeof vi.fn>
  getDuration: ReturnType<typeof vi.fn>
  getCurrentTime: ReturnType<typeof vi.fn>
  playPause: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  fire: (ev: string, ...args: unknown[]) => void
}

let lastWs: WsMock | null = null

function createWaveSurferMock(): WsMock {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
  const ws: WsMock = {
    on(ev: string, fn: (...args: unknown[]) => void) {
      if (!handlers[ev]) handlers[ev] = []
      handlers[ev].push(fn)
    },
    registerPlugin: vi.fn(),
    getDuration: vi.fn(() => 10),
    getCurrentTime: vi.fn(() => 2.5),
    playPause: vi.fn(),
    destroy: vi.fn(),
    fire(ev: string, ...args: unknown[]) {
      handlers[ev]?.forEach((f) => f(...args))
    },
  }
  lastWs = ws
  return ws
}

vi.mock("wavesurfer.js", () => ({
  default: {
    create: vi.fn(() => createWaveSurferMock()),
  },
}))

vi.mock("wavesurfer.js/dist/plugins/regions.esm.js", () => ({
  default: {
    create: vi.fn(() => ({
      addRegion: vi.fn(),
      getRegions: vi.fn(() => []),
      on: vi.fn(),
      enableDragSelection: vi.fn(() => () => {}),
    })),
  },
}))

export function getLastWaveSurfer() {
  return lastWs
}

export function resetWaveSurferHarness() {
  lastWs = null
}
