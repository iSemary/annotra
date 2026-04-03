from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

ASSET_STATUSES = frozenset({"draft", "in_progress", "completed", "reviewed", "failed"})
FILE_TYPES = frozenset({"image", "video", "audio", "dataset"})


class BBox(BaseModel):
    x: float
    y: float
    w: float
    h: float

    @field_validator("w", "h")
    @classmethod
    def positive_wh(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("bbox w and h must be positive")
        return v


class ImageBboxPayload(BaseModel):
    id: str | None = None
    label: str = Field(..., min_length=1, max_length=512)
    bbox: BBox
    member_media_id: UUID | None = None

    def to_storage_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"label": self.label, "bbox": self.bbox.model_dump()}
        if self.id:
            d["id"] = self.id
        if self.member_media_id is not None:
            d["member_media_id"] = str(self.member_media_id)
        return d


class VideoFrameBboxPayload(BaseModel):
    frame: int = Field(..., ge=0)
    label: str = Field(..., min_length=1, max_length=512)
    bbox: BBox

    def to_storage_dict(self) -> dict[str, Any]:
        return {
            "frame": self.frame,
            "label": self.label,
            "bbox": self.bbox.model_dump(),
        }


class TrackFramePoint(BaseModel):
    frame: int = Field(..., ge=0)
    x: float
    y: float


class VideoTrackPayload(BaseModel):
    object_id: str = Field(..., min_length=1, max_length=256)
    label: str = Field(..., min_length=1, max_length=512)
    w: float | None = None
    h: float | None = None
    frames: list[TrackFramePoint] = Field(..., min_length=1)

    @model_validator(mode="after")
    def check_wh(self) -> VideoTrackPayload:
        if self.w is not None and self.w <= 0:
            raise ValueError("w must be positive when set")
        if self.h is not None and self.h <= 0:
            raise ValueError("h must be positive when set")
        return self

    def to_storage_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "object_id": self.object_id,
            "label": self.label,
            "frames": [f.model_dump() for f in self.frames],
        }
        if self.w is not None:
            out["w"] = self.w
        if self.h is not None:
            out["h"] = self.h
        return out


class AudioSegmentPayload(BaseModel):
    id: str | None = None
    start: float = Field(..., ge=0)
    end: float = Field(..., ge=0)
    label: str = Field(..., min_length=1, max_length=512)

    @model_validator(mode="after")
    def check_range(self) -> AudioSegmentPayload:
        if self.end <= self.start:
            raise ValueError("end must be greater than start")
        return self

    def to_storage_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "start": self.start,
            "end": self.end,
            "label": self.label,
        }
        if self.id:
            d["id"] = self.id
        return d


class AnnotationCreateRequest(BaseModel):
    annotation_kind: Literal[
        "image_bbox",
        "video_frame_bbox",
        "video_track",
        "audio_segment",
    ]
    payload: dict[str, Any]

    def parsed_payload(self) -> dict[str, Any]:
        kind = self.annotation_kind
        if kind == "image_bbox":
            return ImageBboxPayload.model_validate(self.payload).to_storage_dict()
        if kind == "video_frame_bbox":
            return VideoFrameBboxPayload.model_validate(self.payload).to_storage_dict()
        if kind == "video_track":
            return VideoTrackPayload.model_validate(self.payload).to_storage_dict()
        if kind == "audio_segment":
            return AudioSegmentPayload.model_validate(self.payload).to_storage_dict()
        raise ValueError(f"Unknown kind {kind}")


class AnnotationPatchRequest(BaseModel):
    annotation_kind: Literal[
        "image_bbox",
        "video_frame_bbox",
        "video_track",
        "audio_segment",
    ] | None = None
    payload: dict[str, Any] | None = None

    def merge_kind_and_payload(
        self,
        current_kind: str,
        current_payload: dict[str, Any],
    ) -> tuple[str, dict[str, Any]]:
        kind = self.annotation_kind or current_kind
        base = dict(current_payload)
        if self.payload is not None:
            base.update(self.payload)
        if kind == "image_bbox":
            return kind, ImageBboxPayload.model_validate(base).to_storage_dict()
        if kind == "video_frame_bbox":
            return kind, VideoFrameBboxPayload.model_validate(base).to_storage_dict()
        if kind == "video_track":
            return kind, VideoTrackPayload.model_validate(base).to_storage_dict()
        if kind == "audio_segment":
            return kind, AudioSegmentPayload.model_validate(base).to_storage_dict()
        raise ValueError(f"Unknown kind {kind}")


class AnnotationAssetCreateRequest(BaseModel):
    project_id: UUID
    file_type: Literal["image", "video", "audio", "dataset"]
    title: str | None = Field(default=None, max_length=512)
    status: str = Field(default="draft")
    primary_media_id: UUID | None = None
    dataset_media_ids: list[UUID] | None = None
    frame_count: int | None = Field(default=None, ge=0)
    duration_seconds: float | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def title_strip_empty(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s if s else None

    @field_validator("status")
    @classmethod
    def status_ok(cls, v: str) -> str:
        if v not in ASSET_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(sorted(ASSET_STATUSES))}")
        return v


class AnnotationAssetPatchRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    status: str | None = None
    frame_count: int | None = Field(default=None, ge=0)
    duration_seconds: float | None = Field(default=None, ge=0)

    @field_validator("status")
    @classmethod
    def status_ok(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in ASSET_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(sorted(ASSET_STATUSES))}")
        return v
