import { vi } from "vitest"

vi.mock("three", async (importOriginal) => {
  const THREE = await importOriginal<typeof import("three")>()
  class WebGLRenderer {
    domElement = document.createElement("canvas")
    setSize = vi.fn()
    setPixelRatio = vi.fn()
    outputColorSpace = ""
    render = vi.fn()
    dispose = vi.fn()
  }
  return { ...THREE, WebGLRenderer }
})

vi.mock("three/examples/jsm/libs/stats.module.js", () => ({
  default: class {
    dom = document.createElement("div")
    begin = vi.fn()
    end = vi.fn()
  },
}))

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", async () => {
  const THREE = await vi.importActual<typeof import("three")>("three")
  return {
    GLTFLoader: class {
      parse(
        _buffer: ArrayBuffer,
        _path: string,
        onLoad: (g: { scene: unknown }) => void,
      ) {
        onLoad({ scene: new THREE.Group() })
      }
    },
  }
})
