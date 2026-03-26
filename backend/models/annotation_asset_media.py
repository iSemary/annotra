import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, PrimaryKeyConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base

if TYPE_CHECKING:
    from models.annotation_asset import AnnotationAsset
    from models.media import Media


class AnnotationAssetMedia(Base):
    __tablename__ = "annotation_asset_media"
    __table_args__ = (PrimaryKeyConstraint("asset_id", "media_id"),)

    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("annotation_assets.id", ondelete="CASCADE"),
        nullable=False,
    )
    media_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="CASCADE"),
        nullable=False,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    asset: Mapped["AnnotationAsset"] = relationship(
        "AnnotationAsset",
        back_populates="dataset_members",
    )
    media: Mapped["Media"] = relationship(
        "Media",
        foreign_keys=[media_id],
    )
