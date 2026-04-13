from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.rbac import RequestContext, require_permission
from db.session import get_async_session
from schemas.annotation import (
    AnnotationAssetCreateRequest,
    AnnotationAssetPatchRequest,
    AnnotationCreateRequest,
    AnnotationPatchRequest,
)
from services.annotation_asset_processing import schedule_annotation_asset_pipeline
from services.annotation_asset_service import AnnotationAssetService
from utils.responses import success_json

router = APIRouter(prefix="/annotation-assets", tags=["annotation-assets"])


@router.get("")
async def list_annotation_assets(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
    project_id: Annotated[
        UUID | None,
        Query(description="Filter to one project; omit to list all projects in the company"),
    ] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str | None = Query(
        None,
        description="Matches asset title (case-insensitive) or any annotation payload text",
    ),
    status: str | None = Query(None),
    file_type: str | None = Query(None),
    sort_by: str = Query("updated_at", pattern="^(annotations_count|updated_at|progress)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
):
    svc = AnnotationAssetService(session)
    items, meta = await svc.list_assets(
        ctx,
        project_id=project_id,
        page=page,
        per_page=per_page,
        search=search,
        status=status,
        file_type=file_type,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return success_json(message="OK", data={"items": items}, pagination=meta)


@router.post("")
async def create_annotation_asset(
    background_tasks: BackgroundTasks,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
    body: AnnotationAssetCreateRequest,
):
    svc = AnnotationAssetService(session)
    asset = await svc.create_asset(ctx, body)
    # Persist before the pipeline runs in a separate session (inline mode must see this row).
    await session.commit()
    await schedule_annotation_asset_pipeline(asset.id, background_tasks=background_tasks)
    data = await svc.get_asset(ctx, asset.id)
    return success_json(
        message="Annotation asset created",
        data=data,
        status_code=201,
    )


@router.get("/{asset_id}")
async def get_annotation_asset(
    asset_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
):
    svc = AnnotationAssetService(session)
    data = await svc.get_asset(ctx, asset_id)
    return success_json(message="OK", data=data)


@router.patch("/{asset_id}")
async def patch_annotation_asset(
    asset_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
    body: AnnotationAssetPatchRequest,
):
    svc = AnnotationAssetService(session)
    data = await svc.patch_asset(ctx, asset_id, body)
    return success_json(message="Annotation asset updated", data=data)


@router.delete("/{asset_id}")
async def delete_annotation_asset(
    asset_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
):
    svc = AnnotationAssetService(session)
    await svc.delete_asset(ctx, asset_id)
    return success_json(message="Annotation asset deleted", data={})


@router.get("/{asset_id}/annotations")
async def list_annotations(
    asset_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
):
    svc = AnnotationAssetService(session)
    items = await svc.list_annotations(ctx, asset_id)
    return success_json(message="OK", data={"items": items})


@router.post("/{asset_id}/annotations")
async def create_annotation(
    asset_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
    body: AnnotationCreateRequest,
):
    svc = AnnotationAssetService(session)
    data = await svc.create_annotation(ctx, asset_id, body)
    return success_json(message="Annotation created", data=data, status_code=201)


@router.patch("/{asset_id}/annotations/{annotation_id}")
async def patch_annotation(
    asset_id: UUID,
    annotation_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
    body: AnnotationPatchRequest,
):
    svc = AnnotationAssetService(session)
    data = await svc.patch_annotation(ctx, asset_id, annotation_id, body)
    return success_json(message="Annotation updated", data=data)


@router.delete("/{asset_id}/annotations/{annotation_id}")
async def delete_annotation(
    asset_id: UUID,
    annotation_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
):
    svc = AnnotationAssetService(session)
    await svc.delete_annotation(ctx, asset_id, annotation_id)
    return success_json(message="Annotation deleted", data={})


@router.post("/{asset_id}/re-annotate")
async def re_annotate_annotation_asset(
    asset_id: UUID,
    background_tasks: BackgroundTasks,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
):
    svc = AnnotationAssetService(session)
    data = await svc.re_annotate_with_model(ctx, asset_id)
    await session.commit()
    await schedule_annotation_asset_pipeline(asset_id, background_tasks=background_tasks)
    return success_json(
        message="Re-annotate accepted; model pipeline scheduled",
        data=data,
    )


@router.get("/{asset_id}/export")
async def export_annotation_asset(
    asset_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("projects:read"))],
    export_format: str = Query("json", alias="format"),
):
    svc = AnnotationAssetService(session)
    content_type, filename, body = await svc.export_asset(ctx, asset_id, export_format)
    return Response(
        content=body,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
