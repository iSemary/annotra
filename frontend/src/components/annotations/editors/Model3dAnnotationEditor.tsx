"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import Stats from "three/examples/jsm/libs/stats.module.js"
import { Loader2, MapPin, MousePointer2, Plus, Square, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  patchAnnotation,
  type AnnotationAsset,
  type AnnotationRow,
} from "@/lib/annotation-assets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type Tool = "select" | "point" | "box"

function isGltfUrl(url: string): boolean {
  try {
    const p = new URL(url, "http://local.invalid").pathname.toLowerCase()
    return p.endsWith(".glb") || p.endsWith(".gltf")
  } catch {
    return false
  }
}

function vecFromPayload(v: unknown): THREE.Vector3 {
  if (v && typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>
    return new THREE.Vector3(
      Number(o.x) || 0,
      Number(o.y) || 0,
      Number(o.z) || 0,
    )
  }
  return new THREE.Vector3()
}

function quatFromPayload(r: unknown): THREE.Quaternion {
  if (r && typeof r === "object" && r !== null) {
    const o = r as Record<string, unknown>
    return new THREE.Quaternion(
      Number(o.x) || 0,
      Number(o.y) || 0,
      Number(o.z) || 0,
      Number(o.w) !== undefined ? Number(o.w) : 1,
    ).normalize()
  }
  return new THREE.Quaternion(0, 0, 0, 1)
}

async function loadGltfFromUrl(url: string): Promise<THREE.Group> {
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("auth_token")
      : null
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  })
  if (!res.ok) throw new Error(`Failed to load model (${res.status})`)
  const buffer = await res.arrayBuffer()
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    try {
      loader.parse(buffer, "", (gltf) => resolve(gltf.scene), reject)
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

function setControlsVisible(ctrl: TransformControls | null, visible: boolean) {
  if (!ctrl) return
  ctrl.getHelper().visible = visible
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.geometry) out.push(o)
  })
  return out
}

/** Show FPS / MS / MB panels side-by-side (Stats.js normally toggles one per click). */
function layoutStatsPanelsInRow(statsDom: HTMLElement) {
  statsDom.style.display = "flex"
  statsDom.style.flexDirection = "row"
  statsDom.style.flexWrap = "wrap"
  statsDom.style.gap = "6px"
  statsDom.style.alignItems = "flex-start"
  statsDom.style.cursor = "default"
  for (let i = 0; i < statsDom.children.length; i++) {
    const c = statsDom.children[i] as HTMLElement
    c.style.display = "block"
  }
}

function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  margin = 1.25,
) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.01)
  const dist = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * margin
  camera.position.set(center.x + dist * 0.6, center.y + dist * 0.45, center.z + dist * 0.6)
  camera.near = Math.max(dist / 1000, 0.01)
  camera.far = dist * 100
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
}

