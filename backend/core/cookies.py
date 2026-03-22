from fastapi import Response

from core.config import get_settings


def set_refresh_cookie(response: Response, raw_token: str) -> None:
    s = get_settings()
    response.set_cookie(
        key=s.REFRESH_COOKIE_NAME,
        value=raw_token,
        path=s.REFRESH_COOKIE_PATH,
        httponly=True,
        secure=s.COOKIE_SECURE,
        samesite="lax",
        max_age=s.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def clear_refresh_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(
        key=s.REFRESH_COOKIE_NAME,
        path=s.REFRESH_COOKIE_PATH,
    )
