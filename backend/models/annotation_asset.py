import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from models.annotation import Annotation
    from models.annotation_asset_media import AnnotationAssetMedia
    from models.media import Media
    from models.project import Project


class AnnotationAsset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "annotation_assets"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    primary_media_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="SET NULL"),
        nullable=True,
    )
    frame_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        index=True,
    )

    project: Mapped["Project"] = relationship(
        "Project",
        foreign_keys=[project_id],
    )
    primary_media: Mapped["Media | None"] = relationship(
        "Media",
        foreign_keys=[primary_media_id],
    )
    dataset_members: Mapped[list["AnnotationAssetMedia"]] = relationship(
        "AnnotationAssetMedia",
        back_populates="asset",
        cascade="all, delete-orphan",
    )
    annotations: Mapped[list["Annotation"]] = relationship(
        "Annotation",
        back_populates="asset",
        cascade="all, delete-orphan",
    )