export function Model3dAnnotationEditor({
  asset,
  readOnly = false,
}: {
  asset: AnnotationAsset
  readOnly?: boolean
}) {
  const statsMountRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const transformRef = useRef<TransformControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const annRootRef = useRef<THREE.Group | null>(null)
  const rayMeshesRef = useRef<THREE.Mesh[]>([])
  const rafRef = useRef<number>(0)
  const pointScaleRef = useRef(0.05)
  /** Latest attach callback; rebuild clears meshes so we re-attach after new groups exist. */
  const attachTransformRef = useRef<() => void>(() => {})

  const [rows, setRows] = useState<AnnotationRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingModel, setLoadingModel] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [labelEdit, setLabelEdit] = useState("")
  const [hx, setHx] = useState("0.25")
  const [hy, setHy] = useState("0.25")
  const [hz, setHz] = useState("0.25")
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">(
    "translate",
  )

  const refreshRows = useCallback(async () => {
    setLoadingList(true)
    try {
      const items = await listAnnotations(asset.id)
      setRows(items)
    } catch {
      toast.error("Failed to load annotations")
    } finally {
      setLoadingList(false)
    }
  }, [asset.id])

  useEffect(() => {
    void refreshRows()
  }, [refreshRows])

  const attachTransformToSelected = useCallback(() => {
    const transform = transformRef.current
    const annRoot = annRootRef.current
    if (!transform || !annRoot || !selectedId || readOnly) {
      if (transform) {
        transform.detach()
        setControlsVisible(transform, false)
      }
      return
    }
    let target: THREE.Object3D | null = null
    annRoot.traverse((o) => {
      if (o.userData.annotationId === selectedId && o.userData.kind === "box")
        target = o
    })
    if (target) {
      transform.attach(target)
      transform.setMode(transformMode)
      setControlsVisible(transform, true)
    } else {
      transform.detach()
      setControlsVisible(transform, false)
    }
  }, [selectedId, transformMode, readOnly])

  useEffect(() => {
    attachTransformRef.current = attachTransformToSelected
  }, [attachTransformToSelected])

  const rebuildAnnotationMeshes = useCallback(() => {
    const annRoot = annRootRef.current
    if (!annRoot) return

    const tc = transformRef.current
    if (tc?.object) {
      tc.detach()
    }

    while (annRoot.children.length) {
      const c = annRoot.children[0]
      annRoot.remove(c)
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose()
          const m = o.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else if (m instanceof THREE.Material) m.dispose()
        }
      })
    }

    const scale = pointScaleRef.current
    for (const row of rows) {
      if (row.annotation_kind === "model_3d_point") {
        const p = row.payload as { label?: string; position?: unknown }
        const pos = vecFromPayload(p.position)
        const geom = new THREE.SphereGeometry(scale, 16, 16)
        const mat = new THREE.MeshStandardMaterial({
          color: row.id === selectedId ? 0xff6600 : 0x22c55e,
          emissive: row.id === selectedId ? 0x331100 : 0x002200,
        })
        const mesh = new THREE.Mesh(geom, mat)
        mesh.position.copy(pos)
        mesh.userData.annotationId = row.id
        mesh.userData.kind = "point"
        annRoot.add(mesh)
      } else if (row.annotation_kind === "model_3d_oriented_box") {
        const p = row.payload as {
          center?: unknown
          half_extents?: unknown
          rotation?: unknown
        }
        const center = vecFromPayload(p.center)
        const he = vecFromPayload(p.half_extents)
        const q = quatFromPayload(p.rotation)
        const w = Math.max(he.x * 2, 1e-6)
        const h = Math.max(he.y * 2, 1e-6)
        const d = Math.max(he.z * 2, 1e-6)
        const geom = new THREE.BoxGeometry(w, h, d)
        const mat = new THREE.MeshStandardMaterial({
          color: row.id === selectedId ? 0x6366f1 : 0x3b82f6,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        })
        const mesh = new THREE.Mesh(geom, mat)
        const g = new THREE.Group()
        g.add(mesh)
        g.position.copy(center)
        g.quaternion.copy(q)
        g.userData.annotationId = row.id
        g.userData.kind = "box"
        annRoot.add(g)
      }
    }

    queueMicrotask(() => {
      attachTransformRef.current()
    })
  }, [rows, selectedId])

  useEffect(() => {
    rebuildAnnotationMeshes()
  }, [rebuildAnnotationMeshes])

  useEffect(() => {
    attachTransformToSelected()
  }, [attachTransformToSelected, rows])

  useEffect(() => {
    const el = wrapRef.current
    const statsHost = statsMountRef.current
    if (!el || !statsHost) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f1419)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      50,
      el.clientWidth / Math.max(el.clientHeight, 1),
      0.01,
      1e6,
    )
    camera.position.set(2, 2, 4)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, Math.max(el.clientHeight, 1))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const stats = new Stats()
    stats.dom.style.position = "relative"
    stats.dom.style.top = "0"
    stats.dom.style.left = "0"
    stats.dom.style.zIndex = ""
    layoutStatsPanelsInRow(stats.dom)
    const blockStatsClickCycle = (ev: Event) => {
      ev.preventDefault()
      ev.stopImmediatePropagation()
    }
    stats.dom.addEventListener("click", blockStatsClickCycle, true)
    statsHost.appendChild(stats.dom)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controlsRef.current = controls

    const amb = new THREE.AmbientLight(0xffffff, 0.55)
    scene.add(amb)
    const dir = new THREE.DirectionalLight(0xffffff, 1.1)
    dir.position.set(4, 10, 6)
    scene.add(dir)

    const annRoot = new THREE.Group()
    annRoot.name = "annotations"
    scene.add(annRoot)
    annRootRef.current = annRoot

    const transform = new TransformControls(camera, renderer.domElement)
    transform.addEventListener("dragging-changed", (e) => {
      controls.enabled = !e.value
    })
    transform.setMode("translate")
    scene.add(transform.getHelper())
    setControlsVisible(transform, false)
    transformRef.current = transform

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current || !cameraRef.current || !rendererRef.current) return
      const w = wrapRef.current.clientWidth
      const h = Math.max(wrapRef.current.clientHeight, 1)
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(w, h)
    })
    ro.observe(el)

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      stats.begin()
      controls.update()
      renderer.render(scene, camera)
      stats.end()
    }
    tick()

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      stats.dom.remove()
      transform.dispose()
      controls.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      scene.clear()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
      transformRef.current = null
      modelRef.current = null
      annRootRef.current = null
      rayMeshesRef.current = []
    }
  }, [])

  const url = asset.primary_media_url?.trim() ?? ""
  const canViewGltf = url && isGltfUrl(url)

  useEffect(() => {
    if (!canViewGltf || !sceneRef.current) return

    let cancelled = false
    const scene = sceneRef.current

    const prev = modelRef.current
    if (prev) {
      scene.remove(prev)
      prev.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose()
          const m = o.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else m?.dispose()
        }
      })
      modelRef.current = null
      rayMeshesRef.current = []
    }

    setLoadingModel(true)
    setModelError(null)

    void (async () => {
      try {
        const group = await loadGltfFromUrl(url)
        if (cancelled) return
        scene.add(group)
        modelRef.current = group
        const box = new THREE.Box3().setFromObject(group)
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z, 0.01)
        pointScaleRef.current = maxDim * 0.015
        rayMeshesRef.current = collectMeshes(group)
        const cam = cameraRef.current
        const ctl = controlsRef.current
        if (cam && ctl) fitCameraToObject(cam, ctl, group)
        rebuildAnnotationMeshes()
      } catch (e) {
        if (!cancelled)
          setModelError(e instanceof Error ? e.message : "Failed to load GLB/glTF")
      } finally {
        if (!cancelled) setLoadingModel(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [canViewGltf, url, rebuildAnnotationMeshes])

  useEffect(() => {
    const c = controlsRef.current
    if (!c) return
    if (readOnly) {
      c.enabled = true
      return
    }
    c.enabled = tool !== "point"
  }, [tool, readOnly])

  useEffect(() => {
    const transform = transformRef.current
    if (!transform || readOnly) return

    let t: ReturnType<typeof setTimeout> | undefined
    const onChange = () => {
      const attached = transform.object as THREE.Group | null
      if (!attached || attached.userData.kind !== "box") return
      const aid = attached.userData.annotationId as string
      const pos = attached.position
      const quat = attached.quaternion
      clearTimeout(t)
      t = setTimeout(() => {
        void patchAnnotation(asset.id, aid, {
          annotation_kind: "model_3d_oriented_box",
          payload: {
            rotation: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
            center: { x: pos.x, y: pos.y, z: pos.z },
          },
        })
          .then((row) => {
            setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))
          })
          .catch(() => toast.error("Failed to save box transform"))
      }, 250)
    }
    transform.addEventListener("change", onChange)
    return () => {
      transform.removeEventListener("change", onChange)
      clearTimeout(t)
    }
  }, [asset.id, readOnly])

  useEffect(() => {
    const canvas = rendererRef.current?.domElement
    if (!canvas || readOnly) return

    let downX = 0
    let downY = 0

    const onPointerDown = (ev: PointerEvent) => {
      if (tool !== "point") return
      if (ev.button !== 0) return
      const transform = transformRef.current
      if (transform?.dragging) return

      const rect = canvas.getBoundingClientRect()
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      const raycaster = new THREE.Raycaster()
      const camera = cameraRef.current
      if (!camera) return
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

      const hits = raycaster.intersectObjects(rayMeshesRef.current, true)
      if (!hits.length) return
      ev.preventDefault()
      ev.stopPropagation()
      const p = hits[0].point
      void createAnnotation(asset.id, {
        annotation_kind: "model_3d_point",
        payload: {
          label: "Point",
          position: { x: p.x, y: p.y, z: p.z },
        },
      })
        .then((row) => {
          setRows((prev) => [...prev, row])
          toast.success("Point created")
        })
        .catch(() => toast.error("Failed to create point"))
    }

    const onSelectDown = (ev: PointerEvent) => {
      if (tool !== "select") return
      if (ev.button !== 0) return
      downX = ev.clientX
      downY = ev.clientY
    }

    const onSelectUp = (ev: PointerEvent) => {
      if (tool !== "select") return
      if (ev.button !== 0) return
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) return
      const transform = transformRef.current
      if (transform?.dragging) return

      const camera = cameraRef.current
      const annRoot = annRootRef.current
      if (!camera || !annRoot) return
      const rect = canvas.getBoundingClientRect()
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
      const pickMeshes: THREE.Mesh[] = []
      annRoot.traverse((o) => {
        if (o instanceof THREE.Mesh) pickMeshes.push(o)
      })
      const hits = raycaster.intersectObjects(pickMeshes, true)
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object
        while (o && !o.userData.annotationId) o = o.parent
        const id = o?.userData.annotationId as string | undefined
        setSelectedId(id ?? null)
      } else setSelectedId(null)
    }

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointerdown", onSelectDown)
    canvas.addEventListener("pointerup", onSelectUp)
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointerdown", onSelectDown)
      canvas.removeEventListener("pointerup", onSelectUp)
    }
  }, [tool, asset.id, readOnly])

  const onAddBox = () => {
    void createAnnotation(asset.id, {
      annotation_kind: "model_3d_oriented_box",
      payload: {
        label: "Box",
        center: { x: 0, y: 0, z: 0 },
        half_extents: { x: 0.25, y: 0.25, z: 0.25 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    })
      .then((row) => {
        setRows((prev) => [...prev, row])
        setSelectedId(row.id)
        setLabelEdit("Box")
        setHx("0.25")
        setHy("0.25")
        setHz("0.25")
        toast.success("Box created")
      })
      .catch(() => toast.error("Failed to create box"))
  }

  const selectedRow = rows.find((r) => r.id === selectedId)

  useEffect(() => {
    if (!selectedRow) {
      setLabelEdit("")
      return
    }
    const p = selectedRow.payload as { label?: string }
    setLabelEdit(String(p.label ?? ""))
    if (selectedRow.annotation_kind === "model_3d_oriented_box") {
      const pp = selectedRow.payload as { half_extents?: unknown }
      const he = vecFromPayload(pp.half_extents)
      setHx(String(he.x))
      setHy(String(he.y))
      setHz(String(he.z))
    }
  }, [selectedRow])

  const saveLabel = () => {
    if (!selectedId || !selectedRow || readOnly) return
    const kind = selectedRow.annotation_kind
    void patchAnnotation(asset.id, selectedId, {
      annotation_kind: kind,
      payload: { label: labelEdit.trim() || "Untitled" },
    })
      .then((row) => setRows((prev) => prev.map((r) => (r.id === row.id ? row : r))))
      .catch(() => toast.error("Failed to save label"))
  }

  const saveHalfExtents = () => {
    if (!selectedId || selectedRow?.annotation_kind !== "model_3d_oriented_box")
      return
    const x = parseFloat(hx)
    const y = parseFloat(hy)
    const z = parseFloat(hz)
    if (![x, y, z].every((n) => Number.isFinite(n) && n > 0)) {
      toast.error("Half-extents must be positive numbers")
      return
    }
    void patchAnnotation(asset.id, selectedId, {
      annotation_kind: "model_3d_oriented_box",
      payload: { half_extents: { x, y, z } },
    })
      .then((row) => setRows((prev) => prev.map((r) => (r.id === row.id ? row : r))))
      .catch(() => toast.error("Failed to save size"))
  }

  const onDeleteSelected = () => {
    if (!selectedId || readOnly) return
    void deleteAnnotation(asset.id, selectedId)
      .then(() => {
        setRows((prev) => prev.filter((r) => r.id !== selectedId))
        setSelectedId(null)
        toast.success("Deleted")
      })
      .catch(() => toast.error("Failed to delete"))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row">
      {!readOnly && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border pb-2 md:w-44 md:flex-col md:items-stretch md:border-b-0 md:border-r md:pb-0 md:pr-3">
          <p className="hidden text-xs font-medium text-muted-foreground md:block">
            Tools
          </p>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant={tool === "select" ? "default" : "outline"}
              onClick={() => setTool("select")}
            >
              <MousePointer2 className="mr-1 h-3.5 w-3.5" />
              Select
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tool === "point" ? "default" : "outline"}
              onClick={() => setTool("point")}
              disabled={!canViewGltf || !!modelError}
            >
              <MapPin className="mr-1 h-3.5 w-3.5" />
              Point
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tool === "box" ? "default" : "outline"}
              onClick={() => setTool("box")}
              disabled={!canViewGltf || !!modelError}
            >
              <Square className="mr-1 h-3.5 w-3.5" />
              Box
            </Button>
          </div>
          {tool === "box" && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={onAddBox}
              disabled={!canViewGltf || !!modelError}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add box
            </Button>
          )}
          {selectedRow?.annotation_kind === "model_3d_oriented_box" && (
            <div className="flex w-full gap-1">
              <Button
                type="button"
                size="sm"
                variant={transformMode === "translate" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setTransformMode("translate")}
              >
                Move
              </Button>
              <Button
                type="button"
                size="sm"
                variant={transformMode === "rotate" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setTransformMode("rotate")}
              >
                Rotate
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
        <div
          ref={statsMountRef}
          className="flex shrink-0 flex-wrap items-center gap-1"
        />
        <div className="relative min-h-[280px] min-w-0 flex-1 rounded-md border border-border bg-muted/20">
          <div
            ref={wrapRef}
            className="h-full min-h-[280px] w-full cursor-crosshair"
          />
          {(loadingModel || loadingList) && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {!canViewGltf && url && (
            <p className="absolute bottom-2 left-2 right-2 rounded bg-background/90 p-2 text-xs text-muted-foreground">
              In-browser viewing supports GLB and glTF only. Download the original
              file to use other formats. Annotations are still listed on the right.
            </p>
          )}
          {modelError && (
            <p className="absolute bottom-2 left-2 right-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
              {modelError}
            </p>
          )}
        </div>
      </div>

      <div className="flex max-h-[50vh] w-full shrink-0 flex-col gap-3 overflow-auto border-t border-border pt-2 md:max-h-none md:w-56 md:border-l md:border-t-0 md:pl-3 md:pt-0">
        <p className="text-xs font-medium text-muted-foreground">Annotations</p>
        {rows.length === 0 && !loadingList && (
          <p className="text-sm text-muted-foreground">No annotations yet.</p>
        )}
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-md border px-2 py-1.5 text-left transition-colors",
                  r.id === selectedId
                    ? "border-primary bg-primary/10"
                    : "border-transparent bg-muted/50 hover:bg-muted",
                )}
                onClick={() => setSelectedId(r.id)}
              >
                <span className="font-medium">
                  {(r.payload as { label?: string }).label ?? r.annotation_kind}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {r.annotation_kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selectedId && selectedRow && !readOnly && (
          <div className="space-y-2 border-t border-border pt-2">
            <div className="space-y-1">
              <Label htmlFor="ann-label">Label</Label>
              <Input
                id="ann-label"
                value={labelEdit}
                onChange={(e) => setLabelEdit(e.target.value)}
                onBlur={saveLabel}
              />
            </div>
            {selectedRow.annotation_kind === "model_3d_oriented_box" && (
              <div className="grid grid-cols-3 gap-1">
                <div>
                  <Label className="text-[10px]">hx</Label>
                  <Input
                    value={hx}
                    onChange={(e) => setHx(e.target.value)}
                    onBlur={saveHalfExtents}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">hy</Label>
                  <Input
                    value={hy}
                    onChange={(e) => setHy(e.target.value)}
                    onBlur={saveHalfExtents}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">hz</Label>
                  <Input
                    value={hz}
                    onChange={(e) => setHz(e.target.value)}
                    onBlur={saveHalfExtents}
                  />
                </div>
              </div>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={onDeleteSelected}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
