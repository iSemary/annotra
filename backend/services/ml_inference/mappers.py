from __future__ import annotations

from typing import Any


def model_meta(source: str = "hf_auto", model_id: str | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"source": source}
    if model_id:
        out["model_id"] = model_id
    return out


def mask_to_bbox(mask_2d) -> dict[str, float] | None:
    """Binary or float mask (H, W) -> bbox dict x,y,w,h in pixel coords."""
    try:
        import numpy as np

        m = np.asarray(mask_2d)
        if m.ndim != 2:
            return None
        if m.dtype != bool:
            m = m > 0.5
        ys, xs = np.where(m)
        if xs.size == 0:
            return None
        x0, x1 = int(xs.min()), int(xs.max())
        y0, y1 = int(ys.min()), int(ys.max())
        return {
            "x": float(x0),
            "y": float(y0),
            "w": float(x1 - x0 + 1),
            "h": float(y1 - y0 + 1),
        }
    except Exception:
        return None


def iou_bbox(a: dict[str, float], b: dict[str, float]) -> float:
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    ix0, iy0 = max(a["x"], b["x"]), max(a["y"], b["y"])
    ix1, iy1 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix1 - ix0), max(0.0, iy1 - iy0)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = a["w"] * a["h"]
    area_b = b["w"] * b["h"]
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def nms_bboxes(
    items: list[tuple[dict[str, float], dict[str, Any]]],
    iou_threshold: float = 0.5,
) -> list[tuple[dict[str, float], dict[str, Any]]]:
    """Each item is (bbox, rest_payload); keep highest score if present else order."""
    if not items:
        return []

    def score(it: tuple[dict[str, float], dict[str, Any]]) -> float:
        return float(it[1].get("score", 0.0))

    sorted_items = sorted(items, key=score, reverse=True)
    kept: list[tuple[dict[str, float], dict[str, Any]]] = []
    for bbox, meta in sorted_items:
        if any(iou_bbox(bbox, k[0]) > iou_threshold for k in kept):
            continue
        kept.append((bbox, meta))
    return kept
