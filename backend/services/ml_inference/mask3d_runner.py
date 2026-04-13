"""
Geometric instance segmentation on meshes (surface point sample + DBSCAN + PCA OBB).

Full JonasSchult/Mask3D requires ScanNet-style training and checkpoints; this path
delivers valid `model_3d_oriented_box` annotations without that dependency.
"""

from __future__ import annotations

import io
import logging
from typing import Any

from core.config import Settings
from services.ml_inference.mappers import model_meta
from services.ml_inference.runtime_env import ml_annotation_source

log = logging.getLogger("annotra.ml.mask3d")


def _load_mesh_points(mesh_bytes: bytes, n: int):
    import numpy as np
    import trimesh

    bio = io.BytesIO(mesh_bytes)
    loaded = trimesh.load(bio, process=False)
    if isinstance(loaded, trimesh.Scene):
        if not loaded.geometry:
            raise ValueError("empty_scene")
        mesh = trimesh.util.concatenate(tuple(loaded.geometry.values()))
    else:
        mesh = loaded
    pts, _face_idx = trimesh.sample.sample_surface(mesh, n)
    return np.asarray(pts, dtype=np.float64)


def _obb_from_points(pts: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray] | None:
    """Return center (3,), half_extents (3,), quaternion xyzw for rotation to world."""
    if pts.shape[0] < 4:
        return None
    from scipy.spatial.transform import Rotation

    center = pts.mean(axis=0)
    x = pts - center
    cov = (x.T @ x) / max(1, x.shape[0] - 1)
    evals, evecs = np.linalg.eigh(cov)
    order = np.argsort(evals)[::-1]
    axes = evecs[:, order]
    # Ensure right-handed frame
    if np.linalg.det(axes) < 0:
        axes[:, 2] *= -1
    proj = x @ axes
    mn = proj.min(axis=0)
    mx = proj.max(axis=0)
    half = (mx - mn) / 2.0 + 1e-4
    center_local = (mn + mx) / 2.0
    center_w = center + axes @ center_local
    rot = Rotation.from_matrix(axes)
    qx, qy, qz, qw = rot.as_quat()
    half_w = half
    return center_w, half_w, np.array([qx, qy, qz, qw], dtype=np.float64)


def run_mask3d_mesh(mesh_bytes: bytes, settings: Settings) -> list[dict[str, Any]]:
    meta = model_meta(ml_annotation_source(settings), "mask3d_geometric")
    if settings.ML_PIPELINE_DRY_RUN:
        return [
            {
                "label": "dry_run_box",
                "center": {"x": 0.0, "y": 0.0, "z": 0.0},
                "half_extents": {"x": 0.2, "y": 0.2, "z": 0.2},
                "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
                **meta,
            }
        ]

    try:
        import numpy as np
        try:
            from sklearn.cluster import DBSCAN
        except ImportError:
            log.warning("mask3d_sklearn_missing")
            return [
                {
                    "label": "ml_deps_missing",
                    "center": {"x": 0.0, "y": 0.0, "z": 0.0},
                    "half_extents": {"x": 0.1, "y": 0.1, "z": 0.1},
                    "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
                    **meta,
                }
            ]

        n = max(4096, int(settings.MASK3D_POINT_SAMPLE_COUNT))
        pts = _load_mesh_points(mesh_bytes, n)
        if pts.shape[0] < 50:
            raise ValueError("too_few_points")

        span = pts.max(axis=0) - pts.min(axis=0)
        diag = float(np.linalg.norm(span))
        eps = max(diag / 40.0, 1e-6)

        sample_idx = np.random.choice(pts.shape[0], min(20000, pts.shape[0]), replace=False)
        labels = DBSCAN(eps=eps, min_samples=max(5, int(settings.MASK3D_MIN_CLUSTER_POINTS // 8))).fit_predict(
            pts[sample_idx]
        )
        full_labels = np.full(pts.shape[0], -1, dtype=int)
        full_labels[sample_idx] = labels

        out: list[dict[str, Any]] = []
        for lab in sorted(set(full_labels)):
            if lab < 0:
                continue
            cluster = pts[full_labels == lab]
            if cluster.shape[0] < int(settings.MASK3D_MIN_CLUSTER_POINTS):
                continue
            obb = _obb_from_points(cluster)
            if obb is None:
                continue
            c, he, quat = obb
            out.append(
                {
                    "label": f"instance_{lab}",
                    "center": {"x": float(c[0]), "y": float(c[1]), "z": float(c[2])},
                    "half_extents": {
                        "x": float(he[0]),
                        "y": float(he[1]),
                        "z": float(he[2]),
                    },
                    "rotation": {
                        "x": float(quat[0]),
                        "y": float(quat[1]),
                        "z": float(quat[2]),
                        "w": float(quat[3]),
                    },
                    **meta,
                }
            )
            if len(out) >= 32:
                break

        if not out:
            obb = _obb_from_points(pts)
            if obb:
                c, he, quat = obb
                out.append(
                    {
                        "label": "whole_mesh",
                        "center": {"x": float(c[0]), "y": float(c[1]), "z": float(c[2])},
                        "half_extents": {
                            "x": float(he[0]),
                            "y": float(he[1]),
                            "z": float(he[2]),
                        },
                        "rotation": {
                            "x": float(quat[0]),
                            "y": float(quat[1]),
                            "z": float(quat[2]),
                            "w": float(quat[3]),
                        },
                        **meta,
                    }
                )
        return out
    except Exception:
        log.exception("mask3d_geometric_failed")
        return [
            {
                "label": "error_fallback",
                "center": {"x": 0.0, "y": 0.0, "z": 0.0},
                "half_extents": {"x": 0.1, "y": 0.1, "z": 0.1},
                "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
                **meta,
            }
        ]
