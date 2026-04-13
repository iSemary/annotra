"""SAM 2 image / video inference (Transformers mask-generation + video session)."""

from __future__ import annotations

import io
import logging
import tempfile
from typing import Any

from core.config import Settings
from services.ml_inference.mappers import mask_to_bbox, model_meta, nms_bboxes
from services.ml_inference.runtime_env import (
    ml_annotation_source,
    transformers_local_kw,
    transformers_token,
)

log = logging.getLogger("annotra.ml.sam2")


def _tf_pretrained_kwargs(settings: Settings) -> dict:
    d = dict(transformers_local_kw(settings))
    tok = transformers_token(settings)
    if tok:
        d["token"] = tok
    return d


def _mask_gen_pipeline(settings: Settings, device: int):
    from transformers import pipeline

    kw: dict = {
        "model": settings.SAM2_MODEL_ID,
        "device": device,
        "model_kwargs": dict(transformers_local_kw(settings)),
    }
    tok = transformers_token(settings)
    if tok:
        kw["token"] = tok
    return pipeline("mask-generation", **kw)


def _device_index() -> int:
    try:
        import torch

        return 0 if torch.cuda.is_available() else -1
    except Exception:
        return -1


def _pil_image(image_bytes: bytes):
    from PIL import Image

    return Image.open(io.BytesIO(image_bytes)).convert("RGB")


def run_sam2_image(image_bytes: bytes, settings: Settings) -> list[dict[str, Any]]:
    """Return image_bbox-compatible payloads (with model_meta keys)."""
    meta = model_meta(ml_annotation_source(settings), settings.SAM2_MODEL_ID)
    if settings.ML_PIPELINE_DRY_RUN:
        return [
            {
                "label": "dry_run_segment",
                "bbox": {"x": 4.0, "y": 4.0, "w": 64.0, "h": 64.0},
                **meta,
            }
        ]

    try:
        import numpy as np

        device = _device_index()
        try:
            gen = _mask_gen_pipeline(settings, device)
        except ImportError:
            log.warning("sam2_image_transformers_missing")
            return [
                {
                    "label": "ml_deps_missing",
                    "bbox": {"x": 4.0, "y": 4.0, "w": 64.0, "h": 64.0},
                    **meta,
                }
            ]
        image = _pil_image(image_bytes)
        ppb = max(16, min(int(settings.SAM2_POINT_GRID_STRIDE), 256))
        outputs = gen(image, points_per_batch=ppb)
        masks = outputs.get("masks") or outputs.get("pred_masks")
        if masks is None:
            log.warning("sam2_image_no_masks")
            return [
                {
                    "label": "fallback_segment",
                    "bbox": {"x": 0.0, "y": 0.0, "w": 32.0, "h": 32.0},
                    **meta,
                }
            ]

        candidates: list[tuple[dict[str, float], dict[str, Any]]] = []
        for i, m in enumerate(masks):
            arr = np.asarray(m)
            if arr.ndim > 2:
                arr = arr.squeeze()
            if arr.ndim != 2:
                continue
            bbox = mask_to_bbox(arr)
            if bbox is None or bbox["w"] < 2 or bbox["h"] < 2:
                continue
            score = float(np.mean(arr)) if arr.dtype != bool else float(np.mean(arr > 0.5))
            candidates.append(
                (
                    bbox,
                    {
                        "label": f"segment_{i}",
                        "score": score,
                        **meta,
                    },
                )
            )

        kept = nms_bboxes(candidates, iou_threshold=0.55)[: int(settings.SAM2_MAX_MASKS)]
        out: list[dict[str, Any]] = []
        for bbox, rest in kept:
            label = str(rest.pop("label", "segment"))
            rest.pop("score", None)
            out.append({"label": label, "bbox": bbox, **rest})
        if not out:
            out.append(
                {
                    "label": "empty_fallback",
                    "bbox": {"x": 0.0, "y": 0.0, "w": 16.0, "h": 16.0},
                    **meta,
                }
            )
        return out
    except Exception:
        log.exception("sam2_image_failed")
        return [
            {
                "label": "error_fallback",
                "bbox": {"x": 0.0, "y": 0.0, "w": 16.0, "h": 16.0},
                **meta,
            }
        ]


def _video_frames_from_bytes(video_bytes: bytes, max_frames: int) -> list:
    import cv2
    import numpy as np
    from PIL import Image

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as tmp:
        tmp.write(video_bytes)
        tmp.flush()
        cap = cv2.VideoCapture(tmp.name)
        frames: list[Any] = []
        try:
            while len(frames) < max_frames:
                ok, bgr = cap.read()
                if not ok:
                    break
                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                frames.append(Image.fromarray(rgb))
        finally:
            cap.release()
        if not frames:
            raise RuntimeError("no_video_frames")
        return frames


