from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import AppException
from core.rbac import RequestContext, get_current_context, require_permission
from db.session import get_async_session
from services.media_service import MediaService, media_to_dict
from utils.responses import success_json

router = APIRouter(prefix="/media", tags=["media"])

_BULK_MAX_FILES = 10


@router.get("")
async def list_my_media(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("media:read"))],
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    kind: str | None = Query(None),
):
    svc = MediaService(session)
    items, meta = await svc.list_for_user(
        ctx.user_id,
        page=page,
        per_page=per_page,
        kind=kind,
    )
    return success_json(
        message="OK",
        data={"items": items},
        pagination=meta,
    )


@router.post("/upload")
async def upload_media(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("media:write"))],
    file: UploadFile = File(...),
):
    body = await file.read()
    if not body:
        raise AppException(400, "No file uploaded")
    mime = file.content_type or "application/octet-stream"
    svc = MediaService(session)
    media = await svc.upload(body, mime, ctx.user_id, file.filename)
    url = await svc.get_url_for_key(media.storage_key)
    return success_json(
        message="File uploaded successfully",
        data=media_to_dict(media, url),
        status_code=201,
    )


@router.post("/upload/bulk")
async def upload_media_bulk(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("media:write"))],
    files: list[UploadFile] = File(...),
):
    if not files:
        raise AppException(400, "No files uploaded")
    if len(files) > _BULK_MAX_FILES:
        raise AppException(400, f"At most {_BULK_MAX_FILES} files allowed")
    tuples: list[tuple[bytes, str, str | None]] = []
    for f in files:
        body = await f.read()
        if not body:
            continue
        mime = f.content_type or "application/octet-stream"
        tuples.append((body, mime, f.filename))
    if not tuples:
        raise AppException(400, "No valid files uploaded")
    svc = MediaService(session)
    media_list = await svc.upload_bulk(tuples, ctx.user_id)
    data = []
    for m in media_list:
        url = await svc.get_url_for_key(m.storage_key)
        data.append(media_to_dict(m, url))
    return success_json(
        message="Files uploaded successfully",
        data=data,
        status_code=201,
    )


@router.get("/{media_id}")
async def get_media(
    media_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("media:read"))],
):
    svc = MediaService(session)
    media = await svc.find_by_id(media_id, ctx.user_id)
    url = await svc.get_url_for_key(media.storage_key)
    return success_json(message="OK", data=media_to_dict(media, url))


@router.delete("/{media_id}")
async def delete_media(
    media_id: UUID,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(require_permission("media:write"))],
):
    svc = MediaService(session)
    await svc.delete(media_id, ctx.user_id)
    return success_json(message="File deleted successfully", data={})
