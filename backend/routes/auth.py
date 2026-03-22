from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_settings
from core.cookies import clear_refresh_cookie, set_refresh_cookie
from core.exceptions import AppException
from core.rbac import RequestContext, get_current_context, get_current_context_optional
from db.session import get_async_session
from schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TwoFactorConfirmSetupRequest,
    TwoFactorVerifyLoginRequest,
)
from services.auth_service import AuthService
from services.two_factor_service import TwoFactorService
from utils.responses import success_json

router = APIRouter(prefix="/auth", tags=["auth"])


def _require_two_factor_feature() -> None:
    if not get_settings().TWO_FACTOR_ENABLED:
        raise AppException(
            403,
            "Two-factor authentication is disabled on this server",
        )


@router.get("/public-config")
async def auth_public_config():
    s = get_settings()
    return success_json(
        message="OK",
        data={"two_factor_feature_enabled": s.TWO_FACTOR_ENABLED},
    )


@router.post("/register")
async def register(
    response: Response,
    body: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_async_session)],
):
    svc = AuthService(session)
    data, raw = await svc.register(body)
    set_refresh_cookie(response, raw)
    return success_json(
        message="Registered",
        data=data.model_dump(),
        status_code=201,
    )


@router.post("/login")
async def login(
    response: Response,
    body: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_async_session)],
):
    svc = AuthService(session)
    result = await svc.login(body)
    if isinstance(result, dict):
        return success_json(
            message=str(result.get("message", "Two-factor authentication required")),
            data=result,
        )
    data, raw = result
    set_refresh_cookie(response, raw)
    return success_json(message="Logged in", data=data.model_dump())


@router.get("/me")
async def me(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(get_current_context)],
):
    svc = AuthService(session)
    payload = await svc.get_me(ctx)
    return success_json(message="OK", data=payload)


@router.post("/2fa/setup", dependencies=[Depends(_require_two_factor_feature)])
async def two_factor_setup(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(get_current_context)],
):
    svc = TwoFactorService(session)
    data = await svc.setup(ctx)
    return success_json(message="OK", data=data)


@router.post("/2fa/confirm", dependencies=[Depends(_require_two_factor_feature)])
async def two_factor_confirm(
    body: TwoFactorConfirmSetupRequest,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(get_current_context)],
):
    svc = TwoFactorService(session)
    codes = await svc.confirm_setup(ctx, code=body.code, secret=body.secret)
    return success_json(
        message="Two-factor authentication enabled",
        data={
            "message": "Two-factor authentication enabled",
            "recovery_codes": codes,
        },
    )


@router.post("/2fa/verify", dependencies=[Depends(_require_two_factor_feature)])
async def two_factor_verify_login(
    response: Response,
    body: TwoFactorVerifyLoginRequest,
    session: Annotated[AsyncSession, Depends(get_async_session)],
):
    svc = AuthService(session)
    data, raw = await svc.complete_two_factor_login(body.temp_token, body.code)
    set_refresh_cookie(response, raw)
    return success_json(message="Logged in", data=data.model_dump())


@router.post("/2fa/disable", dependencies=[Depends(_require_two_factor_feature)])
async def two_factor_disable(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(get_current_context)],
):
    svc = TwoFactorService(session)
    await svc.disable(ctx)
    return success_json(message="Two-factor authentication disabled", data={})


@router.get("/2fa/recovery-codes", dependencies=[Depends(_require_two_factor_feature)])
async def two_factor_recovery_codes(
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext, Depends(get_current_context)],
):
    svc = TwoFactorService(session)
    codes = await svc.get_recovery_codes(ctx)
    return success_json(message="OK", data={"recovery_codes": codes})


@router.post("/refresh")
async def refresh_tokens(
    response: Response,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_async_session)],
):
    raw = request.cookies.get(get_settings().REFRESH_COOKIE_NAME)
    svc = AuthService(session)
    data, new_raw = await svc.refresh(raw)
    set_refresh_cookie(response, new_raw)
    return success_json(message="Token refreshed", data=data.model_dump())


@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_async_session)],
    ctx: Annotated[RequestContext | None, Depends(get_current_context_optional)],
):
    raw = request.cookies.get(get_settings().REFRESH_COOKIE_NAME)
    svc = AuthService(session)
    await svc.logout(
        raw,
        actor_user_id=ctx.user_id if ctx else None,
        company_id=ctx.company_id if ctx else None,
    )
    clear_refresh_cookie(response)
    return success_json(message="Logged out", data={})
