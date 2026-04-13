"""Unit tests for ML bbox helpers (no torch)."""

import unittest

from services.ml_inference.mappers import iou_bbox, mask_to_bbox, nms_bboxes


class TestMlMappers(unittest.TestCase):
    def test_mask_to_bbox(self) -> None:
        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy required")
        m = np.zeros((10, 12), dtype=bool)
        m[2:6, 3:9] = True
        b = mask_to_bbox(m)
        assert b is not None
        self.assertEqual(b["x"], 3.0)
        self.assertEqual(b["y"], 2.0)
        self.assertEqual(b["w"], 7.0)
        self.assertEqual(b["h"], 5.0)

    def test_iou_and_nms(self) -> None:
        a = {"x": 0.0, "y": 0.0, "w": 10.0, "h": 10.0}
        b = {"x": 5.0, "y": 5.0, "w": 10.0, "h": 10.0}
        self.assertGreater(iou_bbox(a, b), 0.0)
        items = [
            (a, {"score": 0.9, "id": 1}),
            ({**a, "x": 1.0, "y": 1.0}, {"score": 0.5, "id": 2}),
        ]
        kept = nms_bboxes(items, iou_threshold=0.5)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0][1]["id"], 1)


if __name__ == "__main__":
    unittest.main()
