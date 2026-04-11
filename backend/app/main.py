import logging

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from starlette.staticfiles import StaticFiles

from core.config import get_settings
from core.exceptions import AppException
from core.middleware import RequestLoggingMiddleware
from routes.annotation_assets import router as annotation_assets_router
from routes.auth import router as auth_router
from routes.dashboard import router as dashboard_router
from routes.media import router as media_router
from routes.permissions import router as permissions_router
from routes.projects import router as projects_router
from routes.roles import router as roles_router
from routes.users import router as users_router
from utils.responses import error_json, success_json

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("annotra")


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="Annotra API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        servers=[
            {
                "url": f"http://127.0.0.1:{settings.API_PORT}",
                "description": "Local",
            },
        ],
    )

    application.add_middleware(RequestLoggingMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(AppException)
    async def app_exception_handler(_request, exc: AppException):
        return error_json(
            message=exc.message,
            status_code=exc.status_code,
            errors=exc.errors,
        )

    @application.exception_handler(HTTPException)
    async def http_exception_handler(_request, exc: HTTPException):
        detail = exc.detail
        if isinstance(detail, str):
            return error_json(message=detail, status_code=exc.status_code)
        if isinstance(detail, dict):
            return error_json(
                message=detail.get("message", "Error"),
                status_code=exc.status_code,
                errors=detail.get("errors"),
            )
        return error_json(message=str(detail), status_code=exc.status_code)

    @application.exception_handler(RequestValidationError)
    async def validation_exception_handler(_request, exc: RequestValidationError):
        errors: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(x) for x in err.get("loc", ()) if x != "body"]
            key = ".".join(loc) if loc else "request"
            errors[key] = err.get("msg", "Invalid")
        return error_json(
            message="Validation error",
            status_code=422,
            errors=errors,
        )

    @application.exception_handler(IntegrityError)
    async def integrity_error_handler(request, exc: IntegrityError):
        logger.warning(
            "integrity error path=%s: %s",
            request.url.path,
            exc.orig,
        )
        detail = str(exc.orig) if exc.orig else str(exc)
        low = detail.lower()
        if "ck_annotation_assets_file_type" in low or (
            "annotation_assets" in low
            and ("file_type" in low or "check constraint" in low)
        ):
            return error_json(
                message=(
                    "This database schema does not allow this asset type (often "
                    "`model_3d`). Apply migrations: from the backend directory run "
                    "`alembic upgrade head`, then retry."
                ),
                status_code=400,
            )
        return error_json(
            message="Database constraint violated",
            status_code=400,
        )

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request, exc: Exception):
        logger.exception("unhandled error path=%s", request.url.path)
        return error_json(
            message="Internal server error",
            status_code=500,
        )

    @application.get("/", tags=["health"])
    async def root():
        return success_json(message="OK", data={})

    api = settings.API_V1_PREFIX
    application.include_router(auth_router, prefix=api)
    application.include_router(users_router, prefix=api)
    application.include_router(roles_router, prefix=api)
    application.include_router(permissions_router, prefix=api)
    application.include_router(projects_router, prefix=api)
    application.include_router(dashboard_router, prefix=api)
    application.include_router(media_router, prefix=api)
    application.include_router(annotation_assets_router, prefix=api)

    if settings.MEDIA_STORAGE.lower() != "aws":
        storage_dir = settings.media_local_path_resolved
        storage_dir.mkdir(parents=True, exist_ok=True)
        application.mount(
            "/storage",
            StaticFiles(directory=str(storage_dir)),
            name="storage",
        )

    return application


app = create_app()
