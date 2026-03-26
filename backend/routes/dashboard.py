from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.rbac import (
    RequestContext,
    require_any_permission,
    require_permission,
    require_superuser,
)
from db.session import get_async_session
from services.dashboard_service import DashboardService
from services.media_service import MediaService
from utils.responses import success_json

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def dashboard_summary(
    ctx: Annotated[RequestContext, Depends(require_permission("dashboard:read"))],
):
    data = DashboardService.summary(ctx)
    return success_json(message="OK", data=data)


@router.get("/workspace-stats")
async def dashboard_workspace_stats(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[
        RequestContext,
        Depends(require_any_permission("dashboard:read", "projects:read")),
    ],
):
    svc = DashboardService(session)
    data = await svc.workspace_stats(ctx)
    return success_json(message="OK", data=data)


@router.get("/media")
async def dashboard_list_media(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    _ctx: Annotated[RequestContext, Depends(require_superuser)],
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    query: str | None = Query(None),
    user_id: UUID | None = Query(None),
    kind: Literal["all", "image", "video", "audio", "model_3d"] = Query("all"),
):
    svc = MediaService(session)
    items, meta = await svc.list_dashboard(
        page=page,
        per_page=per_page,
        query=query,
        user_id=user_id,
        kind=kind,
    )
    return success_json(
        message="OK",
        data={"items": items},
        pagination=meta,
    )
