from typing import Annotated

from fastapi import APIRouter, Depends

from core.rbac import RequestContext, require_permission
from services.dashboard_service import DashboardService
from utils.responses import success_json

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def dashboard_summary(
    ctx: Annotated[RequestContext, Depends(require_permission("dashboard:read"))],
):
    data = DashboardService.summary(ctx)
    return success_json(message="OK", data=data)
