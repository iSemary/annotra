import React from "react"
import { vi } from "vitest"

vi.mock("react-konva", () => {
  const Stage = ({
    children,
    onMouseDown,
    ...rest
  }: React.PropsWithChildren<
    Record<string, unknown> & {
      onMouseDown?: (e: {
        target: { getStage: () => null; name: () => string }
      }) => void
    }
  >) => (
    <div
      data-testid="konva-stage"
      {...rest}
      onMouseDown={
        onMouseDown
          ? () =>
              onMouseDown({
                target: {
                  getStage: () => null,
                  name: () => "",
                },
              })
          : undefined
      }
    >
      {children}
    </div>
  )
  const Layer = ({ children }: React.PropsWithChildren) => (
    <div data-testid="konva-layer">{children}</div>
  )
  const KonvaImage = ({ children }: React.PropsWithChildren) => (
    <div data-testid="konva-image">{children}</div>
  )
  const Rect = ({ children }: React.PropsWithChildren) => (
    <div data-testid="konva-rect">{children}</div>
  )
  const Transformer = React.forwardRef(function Transformer(
    _props: Record<string, unknown>,
    ref: React.Ref<{ nodes: () => void; getLayer: () => { batchDraw: () => void } }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      nodes: vi.fn(),
      getLayer: () => ({ batchDraw: vi.fn() }),
    }))
    return <div data-testid="konva-transformer" />
  })
  return {
    Stage,
    Layer,
    Image: KonvaImage,
    Rect,
    Transformer,
  }
})