def run_sam2_video(video_bytes: bytes, settings: Settings) -> tuple[list[dict[str, Any]], int]:
    """
    Returns (annotation_payloads, frame_count).
    Prefers video_track rows; falls back to video_frame_bbox if video path fails.
    """
    meta = model_meta(ml_annotation_source(settings), settings.SAM2_MODEL_ID)
    max_f = max(1, int(settings.VIDEO_MAX_FRAMES))

    if settings.ML_PIPELINE_DRY_RUN:
        return (
            [
                {
                    "annotation_kind": "video_track",
                    "payload": {
                        "object_id": "dry_run_obj",
                        "label": "dry_run",
                        "w": 40.0,
                        "h": 30.0,
                        "frames": [
                            {"frame": 0, "x": 10.0, "y": 20.0},
                            {"frame": 1, "x": 12.0, "y": 21.0},
                        ],
                        **meta,
                    },
                }
            ],
            2,
        )

    try:
        import numpy as np
        import torch
        try:
            from transformers import Sam2VideoModel, Sam2VideoProcessor
        except ImportError:
            log.warning("sam2_video_transformers_missing")
            raise RuntimeError("transformers_missing") from None

        frames = _video_frames_from_bytes(video_bytes, max_f)
        frame_count = len(frames)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if device == "cuda" else torch.float32

        tf_kw = _tf_pretrained_kwargs(settings)
        processor = Sam2VideoProcessor.from_pretrained(settings.SAM2_MODEL_ID, **tf_kw)
        model = Sam2VideoModel.from_pretrained(settings.SAM2_MODEL_ID, **tf_kw).to(
            device,
            dtype=dtype,
        )
        model.eval()

        # Proposals on first frame via mask-generation
        device_i = _device_index()
        gen = _mask_gen_pipeline(settings, device_i)
        ppb = max(16, min(int(settings.SAM2_POINT_GRID_STRIDE), 256))
        mg = gen(frames[0], points_per_batch=ppb)
        masks = mg.get("masks") or mg.get("pred_masks") or []

        centroids: list[tuple[float, float]] = []
        for m in masks[: int(settings.SAM2_MAX_MASKS)]:
            arr = np.asarray(m)
            if arr.ndim > 2:
                arr = arr.squeeze()
            if arr.ndim != 2:
                continue
            ys, xs = np.where(arr > 0.5 if arr.dtype != bool else arr)
            if xs.size == 0:
                continue
            centroids.append((float(xs.mean()), float(ys.mean())))
        if not centroids:
            centroids = [(float(frames[0].size[0]) / 2, float(frames[0].size[1]) / 2)]

        obj_ids = list(range(1, len(centroids) + 1))
        input_points = [[[[cx, cy]] for cx, cy in centroids]]
        input_labels = [[[1] for _ in centroids]]

        inference_session = processor.init_video_session(
            video=frames,
            inference_device=device,
            torch_dtype=dtype,
        )
        processor.add_inputs_to_inference_session(
            inference_session=inference_session,
            frame_idx=0,
            obj_ids=obj_ids,
            input_points=input_points,
            input_labels=input_labels,
        )

        per_obj_frames: dict[int, list[dict[str, float]]] = {oid: [] for oid in obj_ids}
        h, w = inference_session.video_height, inference_session.video_width

        with torch.no_grad():
            for sam2_video_output in model.propagate_in_video_iterator(inference_session):
                raw_idx = getattr(sam2_video_output, "frame_idx", None)
                if raw_idx is None:
                    fidx = getattr(sam2_video_output, "frame_indices", None)
                    idx = int(fidx[0]) if fidx is not None and len(fidx) > 0 else 0
                else:
                    idx = int(raw_idx)
                vm = processor.post_process_masks(
                    [sam2_video_output.pred_masks],
                    original_sizes=[[h, w]],
                    binarize=False,
                )[0]
                vm_np = vm.cpu().float().numpy()
                for i, oid in enumerate(inference_session.obj_ids):
                    if i >= vm_np.shape[0]:
                        continue
                    sl = vm_np[i, 0]
                    bbox = mask_to_bbox(sl)
                    if bbox is None:
                        continue
                    per_obj_frames[oid].append(
                        {
                            "frame": idx,
                            "x": bbox["x"],
                            "y": bbox["y"],
                        }
                    )

        tracks: list[dict[str, Any]] = []
        for oid in obj_ids:
            pts = per_obj_frames.get(oid, [])
            if len(pts) < 1:
                continue
            # stable w/h from first bbox-like estimate
            first = pts[0]
            # recompute w,h from first frame mask slice — approximate from track spread
            w_box, h_box = 32.0, 32.0
            tracks.append(
                {
                    "annotation_kind": "video_track",
                    "payload": {
                        "object_id": f"obj_{oid}",
                        "label": f"track_{oid}",
                        "w": w_box,
                        "h": h_box,
                        "frames": pts,
                        **meta,
                    },
                }
            )

        if not tracks:
            raise RuntimeError("no_tracks")

        return tracks, frame_count
    except Exception:
        log.exception("sam2_video_failed_fallback_frames")
        # Per-frame image SAM2 (independent bboxes)
        try:
            frames = _video_frames_from_bytes(video_bytes, max_f)
            device_i = _device_index()
            gen = _mask_gen_pipeline(settings, device_i)
            ppb = max(16, min(int(settings.SAM2_POINT_GRID_STRIDE), 256))
            out: list[dict[str, Any]] = []
            for fi, fr in enumerate(frames):
                mg = gen(fr, points_per_batch=ppb)
                masks = mg.get("masks") or mg.get("pred_masks") or []
                for j, m in enumerate(masks[:3]):
                    import numpy as np

                    arr = np.asarray(m)
                    if arr.ndim > 2:
                        arr = arr.squeeze()
                    bbox = mask_to_bbox(arr)
                    if bbox is None:
                        continue
                    out.append(
                        {
                            "annotation_kind": "video_frame_bbox",
                            "payload": {
                                "frame": fi,
                                "label": f"f{fi}_m{j}",
                                "bbox": bbox,
                                **meta,
                            },
                        }
                    )
            if not out:
                raise RuntimeError("no_frame_boxes")
            return out, len(frames)
        except Exception:
            log.exception("sam2_video_frame_fallback_failed")
            return (
                [
                    {
                        "annotation_kind": "video_frame_bbox",
                        "payload": {
                            "frame": 0,
                            "label": "error_fallback",
                            "bbox": {"x": 0.0, "y": 0.0, "w": 16.0, "h": 16.0},
                            **meta,
                        },
                    }
                ],
                1,
            )
